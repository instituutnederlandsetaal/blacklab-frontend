import * as BLTypes from '@/types/blacklabtypes';
import * as AppTypes from '@/types/apptypes';
import Vue from 'vue';
import { HighlightSection } from '@/pages/search/results/table/hit-highlighting';
import { spanFilterId } from '@/utils';

/** This object contains any customization "hook" functions for this corpus.
 *  It defines defaults that can be overridden from custom JS file(s); see below.
 */
export const corpusCustomizations = Vue.observable({
	// Registered customize function(s), to be called once the corpus info has been loaded
	customizeFunctions: [] as ((corpus: any) => void)[],

	/** index information */
	_corpus: null as AppTypes.NormalizedIndex|null,

	search: {
		pattern: {
			/** Customize the uiType for an annotation.
			 *  Return null to use the default (value specified by BLS).
			 */
			uiType(fieldName: string, annotationName: string): AppTypes.NormalizedAnnotation['uiType']|null {
				return null;
			},

			/** Should we add _within-spans(...) around the query,
			    so all tags are captured and we can group on them?
				[Default: only if there's span filters defined] */
			shouldAddWithinSpans(q: string) {
				return null;
			}
		},

		within: {
			/** Should we include this span in the within widget? (default: all) */
			includeSpan(spanName: string) {
				return true;
			},

			/** Should we include this span attribute in the within widget? (default: none) */
			includeAttribute(spanName: string, attrName: string) {
				return null;
			},
		},

		metadata: {
			/** Show this metadata search field? */
			showField(filterId: string): boolean|null {
				return null;
			},

			/** Any custom metadata tabs to add (INTERNAL) */
			_customTabs: [] as any[],

			/** Add a custom tab with some (span) filter fields */
			addCustomTab(name: string, fields: any[]) {
				this._customTabs.push({ name, fields });
			},

			/** Create a span filter for corpus.search.metadata.customTabs */
			createSpanFilter(spanName: string, attrName: string, widget: string = 'auto', displayName: string, metadata: any = {}): AppTypes.FilterDefinition {
				// No options specified; try to get them from the corpus.
				let optionsFromCorpus;
				const corpus = corpusCustomizations._corpus;
				if (!metadata.options && corpus && corpus.relations.spans) {
					const span: BLTypes.BLSpanInfo = corpus.relations.spans[spanName] ?? {};
					const attr = span.attributes?.[attrName] ?? { values: {}, valueListComplete: false };
					if (attr?.valueListComplete) {
						optionsFromCorpus = Object.keys(attr.values).map((value: string) => ({ value }));
					}
				}

				if (widget === 'auto') {
					widget = optionsFromCorpus ? 'select' : 'text';
				}

				if (widget === 'select') {
					// If user passed in just an array, assume these are the options.
					if (Array.isArray(metadata)) {
						metadata = { options: metadata };
					}

					if (!metadata.options)
						metadata.options = optionsFromCorpus ?? [];

					// If the options are just strings, convert them to simple Option objects.
					metadata.options = metadata.options.map((option: any) => {
						return typeof option === 'string' ? { value: option } : option;
					});
				}

				const behaviourName = widget === 'select' || widget === 'range' ? `span-${widget}` : 'span-text';

				return {
					id: spanFilterId(spanName, attrName),
					componentName: `filter-${widget}`,
					behaviourName, // i.e. generate a "within ..." BCQL query
					defaultDisplayName: displayName ?? `tag ${spanName}, attribute ${attrName}`,
					metadata: {
						name: spanName,
						attribute: attrName,
						...metadata
					},
					// (groupId will be set automatically when creating the custom tabs)
				};
			},
		},
	},

	results: {
		/**
		 * How to highlight match info in the hits table.
		 *
		 * Default behaviour is to always highlight if the user "captured"
		 * (i.e. labelled this token in the query), OR if this is a relation and
		 * there are no explicit captures.
		 *
		 * @param matchInfo the highlight section to get the style for
		 * @returns 'none' (no highlighting), 'static' (always highlight), 'hover'
		 *   (highlight on mouseover) or null for default behaviour.
		 */
		matchInfoHighlightStyle: (matchInfo: HighlightSection): 'none'|'static'|'hover'|null => {
			return null; // use default behaviour
		},

		/**
		 * Description of the search query to add to the CSV export. Default: none.
		 */
		csvDescription: (blSummary: any, fieldDisplayNameFunc: any) => {
			return null; // use default behaviour
		},

		hasCustomHitInfoColumn: (results: BLTypes.BLHitResults|BLTypes.BLHitGroupResults, isParallelCorpus: boolean): boolean => {
			return isParallelCorpus;
		},

		/**
		 * Show some custom text (with doc link) left of the hit.
		 *
		 * Default shows versionPrefix if it's set (i.e. if it's a parallel corpus).
		 * Otherwise, nothing extra is shown.
		 * @param hit the hit
		 * @param annotatedFieldDisplayName the name of the field the hit is in. This is already translated to the user's locale.
		 *  In the case of non-parallel corpora, this will always be the main annotated field.
		 * @param docInfo document metadata
		 */
		customHitInfo: (hit: BLTypes.BLHit|BLTypes.BLHitSnippet|BLTypes.BLHitInOtherField,
				annotatedFieldDisplayName: string|null,
				docInfo: BLTypes.BLDoc): string|null => {
			return annotatedFieldDisplayName;
		}
	},

	sort: {
		customize(optGroup: AppTypes.OptGroup): AppTypes.OptGroup|null {
			return null; // use default behaviour [no change]
		}
	},

	group: {
		/** Should this span attribute be included in group by?
		 *  (return null to fall back to default: "only if there's a span filter defined for it")
		 */
		includeSpanAttribute(spanName: string, attrName: string): boolean|null {
			return null; // use default behaviour
		},

		customize(optGroup: AppTypes.OptGroup, i18n: Vue): AppTypes.OptGroup|null {
			return null; // use default behaviour [no change]
		}
	}
});