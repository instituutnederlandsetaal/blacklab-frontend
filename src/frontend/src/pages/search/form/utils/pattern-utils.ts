
import type { ModuleRootState as ModuleRootStateExplore } from '@/pages/search/form/store/explore-state';
import type * as AppTypes from '@/types/apptypes';

import { applyWithinClauses, parenQueryPartParallel } from '@/shared/blacklab-helpers/cql/bcql-pattern-helpers';
import { getCorrectUiType, uiTypeSupport } from '@/shared/blacklab-helpers/normalize-responses';
import { getParallelFieldParts } from '@/shared/blacklab-helpers/parallel-helper';
import { escapeRegex, tokenizeString, type RegexEscapeOptions } from '@/shared/utils/string-utils';

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
