/**
 * Contains flags/switches/filters for different parts of the ui that can be configured
 * We use this to generate customized layouts for specific corpora.
 * Is not fully-featured, and is expanded on an as-needed basis.
 *
 * Configure from external javascript through window.vuexModules.ui.getState() and assign things.
 */

import Vue from 'vue';
import cloneDeep from 'clone-deep';
import { getStoreBuilder } from 'vuex-typex';
import { stripIndent, html } from 'common-tags';

import { RootState } from '@/store/search/';
import * as CorpusStore from '@/store/search/corpus';
import * as ViewsStore from '@/store/search/results/views';
import * as PatternsStore from '@/store/search/form/patterns';
import * as BLTypes from '@/types/blacklabtypes';
import * as AppTypes from '@/types/apptypes';
import { Option } from '@/types/apptypes';
import { HighlightSection } from '@/utils/hit-highlighting';

type CustomView = {
	id: string;
	/** Label shown in result tabs */
	label?: string;
	/** Title shown when hovering over tab */
	title: string;
	/** Vue component name or a compiled component. */
	component: string|Vue.Component;
}

type ModuleRootState = {
	search: {
		// future use
		simple: {
			searchAnnotationId: string;
		};
		extended: {
			/** Available annotation inputs in the extended search */
			searchAnnotationIds: string[],
			splitBatch: {
				enabled: boolean;
			};
		};
		advanced: {
			enabled: boolean,
			/** Annotation selection options in querybuilder. Sorted by global annotation order. */
			searchAnnotationIds: string[];
			defaultSearchAnnotationId: string;
		};
		expert: {};

		shared: {
			/**
			 * Fields available in the filters view. Sorted by global metadata order.
			 * NOTE THAT THIS MAY CONTAIN IDS THAT ARE NOT A METADATA FIELD.
			 * The reason for this is custom filters.
			 * We cannot reasonably validate this, so we only output a warning when you're trying to register those.
			 * This remains a bit of a TODO but it requires some deep thinking and architectural changes.
			 */
			searchMetadataIds: string[];
			customAnnotations: Record<string, null|{
				render(config: AppTypes.NormalizedAnnotation, state: AppTypes.AnnotationValue, vue: typeof Vue): HTMLElement|JQuery<HTMLElement>|string|Vue,
				update(newState: AppTypes.AnnotationValue, oldState: AppTypes.AnnotationValue, element: HTMLElement): void
			}>;

			within: {
				enabled: boolean;
				elements: Array<{
					title: string|null;
					label?: string;
					value: string;
				}>;
				/**
				 * What element denotes sentence boundaries.
				 * Used when (for example) requesting surrounding context in the dependency tree.
				 * Defaults to the first element in the within.elements array, but null if none are defined.
				 */
				sentenceElement: string|null;
			};

			/** Alignment relation types available in a parallel corpus, e.g. word, sentence or paragraph alignment. */
			alignBy: {
				enabled: boolean;
				elements: Array<{
					title: string|null;
					label?: string;
					value: string;
				}>;
				defaultValue: string;
			};
		}
	};

	explore: {
		/** Default selection in the ngram token dropdowns */
		defaultSearchAnnotationId: string;
		/** Options in the ngram token dropdowns. Sorted by global annotation order. */
		searchAnnotationIds: string[];

		/** Default selection in "N-Gram type" and "Frequency list type", available options are defined by results.shared.groupAnnotationIds */
		defaultGroupAnnotationId: string;
		/** Default selection in Group documents by metadata" (Corpora tab), available options are defined by results.shared.groupMetadataIds */
		defaultGroupMetadataId: string;
	};

	results: {
		hits: {
			/**
			 * Annotations columns to show in the hit results table, left, right and context columns are always shown.
			 * Defaults to 'lemma' and 'pos' if they exist, and up to 3 other annotations in order of their displayOrder.
			 * Can be configured through PROP_COLUMNS, which in turn is configured through search.xml.
			 * Can also be overridden at runtime by custom js.
			 * If manually configured, order from configuration is preserved. Otherwise uses the global annotation order.
			 */
			shownAnnotationIds: string[];
			/**
			 * Metadata columns to show in the hit results table.
			 * Defaults to empty.
			 * If manually configured, order from configuration is preserved. Otherwise uses the global metadata order.
			 */
			shownMetadataIds: string[];

			/**
			 * Addons are functions that may return additional content that is shown next to the snippet/citation when it is opened.
			 * Examples could be:
			 * - a button that plays some audio.
			 * - a section that displays information about the document.
			 * - a button that copies the citation into the clipboard.
			 *
			 * Every addon requires a name (for the v-for loop).
			 * Addons can render a vue component if they want to by setting the 'component' property.
			 * Otherwise, a div is rendered.
			 * The 'content' is provided as content for the default slot when rendering a component, and provided as v-html for the div.
			 */
			addons: Array<((context: {
				corpus: string,
				docId: string,
				document: BLTypes.BLDocInfo,
				documentUrl: string,
				wordAnnotationId: string,
				dir: 'ltr'|'rtl',
				citation: BLTypes.BLHitSnippet
			}) => {
				name: string;
				component?: string;
				element?: string;
				props?: any;
				content?: string
				listeners?: any;
			})>;
		};
		docs: {
			/**
			 * Metadata columns to show in the doc results table.
			 * Defaults to the special year field (if it has been set in the index).
			 * If manually configured, order from configuration is preserved. Otherwise uses the global annotation order.
			 */
			shownMetadataIds: string[];
		};

		customViews: CustomView[],

		shared: {
			/** Show a widget to enable quick switching of the concordanceAnnotationId if there are multiple possibilities (example - show phonetic texts vs written texts ?). */
			concordanceAnnotationIdOptions: string[],
			/** What annotation to use for displaying of [before, hit, after] and snippets. Conventionally the main annotation. */
			concordanceAnnotationId: string;
			/** Optionally run a function on all retrieved snippets to arbitrarily process the data (we use this to format the values in some annotations for display purposes). */
			transformSnippets: null|((snippet: BLTypes.BLHitSnippet) => void);
			/** Size of the details hit (number of words loaded before/after the hit when expanding a hit result). Max 1000 */
			concordanceSize: number;
			concordanceAsHtml: boolean;
			getDocumentSummary: ((doc: BLTypes.BLDocInfo, fields: BLTypes.BLDocFields) => string);

			/**
			 * Annotations IDs to include in expanded hit rows (meaning in the table there), and csv exports containing hits.
			 * The server returns all annotations if this is null,
			 * and the interface will then display all non-internal annotations, in their displayOrder.
			 * Sorted by global annotation order.
			 */
			detailedAnnotationIds: null|string[];
			/**
			 * Document Metadata field IDs to include in exported results.
			 * Has no influence over shown metadata in the opened documents/articles on the /docs/${docId} page.
			 * Server returns all fields if this is null.
			 * Sorted by global metadata order.
			 */
			detailedMetadataIds: null|string[];

			/**
			 * Available options for grouping by annotation, in Explore//N-grams, Explore//Statistics, and the Per Hit results.
			 * Annotations must contain a forward index.
			 * Sorted by global annotation order.
			 */
			groupAnnotationIds: string[];
			/** Available options for grouping by metadata, in Explore//Corpora, and the Per Hit/Per Doc results. Sorted by global metadata order. */
			groupMetadataIds: string[];

			/** Available options for sorting in the hits+docs results, only supported with a forward index. Sorted by global annotation order. */
			sortAnnotationIds: string[];
			/** Available metadata options for sorting in the hits+docs results. Sorted by global metadata order. */
			sortMetadataIds: string[];

			/** Used for calculating page offsets in links to documents */
			pageSize: number|undefined;

			/** Are the export buttons allowed in the interface */
			exportEnabled: boolean;

			/** While a query is still running on the server, how long to keep polling for the total number of results. Default 90 seconds. 0 or below will keep polling indefinitely. */
			totalsTimeoutDurationMs: number;
			/** Polling interval for the above. Default 2 seconds. Minimum 100ms. */
			totalsRefreshIntervalMs: number;

			/** Which annotations should be shown in the dependency tree. (for corpora with dependencies indexed) */
			dependencies: {
				lemma: string|null;
				upos: string|null;
				xpos: string|null;
				feats: string|null;
			}
		};
	};

	dropdowns: {
		groupBy: {
			/** Shows or hides the small muted text label showing the group of an annotation. Also hides the hit/before/after label. */
			annotationGroupLabelsVisible: boolean
			/** Shows or hides the small muted text label showing the group of a metadata field. */
			metadataGroupLabelsVisible: boolean,
		};
	};

	global: {
		pageGuide: {
			enabled: boolean;
		},

		/** Database to use in the lexicon service component. To allow switching early dutch/middle dutch etc. */
		lexiconDb: string;
		/**
		 * @param e the error
		 * @param context snippet = large context around a hit, concordances = hits within a group. NOTE: context may be expanded in the future.
		 */
		errorMessage(e: AppTypes.ApiError, context: 'snippet'|'concordances'|'hits'|'docs'|'groups'): string;
	}
};

