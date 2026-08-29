/**
 * INTERNAL CUSTOMIZATION API
 *
 * Application behavior consumed through useCustomizations(). This is not part
 * of the browser-facing customization contract.
 */

import { computed, markRaw, toValue, type MaybeRefOrGetter, type ObjectPlugin } from 'vue';

import type * as UIStore from '@/app/state/ui-state';
import type {
	SearchFormAnnotationControl,
	SearchFormCustomizationApi,
	SearchFormOption,
	SearchFormOptionGroup,
	SearchResultAnnotatedField,
	SearchResultExportContext,
	SearchResultHighlightStyle,
	SearchResultHitInfoContext,
	SearchResultOverview,
	SearchResultSpanAttribute,
} from '@/customization-api/external/external-api';
import { createSearchFormOverrideCollector } from '@/customization-api/external/search-form-configuration-api';
import { applyLegacySearchFormConfiguration } from '@/customization-api/external/search-form-legacy-adapter';
import { searchFormAnnotationControlKey } from '@/customization-api/shared/form/ids';
import type { SearchFormOverrides } from '@/customization-api/shared/form/search-form-overrides';
import type { HighlightSection } from '@/pages/search/results/table/hit-highlighting';
import type { Corpus, NormalizedAnnotatedField, NormalizedMetadataField } from '@/types/apptypes';
import type { BLDoc, BLHitInContext, BLHitGroupResults, BLHitResults, BLMatchInfo, BLSearchSummaryV5 } from '@/types/blacklabtypes';
import { isHitGroups } from '@/types/blacklabtypes';

import type { CustomizationRegistry } from '../registry';

import type { Translate } from '@/shared/i18n';
import { optionText, type OptGroup, type Option } from '@/shared/utils/options';
import useInjectable from '@/shared/utils/useInjectable';

export type SearchFilterTab = {
	tabname: string;
	subtabs: Array<{
		tabname?: string;
		fields: string[];
	}>;
	/** Filter query that is always included while this tab is active. */
	query?: Record<string, string[]>;
};

export type ResultHitAddon = ReturnType<UIStore.ModuleRootState['results']['hits']['addons'][number]>;

function activeResultCustomizations(registry: CustomizationRegistry) {
	return { legacy: registry.legacyApi.value!, results: registry.resultCustomizations.value };
}

function searchWithSpans(registry: CustomizationRegistry, query: string): boolean | null {
	const { legacy, results: customizations } = activeResultCustomizations(registry);
	for (let i = customizations.length - 1; i >= 0; i--) {
		const setting = customizations[i].withSpans;
		if (setting === undefined) continue;
		try {
			const result = typeof setting === 'boolean' ? setting : setting(query);
			if (result != null) return result;
		} catch (error) {
			console.error("Error in search results customization 'withSpans':", error);
		}
	}
	return legacy.search.pattern.shouldAddWithSpans(query);
}

function resultMetadataField(registry: CustomizationRegistry, field: NormalizedMetadataField): boolean | null {
	const { legacy, results: customizations } = activeResultCustomizations(registry);
	for (let i = customizations.length - 1; i >= 0; i--) {
		const include = customizations[i].includeMetadataField;
		if (!include) continue;
		try {
			const result = include(field);
			if (result != null) return result;
		} catch (error) {
			console.error("Error in search results customization 'includeMetadataField':", error);
		}
	}
	return legacy.search.metadata.showField(field.id);
}

function matchInfoHighlightStyle(registry: CustomizationRegistry, section: HighlightSection): SearchResultHighlightStyle | null {
	const { legacy, results: customizations } = activeResultCustomizations(registry);
	for (let i = customizations.length - 1; i >= 0; i--) {
		const style = customizations[i].highlightStyle;
		if (!style) continue;
		try {
			const result = style(section);
			if (result != null) return result;
		} catch (error) {
			console.error("Error in search results customization 'highlightStyle':", error);
		}
	}
	return legacy.results.matchInfoHighlightStyle(section);
}

function toPublicAnnotatedField(field: NormalizedAnnotatedField, displayName: string): SearchResultAnnotatedField {
	return {
		id: field.id,
		displayName,
		prefix: field.isParallel ? field.prefix : undefined,
		version: field.isParallel ? field.version : undefined,
	};
}

