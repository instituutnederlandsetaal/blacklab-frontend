import cloneDeep from 'clone-deep';
import LuceneQueryParser from 'lucene-query-parser';
import memoize from 'memoize-decorator';

import { getValueFunctions } from '@/components/filters/filterValueFunctions';
import type { Customizations } from '@/customization-api/internal/internal-api';
import type * as TagsetModule from '@/features/corpus/model/tagset-state';
import type { CqlQueryBuilderData } from '@/features/cql-query-builder/model';
import { getQueryBuilderStateFromParsedQuery } from '@/features/cql-query-builder/model';
// Form
import * as ExploreModule from '@/features/search/model/form/explore-state';
import type * as FilterModule from '@/features/search/model/form/filter-state';
import type { ModuleRootState as FormState } from '@/features/search/model/form/form-state';
import * as GapModule from '@/features/search/model/form/gap-state';
import * as InterfaceModule from '@/features/search/model/form/interface-state';
import type * as PatternModule from '@/features/search/model/form/pattern-state';
// Results
import type { GroupDisplayMode } from '@/features/search/model/results/result-types';
import type { SubmittedSearch } from '@/features/search/model/submitted-search';
import type { Corpus } from '@/types/apptypes';
import type { AnnotationValue, FilterValue } from '@/types/apptypes';
import { getCorrectUiType, uiTypeSupport } from '@/utils';
import parseLucene from '@/utils/luceneparser';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import type { Condition, Result, Token } from '@/shared/blacklab-helpers/cql/bcql-json-interpreter';
import { parseBcql } from '@/shared/blacklab-helpers/cql/bcql-json-interpreter';
import { unparenQueryPart, applyWithinClauses } from '@/shared/blacklab-helpers/cql/bcql-pattern-helpers';
import { getParallelFieldName } from '@/shared/blacklab-helpers/parallel-helper';
import { decodeAnnotationValue } from '@/shared/blacklab-helpers/pattern-utils';
import { spanFilterId } from '@/shared/blacklab-helpers/span-filters-helper';
import { debugLog } from '@/shared/debug/debug';
import { mapReduce } from '@/shared/utils/array-utils';
import { unescapeRegex } from '@/shared/utils/string-utils';

export type LegacyFormDependencies = {
	blacklabApi: BlackLabApi;
	corpus: Corpus;
	filterState: FilterModule.FullModuleRootState;
	tagsetState: TagsetModule.ModuleRootState;
	customizations: Customizations;
};

export type LegacyFormInput = {
	submitted: SubmittedSearch;
	viewedResults: string | null;
	groupBy: string[];
	groupDisplayMode: GroupDisplayMode | null;
};

/** Reconstruct legacy editable fields from a submitted search and its result presentation. */
export class LegacyFormRestorer {
	constructor(
		private readonly dependencies: LegacyFormDependencies,
		private readonly input: LegacyFormInput,
	) {
		this._interfaceState = input.submitted.legacyInterface ? { ...input.submitted.legacyInterface } : null;
	}

	@memoize
	public async get(): Promise<FormState> {
		// Make sure our parsed cql is up to date (used to be a memoized getter, but we need it to be async)
		await this.updateParsedCql(this.input.submitted.params.patt ?? null);

		return {
			explore: this.explore,
			filters: this.filters,
			interface: this.interface,
			patterns: this.patterns,
			gap: this.gap,
		};
	}

	@memoize
	private get explore(): ExploreModule.ModuleRootState {
		return {
			frequency: this.frequencies || ExploreModule.defaults.frequency,
			ngram: this.ngrams || ExploreModule.defaults.ngram,
			corpora: this.corpora || ExploreModule.defaults.corpora,
		};
	}