// Will be corrected on store init
// Copies values from the live store if it has been configured externally
// (which should have been verified for correctness in the action creators/handlers)
// Otherwise falls back to sensible defaults
// Then is used to initialize the live store again
const initialState: ModuleRootState = {
	search: {
		simple: {
			searchAnnotationId: '',
		},
		extended: {
			searchAnnotationIds: [],
			splitBatch: {
				enabled: true,
			},
		},
		advanced: {
			enabled: true,
			searchAnnotationIds: [],
			defaultSearchAnnotationId: ''
		},
		expert: {},

		shared: {
			searchMetadataIds: [],
			customAnnotations: {},

			within: {
				enabled: true,
				elements: [],
				sentenceElement: null
			},

			alignBy: {
				enabled: false,
				elements: [],
				defaultValue: '',
			},
		}
	},
	explore: {
		defaultSearchAnnotationId: '',
		searchAnnotationIds: [],

		defaultGroupAnnotationId: '',
		defaultGroupMetadataId: '',
	},
	results: {
		hits: {
			shownAnnotationIds: [],
			shownMetadataIds: [],
			addons: []
		},
		docs: {
			shownMetadataIds: [],
		},
		// we have to do this here already, otherwise these views would be undefined during customjs evaluation.
		// (which is done before the store is initialized)
		customViews: [{
			id: 'hits',
			title: 'Per Hit',
			component: 'ResultsView'
		}, {
			id: 'docs',
			title: 'Per Document',
			component: 'ResultsView'
		}],
		shared: {
			concordanceAnnotationIdOptions: [],
			concordanceAnnotationId: '',
			concordanceSize: 50,
			transformSnippets: null,
			concordanceAsHtml: false,
			getDocumentSummary: (doc: BLTypes.BLDocInfo, fields: BLTypes.BLDocFields): string => {
				const { titleField = '', dateField = '', authorField = '' } = fields;
				const { [titleField]: title = [], [dateField]: date = [], [authorField]: author = [] } = doc;
				return (title[0] || 'UNKNOWN') + (author.length ? ' by ' + author.join(', ') : '');
			},
			detailedAnnotationIds: null,
			detailedMetadataIds: null,
			groupAnnotationIds: [],
			groupMetadataIds: [],
			sortAnnotationIds: [],
			sortMetadataIds: [],
			pageSize: PAGE_SIZE,
			exportEnabled: true,

			totalsTimeoutDurationMs: 90_000,
			totalsRefreshIntervalMs: 2_000,

			dependencies: {
				feats: null,
				lemma: null,
				upos: null,
				xpos: null
			}
		}
	},
	global: {
		pageGuide: {
			enabled: true
		},
		lexiconDb: 'lexiconservice_mnw_wnt',
		errorMessage: (e, c) => {
			switch (c) {
				case 'concordances': return `${e.title}<br>${e.message}`;
				default: return e.message;
			}
		}
	},

	dropdowns: {
		groupBy: {
			metadataGroupLabelsVisible: true,
			annotationGroupLabelsVisible: true
		}
	}
};

const namespace = 'ui';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep(initialState));

// hide implementation detail
// Sometimes this is used before store is actually created (in order to initialize other parts of the store)
const getState = (() => {
	const getter = b.state();

	return (): ModuleRootState => {
		try {
			// throws if store not built yet
			return getter();
		} catch (e) {
			// return the default state we already know
			return cloneDeep(initialState);
		}
	};
})();

const get = {
};

const privateActions = {
	search: {
		shared: {
			initCustomAnnotationRegistrationPoint: b.commit((state, id: string) => Vue.set(state.search.shared.customAnnotations, id, state.search.shared.customAnnotations[id] ?? null), 'search_shared_initCustomAnnotation')
		}
	}
}

