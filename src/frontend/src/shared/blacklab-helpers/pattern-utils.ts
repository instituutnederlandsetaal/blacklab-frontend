import cloneDeep from 'clone-deep';

import { CqlGenerator } from '@/components/cql/cql-types';
import { getValueFunctions } from '@/components/filters/filterValueFunctions';
import type { ModuleRootState as ModuleRootStateExplore } from '@/features/search/model/form/explore-state';
import type { ModuleRootState as ModuleRootStateFilters } from '@/features/search/model/form/filter-state';
import type { ModuleRootState as ModuleRootStatePatterns } from '@/features/search/model/form/pattern-state';
import type * as AppTypes from '@/types/apptypes';
import { getCorrectUiType, uiTypeSupport } from '@/utils';

import { applyWithinClauses, parenQueryPartParallel } from '@/shared/blacklab-helpers/cql/bcql-pattern-helpers';
import { getParallelFieldParts } from '@/shared/blacklab-helpers/parallel-helper';
import { elementAndAttributeNameFromFilterId } from '@/shared/blacklab-helpers/span-filters-helper';
import { escapeRegex, tokenizeString, unescapeRegex, type RegexEscapeOptions } from '@/shared/utils/string-utils';

/** Turn an annotation object into a "pattern" (cql) string ready for BlackLab. */
export const getAnnotationPatternString = (annotation: AppTypes.AnnotationValue): string[] => {
	const { id, case: caseSensitive, value, type } = annotation;

	if (!value.trim()) {
		return [''];
	}

	switch (type) {
		case 'pos':
			// already valid cql, no escaping or wildcard substitution.
			return [value];
		case 'select':
			return [`${id}="${escapeRegex(value.trim())}"`];
		case 'text':
		case 'lexicon':
		case 'combobox': {
			// if multiple tokens, split on quotes (removing them), and whitespace outside quotes, and then transform
			// the values individually
			const regexOptions = { escapePipes: false, escapeWildcards: false };
			let resultParts = tokenizeString(value, true).map(v => escapeRegex(v.value, regexOptions));
			if (caseSensitive) {
				resultParts = resultParts.map(v => `(?-i)${v}`);
			}

			return resultParts.map(word => `${id}="${word}"`);
		}
		default:
			throw new Error('Unimplemented cql serialization for annotation type ' + type);
	}
};

export const getPatternString = (
	annotations: AppTypes.AnnotationValue[],
	withinClauses: Record<string, Record<string, any>>,
	/**
	 * Ids of the annotated fields the query should target (for parallel corpora).
	 * Note that the generated query will only contain the version suffix, not the full field id.
	 */
	parallelTargetFields: string[] = [],
	alignBy?: string,
) => {
	const tokens = [] as string[][];

	annotations.forEach(annot =>
		getAnnotationPatternString(annot).forEach((value, index) => {
			(tokens[index] = tokens[index] || []).push(value);
		}),
	);

	let query = tokens.map(t => `[${t.join('&')}]`).join('');

	query = applyWithinClauses(query, withinClauses);

	if (parallelTargetFields.length > 0) {
		const relationType = alignBy ?? '';
		query =
			`${parenQueryPartParallel(query)}` +
			parallelTargetFields
				.map(v => {
					const targetVersion = getParallelFieldParts(v).version;
					const targetQuery = parenQueryPartParallel(applyWithinClauses('_', withinClauses));
					return ` =${relationType}=>${targetVersion}? ${targetQuery}`;
				})
				.join(' ; ');
	}

	return query || undefined;
};