	/** Within clauses that can be added to a span filter widget (on the right)
	 *  (and are not already in the within widget on the left)
	 */
	@memoize
	get spanFilters(): Record<string, FilterValue> {
		const result: Record<string, FilterValue> = {};
		const filters = this.dependencies.filterState.filters;
		Object.entries(this.withinClauses)
			.flatMap(([elName, attrs]) => Object.entries(attrs).map(([attrName, attrValue]) => [elName, attrName, attrValue] as [string, string, any]))
			// Now we have pairs of [elementname, attributename, attributevalue(s)] e.g. [speech, person, Einstein] for <speech person="Einstein"/>
			.forEach(([elName, attrName, attrValue]) => {
				const id = spanFilterId(elName, attrName);
				const filter = filters[id];
				const vf = filter && getValueFunctions(filter);
				// strange, no filter has been created for this (or it's not a span - then why are we here?), skip it ??
				if (!filter || !vf?.isSpanFilter) {
					console.error(`Expected to find a span filter for within clause ${elName} with attribute ${attrName}, but did not (filter id ${id}). This part of the query will be ignored.`, filters);
					return;
				}

				// TODO why are we decoding this here..
				// This logic should live either in the query preprocessing (cql-interpreter)
				// or in the filtervaluefunctions (probably in the bcql-interpreter though)
				let values: string[];
				if (typeof attrValue === 'string') {
					if (filter.componentName === 'filter-select') {
						// select, decode options
						values = attrValue.split('|').map(v => unescapeRegex(v, { escapeWildcards: false }));
					} else {
						// text
						values = [unescapeRegex(attrValue, { escapeWildcards: false })];
					}
				} else if (attrValue.low || attrValue.high) {
					values = [attrValue.low || '', attrValue.high || ''];
				} else {
					values = [attrValue];
				}
				result[id] = { id, values };
			});

		return result;
	}

	/** Within clauses that don't fit into a widget, so must remain part of the Expert query */
	@memoize
	get withinClausesWithoutSpanFilters(): Record<string, Record<string, any>> {
		const clauses: Record<string, Record<string, any>> = {};
		for (const [spanName, attrs] of Object.entries(this.withinClauses)) {
			const remaining = Object.fromEntries(
				Object.entries(attrs).filter(([attrName]) => {
					const filter = this.dependencies.filterState.filters[spanFilterId(spanName, attrName)];
					return !filter || !getValueFunctions(filter).isSpanFilter;
				}),
			);
			// Bare spans remain within-widget candidates; omit spans fully represented by filters.
			if (!Object.keys(attrs).length || Object.keys(remaining).length) clauses[spanName] = remaining;
		}
		return clauses;
	}

	@memoize
	private get filters(): FilterModule.ModuleRootState {
		const luceneString = this.input.submitted.params.filter;
		const spanFilters = this.spanFilters;
		if (luceneString == null && Object.keys(spanFilters).length === 0) {
			return {};
		}

		try {
			const metadataFields = this.dependencies.corpus.allMetadataFieldsMap;
			const filterDefinitions = this.dependencies.filterState.filters;
			/*
				IMPORTANT: every metadata field has a corresponding filter instance,
				but in addition to that, there might be special filters that don't correspond directly 1-to-1 to a metadata field,
				e.g. date-based filters that operate on separate day/month/year fields.
				Those special filters need to be parsed first, so they can remove any values from the parsed query
				Otherwise those values would be parsed again by the "normal" filters, leading to duplicate filters in the restored state.

				To do this, we create a list of all "special" filters, followed by all "normal" filters.
				They then get a chance to parse/modify the query in that order.
				This way, "special" filters can remove values from the query before "normal" filters get to see them.

				NOTE: we explicitly allow putting values even in invisible filters (i.e. we don't check whether they're shown in the UI)
				This to be flexible for inbound links for other applications.
			*/
			const allFilters = Object.keys(filterDefinitions).sort((a, b) => (!metadataFields[a] ? -1 : !metadataFields[b] ? 1 : 0));

			const filterValues: Record<string, FilterModule.FullFilterState> = {};

			const luceneQueryAST = luceneString ? LuceneQueryParser.parse(luceneString) : null;
			const parsedQuery: Record<string, FilterValue> = {
				...(luceneString ? mapReduce(parseLucene(luceneString), 'id') : {}),
				...this.spanFilters, // also include span filters like "within <speech person='Einstein'/>"
			};
			allFilters
				.map(id => filterDefinitions[id])
				.forEach(filterDefinition => {
					const valueFuncs = getValueFunctions(filterDefinition);
					let value: unknown = valueFuncs.decodeInitialState ? valueFuncs.decodeInitialState(filterDefinition.id, filterDefinition.metadata, parsedQuery, luceneQueryAST) : null;

					if (value) {
						filterValues[filterDefinition.id] = {
							...filterDefinition,
							value,
						};
					}
				});
			return filterValues;
		} catch (error) {
			debugLog('form', 'Cannot decode lucene query ', luceneString, error);
			return {};
		}
	}