const actions = {
	search: {
		simple: {
			searchAnnotationId: b.commit((state, id: string) => validateAnnotations([id], id => `Trying to display Annotation ${id} in the simple search, but it does not exist`, _ => true, _ => '', r => {
				state.search.simple.searchAnnotationId = r[0];
			}), 'search_simple_searchAnnotationId'),
		},
		extended: {
			searchAnnotationIds: b.commit((state, ids: string[]) => validateAnnotations(ids,
				id => `Trying to display Annotation ${id} in the extended search, but it does not exist`,
				_ => true, _ => '',
				r => state.search.extended.searchAnnotationIds = r
			), 'search_extended_searchAnnotationIds'),

			splitBatch: {
				enable: b.commit((state, payload: boolean) => state.search.extended.splitBatch.enabled = payload, 'search_extended_splitbatch_enable'),
			},

			/** @deprecated 9-04-2024 backwards compatibility. Moved to search.shared.within */
			within: {
				/** @deprecated 9-04-2024 backwards compatibility. Moved to search.shared.within */
				enable: (p: boolean) => actions.search.shared.within.enable(p),
				/** @deprecated 9-04-2024 backwards compatibility. Moved to search.shared.within */
				elements: (e: ModuleRootState['search']['shared']['within']['elements']) => actions.search.shared.within.elements(e)
			},
		},
		advanced: {
			searchAnnotationIds: b.commit((state, ids: string[]) => validateAnnotations(ids,
				id => `Trying to display Annotation ${id} in the querybuilder, but it does not exist`,
				_ => true, _ => '',
				r => {
					r = state.search.advanced.searchAnnotationIds = r;
					const defaultId = state.search.advanced.defaultSearchAnnotationId;
					if (!r.includes(defaultId)) {
						if (defaultId) { // don't warn when it was unconfigured before (e.g. '')
							console.warn(`[search.advanced.searchAnnotationIds] - Resetting default selection from '${defaultId}' to '${r[0]}' because it's not in the configured list ${JSON.stringify(r)}`);
						}
						state.search.advanced.defaultSearchAnnotationId = r[0];
					}
				}
			), 'search_advanced_searchAnnotationIds'),
			defaultSearchAnnotationId: b.commit((state, annotationId: string) => {
				if (state.search.advanced.searchAnnotationIds.length === 0 || state.search.advanced.searchAnnotationIds.includes(annotationId)) {
					state.explore.defaultGroupAnnotationId = annotationId;
				} else {
					console.warn(`[search.advanced.defaultSearchAnnotationId] - Trying to set default selection to '${annotationId}', but it's not one of the configured options (${JSON.stringify(state.search.advanced.searchAnnotationIds)})!`);
				}
			}, 'search_advanced_defaultSearchAnnotationId'),

			enable: b.commit((state, enable: boolean) => state.search.advanced.enabled = enable, 'search_advanced_enabled'),
		},
		expert: {},

		shared: {
			searchMetadataIds: b.commit((state, ids: string[]) => validateMetadata(ids,
				id => `Trying to display metadata field '${id}' in the filters section, but it does not exist.`,
				_ => true, _ => '',
				r => state.search.shared.searchMetadataIds = r
			), 'search_shared_searchMetadataIds'),
			within: {
				enable: b.commit((state, payload: boolean) => state.search.shared.within.enabled = payload, 'search_shared_within_enable'),
				elements: b.commit((state, payload: ModuleRootState['search']['shared']['within']['elements']) => {
					if (payload.findIndex(v => v.value === '') === -1) {
						payload.unshift({
							value: '',
							label: 'Document',
							title: null
						});
					}
					state.search.shared.within.elements = payload;
				}, 'search_shared_within_annotations'),
				sentenceElement: b.commit((state, payload: string|null) => {
					if (state.search.shared.within.elements.findIndex(e => e.value === payload) >= 0 )
						state.search.shared.within.sentenceElement = payload;
				}, 'search_shared_within_sentenceElement')
			},
			/** Alignment relation types available in a parallel corpus, e.g. word, sentence or paragraph alignment. */
			alignBy: {
				enable: b.commit((state, payload: boolean) => state.search.shared.alignBy.enabled = payload, 'search_shared_alignBy_enable'),
				elements: b.commit((state, payload: ModuleRootState['search']['shared']['alignBy']['elements']) => {
					state.search.shared.alignBy.elements = payload;
					const defaultValue = payload[0]?.value ?? '';
					state.search.shared.alignBy.defaultValue = defaultValue;
				}, 'search_shared_alignBy_annotations'),
			},
		}
	},
	explore: {
		defaultGroupAnnotationId: b.commit((state, annotationId: string) => {
			if (state.results.shared.groupAnnotationIds.length === 0 || state.results.shared.groupAnnotationIds.includes(annotationId)) {
				state.explore.defaultGroupAnnotationId = annotationId;
			} else {
				console.warn(`[explore.defaultGroupAnnotationId] - Trying to set default selection to '${annotationId}', but it's not one of the configured options (${JSON.stringify(state.results.shared.groupAnnotationIds)})!`);
			}
		}, 'explore_defaultGroupAnnotationId'),
		defaultGroupMetadataId: b.commit((state, metadataFieldId: string) => {
			if (state.results.shared.groupMetadataIds.length === 0 || state.results.shared.groupMetadataIds.includes(metadataFieldId)) {
				state.explore.defaultGroupMetadataId = metadataFieldId;
			} else {
				console.warn(`[explore.defaultGroupMetadataId] - Trying to set default selection to '${metadataFieldId}', but it's not one of the configured options (${JSON.stringify(state.results.shared.groupMetadataIds)})!`);
			}
		}, 'explore_defaultGroupMetadataId'),

		defaultSearchAnnotationId: b.commit((state, annotationId: string) => {
			if (state.explore.searchAnnotationIds.length === 0 || state.explore.searchAnnotationIds.includes(annotationId)) {
				state.explore.defaultSearchAnnotationId = annotationId;
			} else {
				console.warn(`[explore.defaultSearchAnnotationId] - Trying to set default selection to '${annotationId}', but it's not one of the configured options (${JSON.stringify(state.explore.searchAnnotationIds)})!`);
			}
		}, 'explore_defaultSearchAnnotationId'),
		searchAnnotationIds: b.commit((state, ids: string[]) => validateAnnotations(ids,
			id => `Trying to display Annotation ${id} in the explore view (n-grams), but it does not exist`,
			_ => true, _ => '',
			r => {
				const defaultId = state.explore.defaultSearchAnnotationId;
				r = state.explore.searchAnnotationIds = r;
				if (!r.includes(defaultId)) {
					if (defaultId) { // don't warn when it was unconfigured before (e.g. '')
						console.warn(`[explore.searchAnnotationIds] - Resetting default selection from '${defaultId}' to '${r[0]}' because it's not in the configured list ${JSON.stringify(r)}`);
					}
					state.explore.defaultSearchAnnotationId = r[0];
				}
			}
		), 'explore_searchAnnotationIds'),
	},
	results: {
		hits: {
			shownAnnotationIds: b.commit((state, ids: string[]) => validateAnnotations(ids,
				id => `Trying to display Annotation '${id}' as column in the hits table, but it does not exist`,
				a => a.hasForwardIndex,
				id => `Trying to display Annotation '${id}' as column in the hits table, but it does not have the required forward index.`,
				r => state.results.hits.shownAnnotationIds = r
			), 'hits_shownAnnotationIds'),

			shownMetadataIds: b.commit((state, ids: string[]) => validateMetadata(ids,
				id => `Trying to display metadata field '${id}' as column in the hits table, but it does not exist`,
				_ => true, _ => '',
				r => state.results.hits.shownMetadataIds = r
			), 'hits_shownMetadataIds')
		},
		docs: {
			shownMetadataIds: b.commit((state, ids: string[]) => validateMetadata(ids,
				id => `Trying to display metadata field '${id}' as column in the docs table, but it does not exist`,
				_ => true, _ => '',
				r => state.results.docs.shownMetadataIds = r
			), 'docs_shownMetadataIds')
		},
		addResultView: b.commit((state, view: CustomView&{customInitialState: any}) => {
			if (!state.results.customViews.find(v => v.id === view.id)) {
				ViewsStore.getOrCreateModule(view.id);
				state.results.customViews.push(view);
			}
		}, 'registerCustomView'),
		removeResultView: b.commit((state, viewId: string) => {
			const index = state.results.customViews.findIndex(v => v.id === viewId);
			if (index !== -1) {
				state.results.customViews.splice(index, 1);
			} else {
				console.warn(`[results.removeResultView] - Trying to remove custom view '${viewId}', but it doesn't exist!`);
			}
		}, 'removeCustomView'),
		shared: {
			concordanceAnnotationIdOptions: b.commit((state, ids: string[]) => validateAnnotations(ids,
				id => `Trying to set available option for concordance Annotation '${id}', but it does not exist`,
				a => a.hasForwardIndex,
				id => `Trying to set available option for concordance Annotation '${id}', but it does not have the required forward index.`,
				r => state.results.shared.concordanceAnnotationIdOptions = r
			), 'shared_concordanceAnnotationIdOptions'),
			concordanceAnnotationId: b.commit((state, id: string) => validateAnnotations([id],
				_ => `Trying to display Annotation '${id}' as concordance and snippet text, but it does not exist`,
				a => a.hasForwardIndex,
				_ => `Trying to display Annotation '${id}' as concordance and snippet text, but it does not have the required forward index.`,
				r => state.results.shared.concordanceAnnotationId = id
			), 'shared_concordanceAnnotationId'),
			concordanceAsHtml: b.commit((state, enable: boolean) => state.results.shared.concordanceAsHtml = enable, 'shared_concordanceAsHtml'),
			concordanceSize: b.commit((state, size: number) => state.results.shared.concordanceSize = Math.min(Math.max(0, size), 1000), 'shared_concordanceSize'),
			transformSnippets: b.commit((state, transform: (snippet: BLTypes.BLHitSnippet) => void) => state.results.shared.transformSnippets = transform, 'shared_transformSnippets'),

			detailedAnnotationIds: b.commit((state, ids: string[]|null) => {
				if (ids != null) {
					validateAnnotations(ids,
						id => `Trying to display Annotation '${id}' in hit detail snippets, but it does not exist`,
						a => a.hasForwardIndex,
						id => `Trying to display Annotation '${id}' in hit detail snippets, but it does not have the required forward index.`,
						r => state.results.shared.detailedAnnotationIds = r
					);
				} else {
					state.results.shared.detailedAnnotationIds = ids;
				}
			}, 'shared_detailedAnnotationIds'),

			detailedMetadataIds: b.commit((state, ids: string[]|null) => {
				if (ids != null) {
					validateMetadata(ids,
						id => `Trying to add document metadata field '${id}' to exports, but it does not exist`,
						_ => true, _ => '',
						r => state.results.shared.detailedMetadataIds = r
					);
				} else {
					state.results.shared.detailedMetadataIds = ids;
				}
			}, 'shared_detailedMetadataIds'),

			groupAnnotationIds: b.commit((state, ids: string[]) => validateAnnotations(ids,
				id => `Trying to allow grouping by Annotation '${id}', but it does not exist`,
				a => a.hasForwardIndex,
				id => `Trying to allow grouping by Annotation '${id}', but it does not have the required forward index.`,
				r => {
					const defaultId = state.explore.defaultGroupAnnotationId;
					state.results.shared.groupAnnotationIds = r;
					if (!r.includes(defaultId)) {
						if (defaultId) { // don't warn when it was unconfigured before (e.g. '')
							console.warn(`[results.shared.groupAnnotationIds] - Resetting default selection for explore.defaultGroupAnnotationId from '${defaultId}' to '${r[0]}' because it's not in the configured list ${JSON.stringify(r)}`);
						}
						state.explore.defaultGroupAnnotationId = r[0];
					}
				}
			), 'shared_groupAnnotationIds'),

			groupMetadataIds: b.commit((state, ids: string[]) => validateMetadata(ids,
				id => `Trying to allow grouping by metadata field '${id}', but it does not exist`,
				_ => true, _ => '',
				r => {
					const defaultId = state.explore.defaultGroupMetadataId;
					state.results.shared.groupMetadataIds = r;
					if (!r.includes(defaultId)) {
						if (defaultId) { // don't warn when it was unconfigured before (e.g. '')
							console.warn(`[results.shared.groupMetadataIds] - Resetting default selection for explore.defaultGroupMetadataId from '${defaultId}' to '${r[0]}' because it's not in the configured list ${JSON.stringify(r)}`);
						}
						state.explore.defaultGroupMetadataId = r[0];
					}
				}
			), 'shared_groupMetadataIds'),

			sortAnnotationIds: b.commit((state, ids: string[]) => validateAnnotations(ids,
				id => `Trying to allow sorting by Annotation '${id}', but it does not exist`,
				a => a.hasForwardIndex,
				id => `Trying to allow sorting by Annotation '${id}', but it does not have the required forward index.`,
				r => state.results.shared.sortAnnotationIds = r
			), 'shared_sortAnnotationIds'),

			sortMetadataIds: b.commit((state, ids: string[]) => validateMetadata(ids,
				id => `Trying to allow sorting by metadata field '${id}', but it does not exist`,
				_ => true, _ => '',
				r => state.results.shared.sortMetadataIds = r
			), 'shared_sortMetadataIds'),

			exportEnabled: b.commit((state, enabled: boolean) => state.results.shared.exportEnabled = enabled, 'exportEnabled'),

			totalsTimeoutDurationMs: b.commit((state, timeoutMs: number) => {
				const n = Number(timeoutMs);
				state.results.shared.totalsTimeoutDurationMs = isNaN(n) ? 90_000 : n;
			}, 'totalsTimeoutDurationMs'),
			totalsRefreshIntervalMs: b.commit((state, intervalMs: number) => {
				const n = Number(intervalMs);
				state.results.shared.totalsRefreshIntervalMs = isNaN(n) ? 2_000 : Math.max(100, n);
			}, 'totalsRefreshIntervalMs'),

			/** Edit which annotations are shown in the dependency tree in the hits result table. */
			dependencies: b.commit((state, payload: { lemma: string|null, upos: string|null, xpos: string|null, feats: string|null }) => {
				const allAnnotations= CorpusStore.get.allAnnotationsMap();
				const storeIsInitialized = Object.keys(allAnnotations).length > 0;
				const validate = (id: string|null): string|null => {
					if (!storeIsInitialized) return id; // validate in this module's init() function. allow for now.
					if (id == null || allAnnotations[id]?.hasForwardIndex) return id;
					if (!allAnnotations[id]) console.warn(`[results.shared.dependencies] - Trying to show dependency tree with annotation '${id}', but it does not exist.`);
					if (!allAnnotations[id]?.hasForwardIndex) console.warn(`[results.shared.dependencies] - Trying to show dependency tree with annotation '${id}', but it does not have the required forward index.`);
					return null;
				}
				state.results.shared.dependencies = {
					lemma: validate(payload.lemma),
					upos: validate(payload.upos),
					xpos: validate(payload.xpos),
					feats: validate(payload.feats)
				};
			}, 'dependencies')
		}
	},
	global: {
		pageGuide: {
			enable: b.commit((state, payload: boolean) => {
				state.global.pageGuide.enabled = !!payload;
			}, 'global_pageGuide_enabled'),
		},
		lexiconDb: b.commit((state, payload: string) => state.global.lexiconDb = payload, 'global_lexiconDb')
	},
	dropdowns: {
		groupBy: {
			annotationGroupLabelsVisible: b.commit((state, payload: boolean) => state.dropdowns.groupBy.annotationGroupLabelsVisible = payload, 'annotationGroupLabelsVisible'),
			metadataGroupLabelsVisible: b.commit((state, payload: boolean) => state.dropdowns.groupBy.metadataGroupLabelsVisible = payload, 'metadataGroupLabelsVisible'),
		},
	},

	replace: b.commit((state, payload: ModuleRootState) => Object.assign(state, cloneDeep(payload)), 'replace'),

	helpers: {
		/**
		 * Configure many annotations at the same time. Omitted columns, or columns without any "true" values are left at their defaults.
		 * If you want to clear the defaults for a column and show nothing: configure it through the dedicated function.
		 * Call as follows:
		 * ```js
		 * configureAnnotations([
		 *     [        , 'EXTENDED',  'ADVANCED' , 'EXPLORE' , 'SORT' , 'GROUP' , 'RESULTS' , 'CONCORDANCE'],
		 *     ['word'  ,           ,             ,           , true   , true    ,           ,      true    ],
		 *     ['lemma' ,           ,             ,           , true   ,         ,           ,      true    ],
		 *     ...
		 * ]);
		 * ```
		 */
		configureAnnotations: createConfigurator({
			'EXTENDED':    ['search', 'extended', 'searchAnnotationIds'],
			'ADVANCED':    ['search', 'advanced', 'searchAnnotationIds'],
			'EXPLORE':     ['explore', 'searchAnnotationIds'],
			'SORT':        ['results', 'shared', 'sortAnnotationIds'],
			'GROUP':       ['results', 'shared', 'groupAnnotationIds'],
			'RESULTS':     ['results', 'hits', 'shownAnnotationIds'],
			'CONCORDANCE': ['results', 'shared', 'detailedAnnotationIds'],
		}),

		/**
		 * Configure many metadata fields at the same time. Columns without any "true" values are left at their defaults.
		 * Call as follows:
		 * ```js
		 * configureMetadata([
		 *     [        , 'SORT' , 'GROUP' , 'RESULTS/HITS' , 'RESULTS/DOCS' , 'EXPORT'],
		 *     ['title' , true   , true    ,                ,                ,         ],
		 *     ['date'  , true   ,         ,                ,        true    ,         ],
		 *     ...
		 * ]);
		 * ```
		 */
		configureMetadata: createConfigurator({
			'FILTER':       ['search', 'shared', 'searchMetadataIds'],
			'SORT':         ['results', 'shared', 'sortMetadataIds'],
			'GROUP':        ['results', 'shared', 'groupMetadataIds'],
			'RESULTS/HITS': ['results', 'hits', 'shownMetadataIds'],
			'RESULTS/DOCS': ['results', 'docs', 'shownMetadataIds'],
			'EXPORT':       ['results', 'shared', 'detailedMetadataIds']
		}),
	}
};