function createSearchResultOverview(results: BLHitResults | BLHitGroupResults, isParallelCorpus: boolean): SearchResultOverview {
	const common = {
		isParallelCorpus,
		processed: results.summary.results.stats.processed,
		counted: results.summary.results.stats.counted,
		summary: results.summary,
	};
	if (isHitGroups(results)) {
		return {
			...common,
			kind: 'hit-groups',
			groups: results.hitGroups,
		};
	}
	return {
		...common,
		kind: 'hits',
		hits: results.hits,
		documents: Object.fromEntries(Object.entries(results.docInfos).map(([docPid, docInfo]) => [docPid, { docPid, ...docInfo }])),
	};
}

function hitInfoColumnVisible(registry: CustomizationRegistry, results: BLHitResults | BLHitGroupResults, isParallelCorpus: boolean): boolean {
	const { legacy, results: customizations } = activeResultCustomizations(registry);
	for (let i = customizations.length - 1; i >= 0; i--) {
		const column = customizations[i].hitInfoColumn;
		if (!column) continue;
		if (typeof column.visible === 'boolean') return column.visible;
		if (!column.visible) return true;
		try {
			return column.visible(createSearchResultOverview(results, isParallelCorpus));
		} catch (error) {
			console.error("Error in search results customization 'hitInfoColumn.visible':", error);
			break;
		}
	}
	return legacy.results.hasCustomHitInfoColumn(results, isParallelCorpus);
}

function hitInfoColumnContent(registry: CustomizationRegistry, corpus: Corpus, hit: BLHitInContext, field: NormalizedAnnotatedField, document: BLDoc, translate: Translate): string | null {
	const { legacy, results: customizations } = activeResultCustomizations(registry);
	const fieldDisplayName = translate.$tAnnotatedFieldDisplayName(field);
	const { docInfo, ...documentResult } = document;
	for (let i = customizations.length - 1; i >= 0; i--) {
		const column = customizations[i].hitInfoColumn;
		if (!column) continue;
		const context: SearchResultHitInfoContext = {
			corpus,
			hit,
			spans: Object.values(hit.matchInfos ?? {}).flatMap(info => {
				if (info.type === 'tag') return [info];
				if (info.type === 'list') return info.infos.filter((item): item is Extract<BLMatchInfo, { type: 'tag' }> => item.type === 'tag');
				return [];
			}),
			field: toPublicAnnotatedField(field, fieldDisplayName),
			document: { ...documentResult, ...docInfo },
		};
		try {
			return column.content(context);
		} catch (error) {
			console.error("Error in search results customization 'hitInfoColumn.content':", error);
			break;
		}
	}
	return legacy.results.customHitInfo(hit, fieldDisplayName, document);
}

function exportDescription(registry: CustomizationRegistry, corpus: Corpus, summary: BLSearchSummaryV5, fieldDisplayName: (fieldId: string) => string): string | null {
	const { legacy, results: customizations } = activeResultCustomizations(registry);
	for (let i = customizations.length - 1; i >= 0; i--) {
		const description = customizations[i].exportDescription;
		if (!description) continue;
		try {
			const field = (fieldId: string): SearchResultAnnotatedField => {
				const normalized = corpus.allAnnotatedFieldsMap[fieldId];
				return normalized ? toPublicAnnotatedField(normalized, fieldDisplayName(fieldId)) : { id: fieldId, displayName: fieldDisplayName(fieldId) };
			};
			const sourceFieldId = summary.pattern?.fieldName ?? corpus.mainAnnotatedField;
			const context: SearchResultExportContext = {
				corpus,
				sourceField: field(sourceFieldId),
				targetFields: (summary.pattern?.otherFields ?? []).map(field),
				bcql: summary.pattern?.bcql,
				summary,
			};
			return description(context);
		} catch (error) {
			console.error("Error in search results customization 'exportDescription':", error);
			break;
		}
	}
	return legacy.results.export.description(summary, fieldDisplayName);
}

function exportSpanAttribute(registry: CustomizationRegistry, attribute: SearchResultSpanAttribute): boolean | null {
	const { legacy, results: customizations } = activeResultCustomizations(registry);
	for (let i = customizations.length - 1; i >= 0; i--) {
		const include = customizations[i].includeExportSpanAttribute;
		if (!include) continue;
		try {
			const result = include(attribute);
			if (result != null) return result;
		} catch (error) {
			console.error("Error in search results customization 'includeExportSpanAttribute':", error);
		}
	}
	return legacy.results.export.includeSpanAttribute(attribute.elementName, attribute.attributeName);
}