	/**
	 * Return the frequency form state, if the query fits in there in its entirity.
	 * Null is returned otherwise.
	 */
	@memoize
	private get frequencies(): null | ExploreModule.ModuleRootState['frequency'] {
		if (this.expertPattern.query !== '[]' || this.input.groupBy.length !== 1) {
			return null;
		}

		const group = this.input.groupBy[0];
		if (!group.startsWith('hit:')) {
			return null;
		}

		const annotationId = group.substring(4);
		if (!this.dependencies.corpus.allAnnotationsMap.hasOwnProperty(annotationId)) {
			return null;
		}

		return { annotationId };
	}

	@memoize
	private get interface(): InterfaceModule.ModuleRootState {
		try {
			const savedInterface = this._interfaceState;
			if (!savedInterface) {
				throw new Error('No saved interface; infer it from the submitted query.');
			}
			if (!this.dependencies.customizations.searchFormAdvancedEnabled() && savedInterface.form === 'search' && savedInterface.patternMode === 'advanced') {
				savedInterface.patternMode = 'expert';
			}
			return {
				...InterfaceModule.defaults,
				...savedInterface,
				viewedResults: this.input.viewedResults,
			};
		} catch {
			// Infer the form that can represent the submitted query.
			const ui = { ...InterfaceModule.defaults };

			// show the pattern view that can hold the query
			// the other views will have the query placed in it as well (if it fits), but this is more of a courtesy
			// if no pattern exists, show the simplest search
			const hasFilters = Object.keys(this.filters).length > 0;
			const hasGapValue = !!this.gap.value; // Only supported for expert view for, prevent setting anything else for now
			let fromPattern = true; // is interface state actually from the pattern, or from the default fallback?
			if (this.simplePattern && !hasFilters && !hasGapValue) {
				ui.patternMode = 'simple';
			} else if (this.extendedPattern && !hasGapValue) {
				ui.patternMode = 'extended';
			} else if (this.advancedPattern?.query.tokens.length && !hasGapValue && this.dependencies.customizations.searchFormAdvancedEnabled()) {
				ui.patternMode = 'advanced';
			} else if (this.expertPattern.query) {
				ui.patternMode = 'expert';
			} else {
				ui.patternMode = hasFilters ? (hasGapValue ? 'expert' : 'extended') : 'simple';
				fromPattern = false;
			}

			// Open any results immediately?
			ui.viewedResults = this.input.viewedResults;

			// Explore forms have priority over normal search form
			if (this.frequencies != null) {
				ui.form = 'explore';
				ui.exploreMode = 'frequency';
			} else if (this.ngrams != null && !(fromPattern && ui.patternMode === 'simple')) {
				ui.form = 'explore';
				ui.exploreMode = 'ngram';
			} else if (this.corpora != null) {
				ui.form = 'explore';
				ui.exploreMode = 'corpora';
			}

			return ui;
		}
	}

	@memoize
	private get gap(): GapModule.ModuleRootState {
		const value = this.input.submitted.params.pattgapdata;
		return value ? { value } : GapModule.defaults;
	}