/**
 * This function is not great.
 * The issue is that customjs can call our setters before we know the corpus shape (because that's loaded async).
 * When this happens, we store those settings in the initialState.
 * But when the corpus is loaded, we have to validate those settings.
 * It would be better to queue up the setters until we have loaded the corpus, but that's complex.
 * It would be even better to get rid of customjs, or at least have it evaluate after the corpus is loaded
 * Perhaps it could just return a json object that we can use to configure the store.
 * But that's a future refactor. It would be most useful to do before we migrate to vue 3.
 *
 * There's no real way to get around this validation for now.
 * If we didnt't do this, and someone made a typo in their setup javascript and sets a nonexistant annotation somewhere the page would probably crash.
 *
 *
 * Store initialization happens in 3 steps:
 * - initial construction:
 *   this happens immediately when the script is evaluated.
 *   This is when the initialState objects are created. (hence the workaround in this module's getState())
 * - customization:
 *   CustomJs scripts load and can interact with the UI module
 * - init() function: CustomJs should now have done all its edits,
 *   and changes are validated and persisted into the initialState objects.
 *   This is where we are now.
 *
 */
const init = () => {
	if (!CorpusStore.getState().corpus) throw new Error('Cannot initialize UI module before corpus is loaded');

	// XXX: hack!
	/**
	 * If we don't do this, imagine the following
	 *
	 * initialState.some_annotation_list = ['some_invalid_id']
	 *
	 * // we think this will validate, but what actually happens is that the setter is called,
	 * // the value is deemed invalid, and nothing happens
	 * // the net result is that value is still ['some_invalid_id']
	 * // and the app will crash when it tries to use that value
	 * actions.some_annotation_list(initialState.some_annotation_list)
	 *
	 * // instead we set this, so the validator will just return an empty array, and the setting will becomed either [] or undefined, which is fine
	 * // we can then detect this during init, and replace the setting with the default.
	 */
	alwaysCallbackAfterValidating = true;



	// ====================
	// Set up some defaults
	// ====================

	const allAnnotationsMap = CorpusStore.get.allAnnotationsMap();
	const allMetadataFieldsMap = CorpusStore.get.allMetadataFieldsMap();
	const annotationGroups = CorpusStore.get.annotationGroups();
	const metadataGroups = CorpusStore.get.metadataGroups();
	const mainAnnotation = CorpusStore.get.firstMainAnnotation();

	// Annotations (extended, advanced, explore [n-grams], sorting, grouping, hit details)
	// If unconfigured, show the following annotations:
	// - Those in non-remainder groups (which are the user-configured groups)
	// - Non-internal annotations in the remainder group (which is the catch-all/fallback group), iff there are no other groups.
	const defaultAnnotationsToShow = annotationGroups.flatMap((g, i) => {
		if (!g.isRemainderGroup) { return g.entries; }
		const hasNonRemainderGroup = i > 0; // remainder groups is always at the end
		// remainder group is hidden unless there's no other group. Also internal annotations in the remainder group are always hidden.
		return hasNonRemainderGroup ? [] : g.entries.filter(annotationName => allAnnotationsMap[annotationName]?.isInternal === false);
	});

	// Metadata/filters (extended, advanced, expert, explore)
	// If unconfigured: show all metadata in groups (groups are defined in the index format yaml file)
	const defaultMetadataToShow = metadataGroups.flatMap((g, i) => {
		if (!g.isRemainderGroup) { return g.entries; }
		const hasNonRemainderGroup = i > 0; // remainder group is always at the end
		return hasNonRemainderGroup ? [] : g.entries;
	});

	// So: CustomJS has finished interacting with this module, now propagate changes back to the defaults, and validate all settings.
	Object.assign(initialState, cloneDeep(getState()));

	// ============================================
	// Now validate the settings one by one (ugh..)
	// ============================================

	// SEARCH

	// Always remove any possible bogus annotations set by invalid configs
	// And then replace with default values if not configured
	// The setters have builtin validation. So call them, then check if a valid was set, and if not, replace with default.
	if (initialState.search.simple.searchAnnotationId)
		actions.search.simple.searchAnnotationId(initialState.search.simple.searchAnnotationId);
	if (!getState().search.simple.searchAnnotationId) actions.search.simple.searchAnnotationId(mainAnnotation.id);

	actions.search.extended.searchAnnotationIds(initialState.search.extended.searchAnnotationIds);
	if (!getState().search.extended.searchAnnotationIds.length) actions.search.extended.searchAnnotationIds(defaultAnnotationsToShow);

	actions.search.advanced.searchAnnotationIds(initialState.search.advanced.searchAnnotationIds);
	if (!getState().search.advanced.searchAnnotationIds.length) actions.search.advanced.searchAnnotationIds(defaultAnnotationsToShow);
	// no need to check defaultSearchAnnotationId, is corrected in the setter already

	actions.search.shared.searchMetadataIds(initialState.search.shared.searchMetadataIds);
	if (!getState().search.shared.searchMetadataIds.length) actions.search.shared.searchMetadataIds(defaultMetadataToShow);

	// "within" selector (i.e. search within paragraphs/sentences/documents, whatever else is indexed (called "inline tags" in BlackLab)).
	if (!initialState.search.shared.within.elements.length) {
		function setValuesForWithin(validValues?: AppTypes.NormalizedAnnotation['values']) {
			if (!validValues?.length) {
				console.warn('Within clause not supported in this corpus, no relations indexed');
				actions.search.shared.within.enable(false);
				return;
			};

			validValues.forEach(v => {
				if (!v.label.trim() || v.label === v.value) {
					if (v.value === 'p') { v.label = 'paragraph'; }
					else if (v.value === 's') { v.label = 'sentence'; }
					else if (!v.value) { v.label = 'document'; }
					else { v.label = v.value; }
				}
			});

			if (validValues.length <= 6) { // an arbitrary limit
				actions.search.shared.within.elements(validValues);
			} else {
				console.warn(`Within clause can contain ${validValues.length} different values, ignoring...`);
			}
		}

		function setValuesForAlignBy(validValues?: AppTypes.NormalizedAnnotation['values']) {
			if (!validValues?.length) {
				console.warn('Align by not supported in this corpus, no parallel relations indexed');
				actions.search.shared.alignBy.enable(false);
				return;
			};

			validValues.forEach(v => {
				if (!v.label.trim() || v.label === v.value) {
					if (v.value.endsWith('-alignment'))
						v.label = v.value.slice(0, -10); // e.g. word-alignment -> word
					else if (!v.value) { v.label = 'EMPTY'; }
					else { v.label = v.value; }
				}
			});

			validValues.sort((a, b) => {
				// "word" should be the first option, if it exists
				if (a.label.toLowerCase() === 'word') {
					if (a.label === b.label)
						return 0;
					return -1;
				} else if (b.label.toLowerCase() === 'word') {
					return 1;
				}
				return a.label.localeCompare(b.label)
			});

			actions.search.shared.alignBy.elements(validValues);
		}

		// In BlackLab 4.0, the 'starttag' annotation was renamed to '_relation' and is now used to index
		// (dependency, parallel) relations as well. We could get the list of values for this annotation and
		// decode them, but this makes us depend on implementation details. The new /relations endpoint gives
		// us the same information in a portable way.
		const relations = CorpusStore.getState().corpus!.relations;
		setValuesForWithin(Object.keys(relations.spans||{}).map(v => ({value: v, label: v, title: null})));

		// Set default sentence boundary element. For use with dependency trees and getting the sentence around a hit.
		const state = getState(); // since we did it async, the init is already finished, and the data we set is not in the initial state anymore.
		if (!getState().search.shared.within.sentenceElement && getState().search.shared.within.elements.length) {
			const labelsOrValues = ['sentence', 's', 'sen', 'sent', 'paragraph', 'p', 'par', 'para', 'verse'];
			// process the labels in order or preference.
			const defaultWithin = labelsOrValues.flatMap(l => state.search.shared.within.elements.find(e => (e.label && e.label.includes(l)) || e.value.includes(l)) || [])[0]
			if (defaultWithin) {
				actions.search.shared.within.sentenceElement(defaultWithin.value);
			}
		}

		// get parallel relations types for "align by" selector
		if (relations.relations) {
			// Get relation types for parallel relations to all target fields in a set
			const relTypes = new Set(Object.keys(relations.relations)
				.filter(v => v.startsWith('al__')) // by convention, parallel relations use class 'al__TARGETVERSION', e.g. 'al__nl'
				.flatMap(v => Object.keys(relations.relations![v])));
			const alignByValues = [...relTypes].map(v => ({value: v, label: v, title: null}));
			setValuesForAlignBy(alignByValues);
		}
	}

	// EXPLORE

	actions.explore.searchAnnotationIds(initialState.explore.searchAnnotationIds);
	if (!getState().explore.searchAnnotationIds.length) actions.explore.searchAnnotationIds(defaultAnnotationsToShow);
	// no need to check defaultSearchAnnotationId, already done in the setter
	// no need to check defaultGroupAnnotationId, already done in the setter
	// no need to check defualtGroupMetadataId, done in shared groupMetadataIds setter

	// RESULTS

	// annotation ids in the results table follow their own rules
	// Show 'lemma' and 'pos' (if they exist) and up to 3 more annotations in order of definition
	// OR: show based on PROPS_IN_COLUMNS [legacy support] (configured in this corpus's search.xml)
	actions.results.hits.shownAnnotationIds(initialState.results.hits.shownAnnotationIds);
	if (!getState().results.hits.shownAnnotationIds.length) {
		const shownAnnotations = PROPS_IN_COLUMNS.filter(annot => allAnnotationsMap[annot]?.hasForwardIndex && annot !== mainAnnotation.id);
		if (!shownAnnotations.length) {
			// These have precedence if they exist.
			if (allAnnotationsMap.lemma?.hasForwardIndex) { shownAnnotations.push('lemma'); }
			if (allAnnotationsMap.pos?.hasForwardIndex) { shownAnnotations.push('pos'); }

			// Now add other annotations until we hit 3 annotations.
			defaultAnnotationsToShow
			.filter(id => id !== mainAnnotation.id && !shownAnnotations.includes(id))
			.forEach(id => {
				if (shownAnnotations.length < 3) {
					shownAnnotations.push(id);
				}
			});
		}
		actions.results.hits.shownAnnotationIds(shownAnnotations);
	}

	// Hits table, nothing shown by default, but call the setter to validate what was set.
	actions.results.hits.shownMetadataIds(initialState.results.hits.shownMetadataIds);
	// Docs table: validate shown metadata
	actions.results.docs.shownMetadataIds(initialState.results.docs.shownMetadataIds);

	// Docs table: Show the date column if it is configured
	if (!getState().results.docs.shownMetadataIds.length) {
		const dateField = CorpusStore.getState().corpus!.fieldInfo.dateField;
		if (dateField) {
			actions.results.docs.shownMetadataIds([dateField]);
		}
	}

	// SHARED

	// This one needs manual validation, because the setter just won't do anything if the id is invalid.
	// And then the invalid id will remain in the state.
	actions.results.shared.concordanceAnnotationIdOptions(initialState.results.shared.concordanceAnnotationIdOptions);
	if (!getState().results.shared.concordanceAnnotationIdOptions.length) actions.results.shared.concordanceAnnotationIdOptions([mainAnnotation.id]);
	{
		const annot = allAnnotationsMap[initialState.results.shared.concordanceAnnotationId];
		if (!annot?.hasForwardIndex)
			actions.results.shared.concordanceAnnotationId(mainAnnotation.hasForwardIndex ? mainAnnotation.id : defaultAnnotationsToShow.find(id => allAnnotationsMap[id]?.hasForwardIndex)!);
	}

	actions.results.shared.concordanceSize(Math.min(Math.max(1, initialState.results.shared.concordanceSize), 1000));

	actions.results.shared.detailedAnnotationIds(initialState.results.shared.detailedAnnotationIds);
	if (!getState().results.shared.detailedAnnotationIds?.length) actions.results.shared.detailedAnnotationIds(null);

	actions.results.shared.detailedMetadataIds(initialState.results.shared.detailedMetadataIds);
	// no default for this one.

	actions.results.shared.groupAnnotationIds(initialState.results.shared.groupAnnotationIds);
	if (!getState().results.shared.groupAnnotationIds.length) actions.results.shared.groupAnnotationIds(defaultAnnotationsToShow);

	actions.results.shared.groupMetadataIds(initialState.results.shared.groupMetadataIds);
	if (!getState().results.shared.groupMetadataIds.length) actions.results.shared.groupMetadataIds(defaultMetadataToShow);

	actions.results.shared.sortAnnotationIds(initialState.results.shared.sortAnnotationIds);
	if (!getState().results.shared.sortAnnotationIds.length) actions.results.shared.sortAnnotationIds(defaultAnnotationsToShow);

	actions.results.shared.sortMetadataIds(initialState.results.shared.sortMetadataIds);
	if (!getState().results.shared.sortMetadataIds.length) actions.results.shared.sortMetadataIds(defaultMetadataToShow);


	/* Validate the annotations shown in the dependency tree in the hits result table.
	 * If none are set, search for likely annotations to map to the connlu properties in the tree.
	 * find all likely matches, then dedupe them.
	 * Null values won't shown anything.
	 * The word property itself is hardcoded to be the same as the concordance (i.e. words shown in the hit), so we don't need to configure that.
	 */
	actions.results.shared.dependencies(initialState.results.shared.dependencies);
	if (!Object.values(initialState.results.shared.dependencies).some(v => v != null)) {
		function findAnnotation(keywords: string[]): string[] {
			const ids = Object.keys(allAnnotationsMap).filter(id => allAnnotationsMap[id].hasForwardIndex);

			// return best match first. If multiple annotations match the same keyword, prefer the shortest one i.e. best match (e.g. pos > pos_with_features)
			const matches = ids.flatMap(id => {
				const matchIndex = keywords.findIndex(kw => id.toLowerCase().includes(kw));
				if (matchIndex === -1) return [];
				return {id, matchIndex};
			});
			const sortedMatches = matches.sort((a, b) => a.matchIndex - b.matchIndex === 0 ? a.id.length - b.id.length : a.matchIndex - b.matchIndex);
			return sortedMatches.map(m => m.id);
		}
		const lemmaCandidates = [getState().results.shared.dependencies.lemma || findAnnotation(['lemma', 'lem', 'lexeme', 'root', 'stem', 'canon'])].flat();
		const uposCandidates = [getState().results.shared.dependencies.upos || findAnnotation(['upos', 'pos', 'part', 'morph', 'speech', 'lex', 'class', 'cat'])].flat();
		const xposCandidates = [getState().results.shared.dependencies.xpos || findAnnotation(['xpos', 'pos', 'part', 'morph', 'speech', 'lex', 'class', 'cat'])].flat();
		const featsCandidates = [getState().results.shared.dependencies.feats || findAnnotation(['feats', 'features', 'pos', 'part', 'morph', 'speech', 'lex', 'class', 'cat'])].flat();
		let lemma = lemmaCandidates[0] || null;
		let upos = uposCandidates.find(candidate => candidate != lemma) || null;
		let xpos = xposCandidates.find(candidate => candidate != lemma && candidate != upos) || null;
		let feats = featsCandidates.find(candidate => candidate != lemma && candidate != upos && candidate != xpos) || null;
		actions.results.shared.dependencies({lemma, upos, xpos, feats});
	}

	// init custom annotation extension points, so vue reactivity will properly pick up on them
	CorpusStore.get.allAnnotations().forEach(annot => privateActions.search.shared.initCustomAnnotationRegistrationPoint(annot.id));

	Object.assign(initialState, cloneDeep(getState()));

	// disable our terrible hack
	alwaysCallbackAfterValidating = false;
};