function groupingSpanAttribute(registry: CustomizationRegistry, attribute: SearchResultSpanAttribute): boolean | null {
	const { legacy, results: customizations } = activeResultCustomizations(registry);
	for (let i = customizations.length - 1; i >= 0; i--) {
		const include = customizations[i].includeGroupingSpanAttribute;
		if (!include) continue;
		try {
			const result = include(attribute);
			if (result != null) return result;
		} catch (error) {
			console.error("Error in search results customization 'includeGroupingSpanAttribute':", error);
		}
	}
	return legacy.group.includeSpanAttribute(attribute.elementName, attribute.attributeName);
}

function toPublicOption(option: string | Option): string | SearchFormOption {
	if (typeof option === 'string') return option;
	return {
		value: option.value,
		label: optionText(option.label),
		title: optionText(option.title),
		disabled: option.disabled,
	};
}

function toPublicOptionGroup(group: OptGroup): SearchFormOptionGroup {
	return {
		label: optionText(group.label),
		title: optionText(group.title),
		disabled: group.disabled,
		options: group.options.map(toPublicOption),
	};
}

function sortOptionGroup(registry: CustomizationRegistry, group: OptGroup): OptGroup {
	const { legacy, results: customizations } = activeResultCustomizations(registry);
	let result = legacy.sort.customize(group) ?? group;
	for (const customization of customizations) {
		if (!customization.customizeSorting) continue;
		try {
			result = customization.customizeSorting(toPublicOptionGroup(result)) ?? result;
		} catch (error) {
			console.error("Error in search results customization 'customizeSorting':", error);
		}
	}
	return result;
}

function groupOptionGroup(registry: CustomizationRegistry, group: OptGroup, translate: Translate): OptGroup {
	const { legacy, results: customizations } = activeResultCustomizations(registry);
	let result = legacy.group.customize(group, translate) ?? group;
	for (const customization of customizations) {
		if (!customization.customizeGrouping) continue;
		try {
			result = customization.customizeGrouping(toPublicOptionGroup(result), translate) ?? result;
		} catch (error) {
			console.error("Error in search results customization 'customizeGrouping':", error);
		}
	}
	return result;
}

function collectSearchFormOverrides(registry: CustomizationRegistry, corpus: Corpus): SearchFormOverrides {
	const { api, overrides } = createSearchFormOverrideCollector(corpus);
	const legacyApi = registry.legacyApi.value;
	if (legacyApi) applyLegacySearchFormConfiguration(api, legacyApi);
	for (const configure of registry.formConfigurators.value) {
		try {
			configure(api);
		} catch (error) {
			console.error('Error in search form configuration callback:', error);
		}
	}
	return overrides;
}