	/**
	 * Return the ngram form state, if the query fits in there in its entirity.
	 * Null is returned otherwise.
	 */
	@memoize
	private get corpora(): null | ExploreModule.ModuleRootState['corpora'] {
		if (this.input.viewedResults !== 'docs') {
			return null;
		}

		if (this.input.groupBy.length === 0) {
			return null;
		}

		if (this.expertPattern.query) {
			return null;
		}

		return {
			groupBy: this.input.groupBy[0],
			groupDisplayMode: this.input.groupDisplayMode || ExploreModule.defaults.corpora.groupDisplayMode,
		};
	}

	/**
	 * Return the ngram form state, if the query fits in there in its entirity.
	 * Null is returned otherwise.
	 */
	@memoize
	private get ngrams(): null | ExploreModule.ModuleRootState['ngram'] {
		const allAnnotations = this.dependencies.corpus.allAnnotationsMap;

		if (this.input.groupBy.length === 0) {
			return null;
		}

		const group = this.input.groupBy[0];
		if (!group.startsWith('hit:')) {
			return null;
		}

		const groupAnnotationId = group.substring(4);
		if (!allAnnotations[groupAnnotationId]) {
			return null;
		}

		if (this._parsedCql == null || this._parsedCql.length > 1) return null; // no query, or parallel query; can't interpret as ngram

		const cql = this._parsedCql[0];
		if (
			// all tokens need to be very simple [annotation="value"] tokens.
			!cql ||
			(cql.withinClauses && Object.keys(cql.withinClauses).length > 0) ||
			cql.targetVersion ||
			cql.tokens === undefined ||
			cql.tokens.length > ExploreModule.defaults.ngram.maxSize ||
			cql.tokens.find(
				t =>
					t.leadingXmlTag != null ||
					t.trailingXmlTag != null ||
					(t.repeats != null && (t.repeats.min !== 1 || t.repeats.max !== 1)) ||
					t.optional ||
					(t.expression != null && (t.expression.type !== 'condition' || t.expression.operator !== '=')),
			) != null
		) {
			return null;
		}

		// Alright, seems we're all good.
		const defaultNgramTokenAnnotation = ExploreModule.defaults.ngram.tokens[0].id;
		return {
			groupAnnotationId,
			maxSize: ExploreModule.defaults.ngram.maxSize,
			size: cql.tokens.length,
			tokens: cql.tokens.map(t => {
				const valueAnnotationId = t.expression ? (t.expression as Condition).name : defaultNgramTokenAnnotation;
				const type = getCorrectUiType(uiTypeSupport.explore.ngram, allAnnotations[valueAnnotationId].uiType);

				return {
					// when expression is undefined, the token was just '[]' in the query, so set it to defaults.
					id: valueAnnotationId,
					value: t.expression ? decodeAnnotationValue((t.expression as Condition).value, type).value : '',
				};
			}),
		};
	}

	@memoize
	private get patterns(): PatternModule.ModuleRootState {
		return {
			shared: this.shared,
			simple: this.simplePattern || { annotationValue: { id: '', value: '', case: false } },
			extended: this.extendedPattern || { annotationValues: {} },
			advanced: this.advancedPattern || { query: '', targetQueries: [] },
			expert: this.expertPattern,
		};
	}