// =======================
// Some helpers
// =======================

function createConfigurator<T extends Record<string, string[]>>(proppaths: T) {
	const r = function(config: [[undefined, ...Array<keyof T>],  [string, ...Array<boolean|undefined>]]) {
		const props = config.shift() as string[];
		const propvalues = {} as {[K in keyof T]: string[]};
		Object.keys(proppaths).forEach(function(propname: keyof T) { propvalues[propname] = []; });
		(config as Array<[string, ...Array<boolean|undefined>]>).forEach(function(field) {
			const id = field[0];
			field.forEach(function(value, index) {
				const propname: string|undefined = props[index]; // undefined at index 0
				if (value && propname && proppaths[propname]) {
					propvalues[propname].push(id);
				}
			});
		});

		Object.entries(propvalues).forEach(function(entry) {
			const propname = entry[0];
			const propvalue = entry[1];
			const proppath = proppaths[propname];

			if (propvalue.length === 0) {
				return;
			}

			const propfunction = proppath.reduce(function(scope, segment) {
				return scope[segment];
			}, actions as any);

			propfunction(propvalue);
		});
	};

	r.config = proppaths;
	return r;
}

/**
 * Terrible hack to validate settings that are set before the corpus is loaded.
 * This is because the setters have validation, but they don't do anything if the value is invalid.
 * This setting makes it so the setters clear the setting if the value is invalid (instead of doing nothing).
 * We can then detect this and set a default afterwards.
 */