export function getPatternStringExplore(subForm: keyof ModuleRootStateExplore, state: ModuleRootStateExplore, annots: Record<string, AppTypes.NormalizedAnnotation>): string | undefined {
	switch (subForm) {
		case 'corpora':
			return undefined;
		case 'frequency':
			return '[]';
		case 'ngram':
			return (
				state.ngram.tokens
					.slice(0, state.ngram.size)
					// type select because we only ever want to output one cql token per n-gram input
					.map(token => {
						const tokenType = annots[token.id].uiType;
						const correctedType = getCorrectUiType(uiTypeSupport.explore.ngram, tokenType);

						const escapeSettings: RegexEscapeOptions = {
							escapePipes: correctedType === 'select',
							escapeWildcards: correctedType === 'select',
						};
						return token.value ? `[${token.id}="${escapeRegex(token.value, escapeSettings)}"]` : '[]';
					})
					.join('')
			);
		default:
			throw new Error('Unknown submitted form - cannot generate cql query');
	}
}

export function getPatternSummaryExplore<K extends keyof ModuleRootStateExplore>(subForm: K, state: ModuleRootStateExplore, annots: Record<string, AppTypes.NormalizedAnnotation>): string | undefined {
	switch (subForm) {
		case 'corpora':
			return undefined;
		case 'frequency':
			return `${annots[state.frequency.annotationId].defaultDisplayName} frequency`;
		case 'ngram':
			return `${annots[state.ngram.groupAnnotationId].defaultDisplayName} ${state.ngram.size}-grams`;
		default:
			return undefined;
	}
}

export const getPatternStringFromCql = (sourceCql: string, withinClauses: Record<string, Record<string, any>>, targetVersions: string[], targetCql: string[], alignBy?: string | null) => {
	if (targetVersions.length > targetCql.length) {
		console.error('There must be a CQL query for each selected parallel version!', targetVersions, targetCql);
		throw new Error(`There must be a CQL query for each selected parallel version!`);
	}

	if (targetVersions.length === 0) {
		return applyWithinClauses(sourceCql, withinClauses);
	}

	const defaultSourceQuery = targetVersions.length > 0 ? '_' : '';
	const sourceQuery = applyWithinClauses(sourceCql.trim() || defaultSourceQuery, withinClauses);
	const queryParts = [parenQueryPartParallel(sourceQuery)];
	const relationType = alignBy ?? '';
	for (let i = 0; i < targetVersions.length; i++) {
		if (i > 0) queryParts.push(' ; ');
		const targetVersion = getParallelFieldParts(targetVersions[i]).version;
		const targetQuery = parenQueryPartParallel(applyWithinClauses(targetCql[i].trim() || '_', withinClauses));
		queryParts.push(` =${relationType}=>${targetVersion}? ${targetQuery}`);
	}

	const query = queryParts.join('');

	return query;
};

export function getPatternStringSearch(subForm: keyof ModuleRootStatePatterns, state: ModuleRootStatePatterns, defaultAlignBy: string, filtersState: ModuleRootStateFilters): string | undefined {
	// For the normal search form,
	// the simple and extended views require the values to be processed before converting them to cql.
	// The advanced and expert views already contain a good-to-go cql query. We only need to take care not to emit an
	// empty string.
	const alignBy = state.shared.alignBy || defaultAlignBy;
	const targets = state.shared.targets || [];

	// Derive within clauses from filters
	const [withinClauses, withinClausesNoWithinWidget] = getWithinClausesFromFilters(filtersState, state);

	switch (subForm) {
		case 'simple':
			const q = state.simple.annotationValue.value ? [state.simple.annotationValue] : [];
			return q.length ? getPatternString(q, {}, targets, alignBy) : undefined;
		case 'extended': {
			const r = cloneDeep(Object.values(state.extended.annotationValues))
				.filter(annot => !!annot.value)
				.map(annot => ({
					...annot,
					type: getCorrectUiType(uiTypeSupport.search.extended, annot.type!),
				}));
			return r.length || Object.keys(withinClauses).length > 0 ? getPatternString(r, withinClauses, targets, alignBy) : undefined;
		}
		case 'advanced':
			const sourceQuery = state.advanced?.query && CqlGenerator.rootCql(state.advanced.query);
			if (!sourceQuery) return undefined;
			return getPatternStringFromCql(sourceQuery, withinClauses, targets, state.advanced?.targetQueries.map(tq => CqlGenerator.rootCql(tq)).filter(q => q != null) ?? [], alignBy);
		case 'expert':
			return getPatternStringFromCql(state.expert.query || '', withinClausesNoWithinWidget, targets, state.expert.targetQueries, alignBy);
		default:
			throw new Error('Unimplemented pattern generation.');
	}
}