	@memoize
	private get annotationValues(): { [key: string]: AnnotationValue } | undefined {
		if (this._parsedCql === null) {
			return undefined; // no query; can't interpret as annotation values
		}

		const result = this._parsedCql[0];
		if (result == null || result.tokens === undefined) {
			return undefined;
		}

		// How we parse the cql pattern depends on whether a tagset is available for this corpus, and whether it's enabled in the ui
		const tagsetState = this.dependencies.tagsetState;
		const tagsetInfo = tagsetState
			? {
					mainAnnotations: this.dependencies.corpus.allAnnotations.filter(a => a.uiType === 'pos').map(a => a.id),
					subAnnotations: Object.keys(tagsetState.subAnnotations),
				}
			: null;

		try {
			/**
			 * A requirement of the PropertyFields/Annotations is that there are no gaps in the values
			 * So a valid config is
			 * ```
			 * lemma: [these, are, words]
			 * word: [these, are, other, words]
			 * ```
			 * And an invalid config is
			 * ```
			 * lemma: [gaps, are, , not, allowed]
			 * ```
			 * Not all properties need to have the same number of values though,
			 * shorter lists are implicitly treated as having wildcards for the remainder of values. (see getPatternString())
			 *
			 * Store the values here while parsing.
			 */
			const knownAnnotations = this.dependencies.corpus.allAnnotationsMap;

			const annotationValues: { [key: string]: string[] } = {};
			for (let i = 0; i < result.tokens.length; ++i) {
				const token: Token = result.tokens[i];
				if (token.leadingXmlTag || token.optional || token.repeats || token.trailingXmlTag) {
					throw new Error('Token contains settings too complex for simple search');
				}

				// Use a stack instead of direct recursion to simplify code
				const stack = token.expression ? [token.expression] : [];
				while (stack.length) {
					const expr = stack.shift()!;
					if (expr.type === 'condition') {
						const name = expr.name;
						if (knownAnnotations[name] == null) {
							debugLog('form', `Encountered unknown cql field ${name} while restoring the query, ignoring.`);
							continue;
						}

						const isMainTagsetAnnotation = tagsetInfo && tagsetInfo.mainAnnotations.includes(name);
						const isTagsetAnnotation = isMainTagsetAnnotation || (tagsetInfo && tagsetInfo.subAnnotations.includes(name));

						if (isTagsetAnnotation) {
							// add value as original cql-query substring to the main tagset annotation under which the values should be stored.
							debugLog('form', 'Relocating value for annotation ' + name + ' to tagset annotation(s) ' + tagsetInfo!.mainAnnotations);
							const originalValue = `${name}="${expr.value}"`;

							for (const id of tagsetInfo!.mainAnnotations) {
								const valuesForAnnotation = (annotationValues[id] = annotationValues[id] || []);
								// keep main annotation at the start
								if (isMainTagsetAnnotation) valuesForAnnotation.unshift(originalValue);
								else valuesForAnnotation.push(originalValue);
							}
						} else {
							// otherwise just store wherever it should be in the store.
							const values = (annotationValues[name] = annotationValues[name] || []);
							if (expr.operator !== '=') {
								throw new Error(`Unsupported comparator for property ${name} on token ${i} for query ${this.expertPattern.query}, only "=" is supported.`);
							}
							if (values.length !== i) {
								throw new Error(`Property ${name} contains gaps in value for query ${this.expertPattern.query}`);
							}
							values.push(expr.value);
						}
					} else if (expr.type === 'booleanOp') {
						if (expr.operator !== '&') {
							throw new Error(`Properties on token ${i} are combined using unsupported operator ${expr.operator} in query ${this.expertPattern.query}, only AND/& operator is supported.`);
						}

						stack.push(...expr.clauses);
					}
				}
			}

			// Now we have extracted all raw cql-escaped values for all annotations, and validated the shape of the query
			// decode the values back into their textual representation (i.e. without regex escaping joined back into a single string and such)
			const decodedValues = Object.entries(annotationValues).map(([id, values]) => {
				const annot = knownAnnotations[id];
				if (tagsetInfo && tagsetInfo.mainAnnotations.includes(id)) {
					// use value as-is, already contains cql and should not have wildcards substituted.
					debugLog('form', 'Mapping tagset annotation back to cql: ' + id + ' with values ' + values);

					return {
						id,
						case: false,
						value: values.join('&'),
					};
				}

				return {
					id,
					...decodeAnnotationValue(values, annot.uiType),
				};
			});
			return mapReduce(decodedValues, 'id');
		} catch (error) {
			debugLog('form', 'Cql query could not be placed in simple/extended view', error);
			return undefined;
		}
	}