let alwaysCallbackAfterValidating = false;
/** Validate all ids, triggering callbacks for failed ids, and triggering a final callback if there is any valid annotation. */
function validateAnnotations(
	ids: string[],
	missing: (id: string) => string,
	validate: (a: AppTypes.NormalizedAnnotation) => boolean,
	invalid: (id: string) => string,
	cb: (ids: string[]) => void
) {
	if (!CorpusStore.getState().corpus) { // not loaded yet
		cb(ids);
		return;
		// we will re-check this on init()?
	}
	const all = CorpusStore.get.allAnnotationsMap();
	const results = ids.filter(id => {
		if (!all[id]) { console.warn(missing(id)); return false; }
		if (!validate(all[id])) { console.warn(invalid(id)); return false; }
		return true;
	});

	// trigger if: list that was passed in is empty, or when any result remains after removing invalid ids.
	if (!ids.length || results.length || alwaysCallbackAfterValidating) {
		cb(results);
	}
}

/** Validate all ids, triggering callbacks for failed ids, and triggering a final callback if there is any valid annotation. */
function validateMetadata(
	ids: string[],
	missing: (id: string) => string,
	validate: (m: AppTypes.NormalizedMetadataField) => boolean,
	invalid: (id: string) => string,
	cb: (ids: string[]) => void
) {
	if (!CorpusStore.getState().corpus) {
		cb(ids);
		return;
		// assume we will re-check this on init()?
	}

	const all = CorpusStore.get.allMetadataFieldsMap();
	const results = ids.filter(id => {
		if (!all[id]) { console.warn(missing(id)); return false; }
		if (!validate(all[id])) { console.warn(invalid(id)); return false; }
		return true;
	});

	// trigger if: list that was passed in is empty, or when any result remains after removing invalid ids.
	if (!ids.length || results.length || alwaysCallbackAfterValidating) {
		cb(results);
	}
}