function createCustomizationApi(
	registry: CustomizationRegistry,
	corpus: MaybeRefOrGetter<Corpus>,
	uiState: MaybeRefOrGetter<UIStore.ModuleRootState>,
	setConcordanceAnnotationId: (id: string) => void,
) {
	// Configuration callbacks are imperative, so collect their writes once per
	// registry/corpus change. The accessors below merge these sparse overrides
	// with live UI-state defaults.
	const searchFormOverrides = computed(() => collectSearchFormOverrides(registry, toValue(corpus)));
	const state = () => toValue(uiState);
	const configuredDefault = (value: string | null, availableValues: readonly string[]) => (value && availableValues.includes(value) ? value : (availableValues[0] ?? null));
	const includeWithinElement = (elementName: string) => {
		try {
			return searchFormOverrides.value.within.includeElement?.(elementName) ?? true;
		} catch (error) {
			console.error("Error in search form customization 'within.includeElement':", error);
			return true;
		}
	};
	const includeWithinAttribute = (elementName: string, attributeName: string) => {
		try {
			return searchFormOverrides.value.within.includeAttribute?.(elementName, attributeName) ?? false;
		} catch (error) {
			console.error("Error in search form customization 'within.includeAttribute':", error);
			return false;
		}
	};

	return {
		searchFormSimpleAnnotation() {
			const currentCorpus = toValue(corpus);
			const annotatedFieldId = currentCorpus.isParallelCorpus ? currentCorpus.parallelAnnotatedFields[0]?.id : currentCorpus.mainAnnotatedField;
			const sourceField = annotatedFieldId ?? currentCorpus.mainAnnotatedField;
			const annotationId = searchFormOverrides.value.simpleAnnotationId ?? state().search.simple.searchAnnotationId;
			return { ...(currentCorpus.allAnnotatedFieldsMap[sourceField]?.annotations[annotationId] || currentCorpus.firstMainAnnotation), annotatedFieldId: sourceField };
		},
		searchFormExtendedAnnotationIds: () => searchFormOverrides.value.extendedAnnotationIds ?? state().search.extended.searchAnnotationIds,
		searchFormSplitBatchEnabled: () => state().search.extended.splitBatch.enabled,
		searchFormAnnotationControl(annotationId: string, annotatedFieldId?: string): Exclude<SearchFormAnnotationControl, 'auto'> | null {
			return searchFormOverrides.value.annotationControls[searchFormAnnotationControlKey(annotationId, annotatedFieldId)] ?? null;
		},
		searchFormAdvancedEnabled: () => searchFormOverrides.value.advanced.enabled ?? state().search.advanced.enabled,
		searchFormAdvancedAnnotationIds: () => searchFormOverrides.value.advanced.annotationIds ?? state().search.advanced.searchAnnotationIds,
		searchFormAdvancedDefaultAnnotationId(availableValues?: readonly string[]) {
			const value = searchFormOverrides.value.advanced.defaultAnnotationId ?? state().search.advanced.defaultSearchAnnotationId;
			const annotationIds = searchFormOverrides.value.advanced.annotationIds ?? state().search.advanced.searchAnnotationIds;
			return availableValues ? configuredDefault(value, availableValues) : (configuredDefault(value, annotationIds) ?? '');
		},
		searchFormMetadataFieldIds() {
			const fieldIds = searchFormOverrides.value.metadataFieldIds ?? state().search.shared.searchMetadataIds;
			const hidden = new Set(searchFormOverrides.value.hiddenMetadataFieldIds);
			return hidden.size ? fieldIds.filter(fieldId => !hidden.has(fieldId)) : fieldIds;
		},
		searchFormSpanFilters: () => searchFormOverrides.value.spanFilters,
		searchFormWithinEnabled: () => searchFormOverrides.value.within.enabled ?? state().search.shared.within.enabled,
		searchFormSentenceElement: () => state().search.shared.within.sentenceElement,
		searchFormWithinOptions() {
			const spans = toValue(corpus).relations.spans ?? {};
			const configured = (searchFormOverrides.value.within.elements ?? state().search.shared.within.elements).filter(
				option => !option.value || (spans[option.value] && includeWithinElement(option.value)),
			);
			const options = configured.length
				? [...configured]
				: Object.keys(spans)
						.filter(includeWithinElement)
						.map(value => ({ value, label: value }));
			if (!options.some(element => !element.value)) options.unshift({ value: '', label: '' });
			return { options, sorted: !configured.length };
		},
		searchFormWithinAttributes(elementName: string) {
			const attributes = toValue(corpus).relations.spans?.[elementName]?.attributes ?? {};
			return Object.keys(attributes).filter(attributeName => includeWithinAttribute(elementName, attributeName));
		},
		searchFormAlignByEnabled: () => searchFormOverrides.value.alignBy.enabled ?? state().search.shared.alignBy.enabled,
		searchFormAlignByElements: () => searchFormOverrides.value.alignBy.elements ?? state().search.shared.alignBy.elements,
		searchFormAlignByDefault() {
			const elements = searchFormOverrides.value.alignBy.elements ?? state().search.shared.alignBy.elements;
			const value = searchFormOverrides.value.alignBy.defaultValue ?? state().search.shared.alignBy.defaultValue;
			return configuredDefault(
				value,
				elements.map(element => element.value),
			);
		},
		searchFormExploreSearchAnnotationIds: () => searchFormOverrides.value.explore.searchAnnotationIds ?? state().explore.searchAnnotationIds,
		searchFormExploreDefaultSearchAnnotationId(availableValues: readonly string[]) {
			const override = searchFormOverrides.value.explore.defaultSearchAnnotationId;
			return configuredDefault(override !== undefined ? override : state().explore.defaultSearchAnnotationId || null, availableValues);
		},
		searchFormExploreGroupAnnotationIds: () => searchFormOverrides.value.explore.groupAnnotationIds ?? state().results.shared.groupAnnotationIds,
		searchFormExploreDefaultGroupAnnotationId(availableValues: readonly string[]) {
			const override = searchFormOverrides.value.explore.defaultGroupAnnotationId;
			return configuredDefault(override !== undefined ? override : state().explore.defaultGroupAnnotationId || null, availableValues);
		},
		searchFormExploreAnnotationGroupLabelsVisible: () => searchFormOverrides.value.explore.annotationGroupLabelsVisible ?? state().dropdowns.groupBy.annotationGroupLabelsVisible,
		searchFormExploreGroupMetadataIds() {
			const fieldIds = searchFormOverrides.value.explore.groupMetadataIds ?? state().results.shared.groupMetadataIds;
			const hidden = new Set(searchFormOverrides.value.hiddenMetadataFieldIds);
			return hidden.size ? fieldIds.filter(fieldId => !hidden.has(fieldId)) : fieldIds;
		},
		searchFormExploreDefaultGroupMetadataId(availableValues: readonly string[]) {
			const override = searchFormOverrides.value.explore.defaultGroupMetadataId;
			const configured = override !== undefined ? override : state().explore.defaultGroupMetadataId;
			return configuredDefault(configured ? `field:${configured}` : null, availableValues);
		},
		searchFormExploreMetadataGroupLabelsVisible: () => searchFormOverrides.value.explore.metadataGroupLabelsVisible ?? state().dropdowns.groupBy.metadataGroupLabelsVisible,
		searchFormLexiconDatabase: () => searchFormOverrides.value.lexiconDatabase ?? state().global.lexiconDb,

		resultConcordanceAnnotationIdOptions: () => state().results.shared.concordanceAnnotationIdOptions,
		resultConcordanceAnnotationId: () => state().results.shared.concordanceAnnotationId,
		setResultConcordanceAnnotationId: setConcordanceAnnotationId,
		resultConcordanceSize: () => state().results.shared.concordanceSize,
		resultConcordanceAsHtml: () => state().results.shared.concordanceAsHtml,
		resultDetailedAnnotationIds: () => state().results.shared.detailedAnnotationIds,
		resultDetailedMetadataIds: () => state().results.shared.detailedMetadataIds,
		resultGroupAnnotationIds: () => state().results.shared.groupAnnotationIds,
		resultGroupMetadataIds: () => state().results.shared.groupMetadataIds,
		resultSortAnnotationIds: () => state().results.shared.sortAnnotationIds,
		resultSortMetadataIds: () => state().results.shared.sortMetadataIds,
		resultExportEnabled: () => state().results.shared.exportEnabled,
		resultDependencies: () => state().results.shared.dependencies,
		resultGroupAnnotationLabelsVisible: () => state().dropdowns.groupBy.annotationGroupLabelsVisible,
		resultGroupMetadataLabelsVisible: () => state().dropdowns.groupBy.metadataGroupLabelsVisible,
		resultSortAnnotationLabelsVisible: () => state().dropdowns.sortBy.annotationGroupLabelsVisible,
		resultSortMetadataLabelsVisible: () => state().dropdowns.sortBy.metadataGroupLabelsVisible,
		resultShownAnnotationIds: () => state().results.hits.shownAnnotationIds,
		resultShownMetadataIds: (kind: 'hits' | 'docs') => state().results[kind].shownMetadataIds,
		resultViews: () => state().results.customViews,
		resultHitAddons: () => state().results.hits.addons,
		resultDocumentSummary: (...args: Parameters<UIStore.ModuleRootState['results']['shared']['getDocumentSummary']>) => state().results.shared.getDocumentSummary(...args),
		transformResultSnippet(snippet: Parameters<NonNullable<UIStore.ModuleRootState['results']['shared']['transformSnippets']>>[0]) {
			state().results.shared.transformSnippets?.(snippet);
		},
		formatError: (...args: Parameters<UIStore.ModuleRootState['global']['errorMessage']>) => state().global.errorMessage(...args),

		customizeSearchForm(api: SearchFormCustomizationApi) {
			for (const customize of registry.formCustomizers.value) {
				try {
					customize(api);
				} catch (error) {
					console.error('Error in search form graph customization callback:', error);
				}
			}
		},
		searchFormAnnotationUiType: (annotatedFieldId: string, annotationId: string) => registry.legacyApi.value?.search.pattern.uiType(annotatedFieldId, annotationId) ?? null,
		searchWithSpans: (query: string) => searchWithSpans(registry, query),
		resultMetadataField: (field: NormalizedMetadataField) => resultMetadataField(registry, field),
		matchInfoHighlightStyle: (section: HighlightSection) => matchInfoHighlightStyle(registry, section),
		hitInfoColumnVisible: (results: BLHitResults | BLHitGroupResults, isParallelCorpus: boolean) => hitInfoColumnVisible(registry, results, isParallelCorpus),
		hitInfoColumnContent: (hit: BLHitInContext, field: NormalizedAnnotatedField, document: BLDoc, translate: Translate) =>
			hitInfoColumnContent(registry, toValue(corpus), hit, field, document, translate),
		exportDescription: (summary: BLSearchSummaryV5, fieldDisplayName: (fieldId: string) => string) => exportDescription(registry, toValue(corpus), summary, fieldDisplayName),
		exportSpanAttribute: (attribute: SearchResultSpanAttribute) => exportSpanAttribute(registry, attribute),
		groupingSpanAttribute: (attribute: SearchResultSpanAttribute) => groupingSpanAttribute(registry, attribute),
		sortOptionGroup: (group: OptGroup) => sortOptionGroup(registry, group),
		groupOptionGroup: (group: OptGroup, translate: Translate) => groupOptionGroup(registry, group, translate),

		searchFilterTabs: (registeredFilters: Readonly<Record<string, unknown>>, builtinFiltersToShow: readonly string[], translate: Pick<Translate, '$tMetaGroupName'>): SearchFilterTab[] => {
			const currentCorpus = toValue(corpus);
			const legacy = registry.legacyApi.value!;
			const filterGroups: SearchFilterTab[] = currentCorpus.metadataGroups.map(group => ({
				tabname: group.id,
				subtabs: [{ fields: group.fields.map(field => field.id) }],
			}));

			for (const tab of legacy.search.metadata._customTabs) {
				const tabname = tab.name ?? tab.tabname ?? '';
				const subtabs = tab.subtabs
					? tab.subtabs.map(subtab => ({
							tabname: subtab.tabname,
							fields: subtab.fields.flatMap(field => (typeof field === 'string' ? [field] : field.id ? [field.id] : [])),
						}))
					: [{ fields: (tab.fields ?? []).flatMap(field => (typeof field === 'string' ? [field] : field.id ? [field.id] : [])) }];
				const existingGroup = filterGroups.find(group => group.tabname === tabname);
				if (existingGroup) {
					(existingGroup.subtabs[0] ??= { fields: [] }).fields.push(...subtabs.flatMap(subtab => subtab.fields));
				} else {
					filterGroups.push({ tabname, subtabs, query: tab.query });
				}
			}

			const availableBuiltinFilters = currentCorpus.allMetadataFieldsMap;
			const customFilters = Object.keys(registeredFilters).filter(id => !availableBuiltinFilters[id]);
			const allIdsToShow = new Set([...builtinFiltersToShow, ...customFilters]);

			return filterGroups
				.map(group => ({
					tabname: translate.$tMetaGroupName(group.tabname)?.toString() ?? '',
					subtabs: group.subtabs
						.map(subtab => ({
							tabname: translate.$tMetaGroupName(subtab.tabname)?.toString(),
							fields: subtab.fields.filter(id => {
								const showField = legacy.search.metadata.showField(id);
								return showField === true || (showField === null && allIdsToShow.has(id));
							}),
						}))
						.filter(subtab => subtab.fields.length),
					query: group.query,
				}))
				.filter(group => group.subtabs.length);
		},

		/** Legacy behavior: should this span be available in the within widget? */
		legacyShouldIncludeWithinSpan: (spanName: string) => registry.legacyApi.value!.search.within.includeSpan(spanName),

		/** Legacy behavior: should this span attribute be available in the within widget? */
		legacyShouldIncludeWithinAttribute: (spanName: string, attributeName: string) => registry.legacyApi.value!.search.within.includeAttribute(spanName, attributeName),
	};
}

export type Customizations = ReturnType<typeof createCustomizationApi>;
export type CustomizationsPlugin = ObjectPlugin & Customizations;

type CustomizationsInjection = {
	customizations: Customizations;
	corpus: MaybeRefOrGetter<Corpus | undefined>;
};

const [_key, provideCustomizations, useInjectedCustomizations] = useInjectable<CustomizationsInjection>('customizations');

export function useCustomizations(): Customizations {
	const injected = useInjectedCustomizations();
	if (!toValue(injected.corpus)) throw new Error('useCustomizations() called without a loaded corpus.');
	return injected.customizations;
}

export function createCustomizations(
	registry: CustomizationRegistry,
	corpus: MaybeRefOrGetter<Corpus | undefined>,
	uiState: MaybeRefOrGetter<UIStore.ModuleRootState>,
	setConcordanceAnnotationId: (id: string) => void,
): CustomizationsPlugin {
	const customizations = markRaw(createCustomizationApi(registry, corpus as MaybeRefOrGetter<Corpus>, uiState, setConcordanceAnnotationId));
	return {
		...customizations,
		install(app) {
			provideCustomizations(app, { customizations, corpus });
		},
	};
}
