import { vi, type Mock } from 'vitest';
import type { App, MaybeRefOrGetter } from 'vue';

import { provideCustomizations, type Customizations } from '@/customization-api/internal/internal-api';
import type { Corpus } from '@/types/apptypes';

/** Create a separate customization provider and call history for each test. */
export function createMockCustomizations(corpus: MaybeRefOrGetter<Corpus | undefined>) {
	const customizations: { [Method in keyof Customizations]: Mock<Customizations[Method]> } = {
		searchFormSimpleAnnotation: vi.fn(() => {
			throw new Error('Configure searchFormSimpleAnnotation for this test');
		}),
		searchFormExtendedAnnotationIds: vi.fn(() => []),
		searchFormAnnotationControl: vi.fn(() => null),
		searchFormAdvancedEnabled: vi.fn(() => false),
		searchFormAdvancedAnnotationIds: vi.fn(() => []),
		searchFormAdvancedDefaultAnnotationId: vi.fn(availableValues => (availableValues ? (availableValues[0] ?? null) : '')),
		searchFormMetadataFieldIds: vi.fn(() => []),
		searchFormSpanFilters: vi.fn(() => []),
		searchFormWithinEnabled: vi.fn(() => false),
		searchFormSentenceElement: vi.fn(() => null),
		searchFormWithinOptions: vi.fn(() => ({ options: [{ value: '', label: '' }], sorted: false })),
		searchFormWithinAttributes: vi.fn(() => []),
		searchFormAlignByEnabled: vi.fn(() => false),
		searchFormAlignByElements: vi.fn(() => []),
		searchFormAlignByDefault: vi.fn(() => null),
		searchFormExploreSearchAnnotationIds: vi.fn(() => []),
		searchFormExploreDefaultSearchAnnotationId: vi.fn(availableValues => availableValues[0] ?? null),
		searchFormExploreGroupAnnotationIds: vi.fn(() => []),
		searchFormExploreDefaultGroupAnnotationId: vi.fn(availableValues => availableValues[0] ?? null),
		searchFormExploreAnnotationGroupLabelsVisible: vi.fn(() => false),
		searchFormExploreGroupMetadataIds: vi.fn(() => []),
		searchFormExploreDefaultGroupMetadataId: vi.fn(availableValues => availableValues[0] ?? null),
		searchFormExploreMetadataGroupLabelsVisible: vi.fn(() => false),
		searchFormLexiconDatabase: vi.fn(() => ''),
		resultConcordanceAnnotationIdOptions: vi.fn(() => []),
		resultConcordanceAnnotationId: vi.fn(() => ''),
		setResultConcordanceAnnotationId: vi.fn(),
		resultConcordanceSize: vi.fn(() => 50),
		resultConcordanceAsHtml: vi.fn(() => false),
		resultDetailedAnnotationIds: vi.fn(() => []),
		resultDetailedMetadataIds: vi.fn(() => []),
		resultGroupAnnotationIds: vi.fn(() => []),
		resultGroupMetadataIds: vi.fn(() => []),
		resultSortAnnotationIds: vi.fn(() => []),
		resultSortMetadataIds: vi.fn(() => []),
		resultExportEnabled: vi.fn(() => false),
		resultDependencies: vi.fn(() => ({ lemma: null, upos: null, xpos: null, feats: [], relationClass: null })),
		resultGroupAnnotationLabelsVisible: vi.fn(() => false),
		resultGroupMetadataLabelsVisible: vi.fn(() => false),
		resultSortAnnotationLabelsVisible: vi.fn(() => false),
		resultSortMetadataLabelsVisible: vi.fn(() => false),
		resultShownAnnotationIds: vi.fn(() => []),
		resultShownMetadataIds: vi.fn(() => []),
		resultViews: vi.fn(() => []),
		resultHitAddons: vi.fn(() => []),
		resultDocumentSummary: vi.fn(() => ''),
		transformResultSnippet: vi.fn(),
		formatError: vi.fn(error => error.message),
		customizeSearchForm: vi.fn(),
		searchFormAnnotationUiType: vi.fn(() => null),
		searchWithSpans: vi.fn(() => null),
		resultMetadataField: vi.fn(() => null),
		matchInfoHighlightStyle: vi.fn(() => null),
		hitInfoColumnVisible: vi.fn(() => false),
		hitInfoColumnLink: vi.fn(() => false),
		hitInfoColumnContent: vi.fn(() => null),
		exportDescription: vi.fn(() => null),
		exportSpanAttribute: vi.fn(() => null),
		groupingSpanAttribute: vi.fn(() => null),
		sortOptionGroup: vi.fn(group => group),
		groupOptionGroup: vi.fn(group => group),
		searchFilterTabs: vi.fn(() => []),
		legacyShouldIncludeWithinSpan: vi.fn(() => false),
		legacyShouldIncludeWithinAttribute: vi.fn(() => false),
	};
	return Object.assign(customizations, {
		install(app: App) {
			provideCustomizations(app, { customizations, corpus });
		},
	});
}