// =============

function getCheckmarks(
	config: Record<string, string[]>,
	groups: Array<{id: string, entries: string[], isRemainderGroup: boolean}>,
	remainderGroupName: string
): Array<{
	id: string;
	entries: Array<{id: string, checkmarks: Record<string, boolean>}>
}> {
	// Initialize outputs
	const entryMap: Record<string, {id: string, checkmarks: Record<string, boolean>}> = {};
	groups.forEach(g => g.entries.forEach(id => entryMap[id] = {id, checkmarks: {}}));

	// Fill outputs
	Object.entries(config).forEach(([checkmarkName, checkmarkPath]) => {
		const entriesToPutCheck: string[] = checkmarkPath.reduce((context, path) => (context as any)[path], getState()) || [];
		entriesToPutCheck.forEach(id => entryMap[id].checkmarks[checkmarkName] = true);
	});

	// Transform outputs into return
	const seenIds = new Set<string>();
	return groups.map(g => ({
		entries: g.entries.filter(id => {
			const seen = seenIds.has(id);
			seenIds.add(id);
			return !seen;
		}).map(id => entryMap[id]),
		id: g.isRemainderGroup ? remainderGroupName : g.id
	}));
}

function getCells(props: string[]) {
	return props.map(p => ({
		propName: p,
		header: `    '${p}'    `,
		checked: ' '.repeat(5 + Math.ceil(p.length / 2)-1) + 'x' + ' '.repeat(5 + Math.floor(p.length / 2)),
		unchecked: ' '.repeat(10 + p.length)
	}));
}