	@memoize
	private get withinElementName(): string | null {
		// Determine selected option in within widget from within clauses in the query
		// Note that the first withinOption we find that is in withinClauses is assumed to be the
		// selected within option.
		// FIXME: It's possible that we select the wrong withinOption this way. If we do, and there's
		// no span filter widget to populate with what would have been the correct within option, that
		// part of the query gets dropped on page reload, breaking the user's query...
		// Complex additional logic might improve this slightly, but the real fix is to change the URL to describe
		// the frontend's interface state, not the query we send to BLS.
		const withinOptions = this.dependencies.customizations.searchFormWithinEnabled() ? this.dependencies.customizations.searchFormWithinOptions().options : [];
		return withinOptions.find(opt => !!this.withinClausesWithoutSpanFilters[opt.value])?.value ?? null;
	}

	@memoize
	private get withinAttributes(): Record<string, any> {
		// Find any attributes for the within widget
		const within = this.withinElementName;
		const allAttributes = within ? (this.withinClausesWithoutSpanFilters[within] ?? {}) : {};

		// Which, if any, attribute filter fields should be displayed for this element?
		const accepted = within ? this.dependencies.customizations.searchFormWithinAttributes(within) : [];
		return Object.fromEntries(
			Object.entries(allAttributes)
				.filter(([name]) => accepted.includes(name))
				.map(([name, value]) => [name, unescapeRegex(value, { escapeWildcards: false })]),
		);
	}

	@memoize
	private get expertWithinClauses(): Record<string, Record<string, any>> {
		// Remove whatever goes into the within widget from the withinClauses.
		const within = this.withinElementName;
		const withinAttributes = this.withinAttributes;
		return Object.fromEntries(
			Object.entries(this.withinClausesWithoutSpanFilters).map(([el, attr]) => {
				if (el === within) {
					// Remove attributes that are already in the within widget
					Object.keys(withinAttributes).forEach(attrName => delete attr[attrName]);
				}
				return [el, attr];
			}),
		) as Record<string, Record<string, any>>;
	}

	/** Parallel and within searching. This is global between the simple/extended etc. search forms. */
	@memoize
	private get shared() {
		// The query typically doesn't contain the entire parallel field name.
		// BlackLab allows passing just "en" instead of "contents__en" in some spots
		// So we need to reconstruct the full field name from the query here.
		const prefix = this.dependencies.corpus.parallelFieldPrefix;

		const parallelFieldsMap = this.dependencies.corpus.parallelAnnotatedFieldsMap;

		/*
		In our state, "source" is the field we're searching in.
		The field we're viewing (in article/document view) is "viewField".

		In BlackLab, it can be either "field" or "searchfield", where "searchfield" overrides "field" if set.
		We only pass "searchfield" if we're viewing a document in a different parallel version/field than we searched in.
		Which means that if "searchfield" is set, we should use that. If not, we should use "field".
		See also "viewField" in the article module (which is "field" in BlackLab terms.)
		*/
		let source = this.input.submitted.params.searchfield ?? null;
		if (source && !parallelFieldsMap[source]) source = null;
		const targets = this._parsedCql ? this._parsedCql.slice(1).map(result => (result.targetVersion ? getParallelFieldName(prefix, result.targetVersion) : '')) : [];

		// Determine align by (relation type in BCQL query, e.g. for "the" -word-alignment->nl _ it would be "word-alignment")
		const defaultAlignBy = this.dependencies.customizations.searchFormAlignByDefault();
		const alignBy = (this._parsedCql ? this._parsedCql[1]?.relationType : defaultAlignBy) ?? defaultAlignBy;

		return {
			source,
			targets,
			alignBy,
			within: this.withinElementName,
			withinAttributes: this.withinAttributes,
		};
	}

	@memoize
	private get simplePattern(): { annotationValue: AnnotationValue } | undefined {
		// Simple view is just a single annotation without any within query or filters
		// NOTE: do not use extendedPattern, as the annotation used for simple may not be available for extended searching!\
		const id = this.dependencies.customizations.searchFormSimpleAnnotation().id;
		if (!this.annotationValues?.[id]) return undefined;
		return {
			annotationValue: this.annotationValues[id],
		};
	}