export function getPatternSummarySearch<K extends keyof ModuleRootStatePatterns>(subForm: K, state: ModuleRootStatePatterns, defaultAlignBy: string, filterState: ModuleRootStateFilters) {
	return getPatternStringSearch(subForm, state, defaultAlignBy, filterState);
}

/** Derive within clauses from filters and the within widget (on the left), if any */
export function getWithinClausesFromFilters(filtersState: ModuleRootStateFilters, patternState: ModuleRootStatePatterns) {
	const withinClauses: Record<string, Record<string, any>> = {};
	Object.entries(filtersState).forEach(([id, filterState]) => {
		const vf = getValueFunctions(filterState);
		if (vf.isSpanFilter) {
			const [elName, attrName] = elementAndAttributeNameFromFilterId(id);
			withinClauses[elName] = withinClauses[elName] || {};
			const value =
				typeof filterState.value === 'string'
					? escapeRegex(filterState.value, { escapeWildcards: false })
					: Array.isArray(filterState.value)
						? (filterState.value as string[]).map(v => escapeRegex(v, { escapeWildcards: false })).join('|')
						: filterState.value;
			withinClauses[elName][attrName] = value;
		}
	});

	// We need these for the Expert view, which doesn't have a within widget.
	const withinClausesNoWithinWidget = cloneDeep(withinClauses);

	const withinEl = patternState.shared.within;
	if (withinEl) {
		// Add within clause plus any attribute from the within widget as well.
		const withinAttr = Object.fromEntries(Object.entries(patternState.shared.withinAttributes).map(([k, v]) => [k, escapeRegex(v, { escapeWildcards: false })])); // wildcards->regex
		withinClauses[withinEl] = {
			...withinClauses[withinEl],
			...withinAttr,
		};
	}
	return [withinClauses, withinClausesNoWithinWidget];
}

/**
 * Decode a value as passed to BlackLab back into a value for the UI.
 * @param value the value to be parsed
 * @param type the type that the value should be parsed to, see uiType in the annotation object. Different annotation search widgets have different escaping properties (i.e. can they contain multiple values, or just one, etc.)
 */
export const decodeAnnotationValue = (value: string | string[], type: Required<AppTypes.AnnotationValue>['type']): { case: boolean; value: string } => {
	function isCase(v: string) {
		return v.startsWith('(?-i)') || v.startsWith('(?c)');
	}
	function stripCase(v: string) {
		return v.substr(v.startsWith('(?-i)') ? 5 : 4);
	}
	switch (type) {
		case 'text':
		case 'lexicon':
		case 'combobox': {
			let caseSensitive = false;
			const annotationValue = [value]
				.flat()
				.map(v => {
					if (isCase(v)) {
						v = stripCase(v);
						caseSensitive = true;
					}
					v = unescapeRegex(v, { escapePipes: false, escapeWildcards: false });
					// Only surround with quotes when we're joining multiple values into one string and this sub-value contains whitespace
					return Array.isArray(value) && v.match(/\s+/) ? `"${v}"` : v;
				})
				.join(' ');

			return {
				case: caseSensitive,
				value: annotationValue,
			};
		}
		case 'select': {
			value = Array.isArray(value) ? value[0] : value;
			const caseSensitive = isCase(value);
			value = caseSensitive ? stripCase(value) : value;
			value = unescapeRegex(value);
			return {
				case: caseSensitive,
				value,
			};
		}
		case 'pos': // pos is handled separately (url-state-parser)
		default:
			throw new Error('Unimplemented uitype query decoder');
	}
};