function printCustomizations() {
	// Annotations
	const defaultGroupName = '(not in any group)';

	const annotColumns = actions.helpers.configureAnnotations.config;
	const metadataColumns = actions.helpers.configureMetadata.config;

	// output stuff
	const annotationData = getCheckmarks(annotColumns, CorpusStore.get.annotationGroups(), defaultGroupName);
	const metadataData = getCheckmarks(metadataColumns, CorpusStore.get.metadataGroups(), defaultGroupName);
	const annotationCells = getCells(Object.keys(annotColumns));
	const metadataCells = getCells(Object.keys(metadataColumns));
	const longestAnnotId = annotationData.flatMap(g => g.entries).reduce((longest, cur) => Math.max(longest, cur.id.length), 0);
	const longestMetadataId = metadataData.flatMap(g => g.entries).reduce((longest, cur) => Math.max(longest, cur.id.length), 0);

	// Sort entries in the default groups by ID (instead of their original sorting by displayName) - Reads much better in output
	(annotationData.find(g => g.id === defaultGroupName) || {entries: [] as {id: string}[]}).entries.sort((a, b) => a.id.localeCompare(b.id));
	(metadataData.find(g => g.id === defaultGroupName) || {entries: [] as {id: string}[]}).entries.sort((a, b) => a.id.localeCompare(b.id));

	// tslint:disable-next-line
	console.log(html`
		var x = true;
		var ui = vuexModules.ui.actions;
		ui.helpers.configureAnnotations([
			[${' '.repeat(longestAnnotId+2)},${annotationCells.map(c => c.header).join(',')}],
			${annotationData.flatMap(g => [
				'',
				`// ${g.id}`,
				...g.entries.map(v => stripIndent`
					['${v.id}'${' '.repeat(longestAnnotId - v.id.length)},${annotationCells.map(c => v.checkmarks[c.propName] ? c.checked : c.unchecked).join(',')}],
				`)
			])}
		]);

		ui.helpers.configureMetadata([
			[${' '.repeat(longestMetadataId+2)},${metadataCells.map(c => c.header).join(',')}],
			${metadataData.flatMap(g => [
				'',
				`// ${g.id}`,
				...g.entries.map(v => stripIndent`
					['${v.id}'${' '.repeat(longestMetadataId - v.id.length)},${metadataCells.map(c => v.checkmarks[c.propName] ? c.checked : c.unchecked).join(',')}],
				`)
			])}
		]);
	`);
}

/** This object contains any customization "hook" functions for this corpus.
 *  It defines defaults that can be overridden from custom JS file(s); see below.
 */
const corpusCustomizations = {
	search: {
		within: {
			/** Customize which element(s) to include */
			include(element: Option) {
				return true;
			},

			/** Which, if any, attribute filter fields should be displayed for this element? */
			attributes(element: Option): string[]|Option[] {
				return [];
			},

			/*
			// Alternative approach: allow direct access to the elements array, so custom JS
			// can change that. But this relies on the corpus being loaded before the custom JS
			// (currently not the case), and might run into issues with reactivity(?)

			get elements(): Option[] {
				return getState().search.shared.within.elements;
			},

			set elements(elements: { value: string, title: string|null, label?: string }[]) {
				actions.search.shared.within.elements(elements);
			}
			*/
		},

		metadata: {
			/** Show this metadata search field? (return null for default behaviour) */
			show(name: string): boolean|null {
				return null;
			}
		}
	},

	results: {
		matchInfoHighlightStyle: (matchInfo: HighlightSection): string|null => {
			return null; // fall back to default behaviour
		}
	}
};

/** This lets custom JS files call frontend.customize((corpus) => { ... });
  * to customize any of the above "hooks". Doing this via a function instead of
  * direct access to a global object gives us more flexibility to change things
  * in the future.
  *
  * Example of a simple custom.js file using this:
  * <code>
  * frontend.customize((corpus) => {
  *   corpus.search.within.include = (element) => element.value === 'p';
  *   corpus.search.within.displayName = (element) => element.value === 'p' ? 'Paragraph' : null;
  * });
  * </code>
  */
(window as any).frontend = {
	customize(callback: ((corpus: any) => void)) {
		callback(corpusCustomizations);
	}
};

(window as any).printCustomJs = printCustomizations;

export {
	ModuleRootState,
	CustomView,

	getState,
	get,
	actions,
	init,

	namespace,

	corpusCustomizations,
};