	@memoize
	private get extendedPattern() {
		const annotationIds = this.dependencies.customizations.searchFormExtendedAnnotationIds();
		const parsedAnnotationValues = cloneDeep(Object.fromEntries(Object.entries(this.annotationValues ?? {}).filter(([id]) => annotationIds.includes(id))));

		if (Object.keys(parsedAnnotationValues).length === 0) return undefined;
		return {
			annotationValues: parsedAnnotationValues,
		};
	}

	@memoize
	private get advancedPattern(): {
		query: CqlQueryBuilderData;
		targetQueries: CqlQueryBuilderData[];
	} {
		return getQueryBuilderStateFromParsedQuery(this._parsedCql || []);
	}

	@memoize
	private get expertPattern() {
		// Strip any withinClauses from the end of the CQL query,
		// then add back only those that we cannot place into a widget.
		const processQueryPart = (r: Result) => {
			const hasWithinClauses = r.withinClauses && Object.keys(r.withinClauses).length > 0;
			const rawQuery = r.query ?? '';
			const queryWithoutWithins = hasWithinClauses ? unparenQueryPart(rawQuery)!.replace(/(?:\s*(?:within|overlap)?\s*<[^/]+\/>)+$/g, '') : rawQuery;
			const query = unparenQueryPart(queryWithoutWithins);
			const reapplyWithins = this.expertWithinClauses;
			const finalQuery = Object.keys(reapplyWithins).length > 0 ? applyWithinClauses(query ?? '', reapplyWithins) : query;

			return finalQuery;
		};

		// In parallel queries, if any of the queries amounts to "zero or more of any token",
		// just leave it empty.
		const isParallel = (this._parsedCql?.length ?? 0) > 1;
		const optEmpty = (q: string | undefined) => (isParallel && (q === undefined || q === '_' || q === '[]*' || q === '[]+') ? '' : q);
		return {
			query: this._parsedCql ? optEmpty(unparenQueryPart(processQueryPart(this._parsedCql?.[0] ?? {}))) || null : null,
			targetQueries: this._parsedCql ? this._parsedCql.slice(1).map(r => optEmpty(unparenQueryPart(processQueryPart(r))) || '') : [],
		};
	}

	// TODO these might become dynamic in the future, then we need extra manual checking to see if the value is even supported in this corpus
	@memoize
	private get withinClauses(): Record<string, Record<string, any>> {
		return this._parsedCql?.[0].withinClauses ?? {};
	}

	// ------------------------
	// Some intermediate values
	// ------------------------

	private async updateParsedCql(bcql: string | null) {
		try {
			// Let BlackLab parse it, then try to interpret the parse tree
			// for use in the simple, extended or advanced search forms.
			this._parsedCql = bcql == null ? null : await parseBcql(this.dependencies.blacklabApi, this.dependencies.corpus.id!, bcql, this.dependencies.corpus.firstMainAnnotation.id);
			if (this._parsedCql && this._parsedCql.length === 0) this._parsedCql = null;
			if (this._parsedCql && this._parsedCql.length > 1) {
				const relType = this._parsedCql[1].relationType;
				// Check if this is a valid alignBy type
				const alignBy = this.dependencies.customizations.searchFormAlignByElements().find(v => v.value === relType);
				const optional = this._parsedCql[1].optional ?? false;
				if (!alignBy || !optional) {
					// Not a valid align by type, or a required alignment match; just put the whole query in the first expert box
					this._parsedCql = [
						{
							query: bcql || '',
						},
					];
				}
			}
		} catch (e) {
			// Just accept that we cannot interpret it for use in the simple, extended or advanced
			// search modes, and use the entire query for the Expert view.
			console.warn('Submitted BCQL query cannot fit in simple, extended or advanced search modes; using expert', e);
			this._parsedCql = [{ query: bcql || '' }];
			// Additionally, force the viewed form to be the expert form, which can contain any BCQL query,
			// not just the subset that can be interpreted for the simple, extended and advanced forms.
			this._interfaceState = null;
		}
	}

	_parsedCql: Result[] | null = null;
	_interfaceState: Partial<InterfaceModule.ModuleRootState> | null = null;
}
