import type { PatternMode } from '@/features/search/model/form/pattern-state';

export type ExploreFormMode = 'corpora' | 'ngram' | 'frequency';
type SearchFormSection = 'search' | 'explore';
export type SemanticId = string | { id: string };

const NAMESPACE = 'standard-search-form';

function semanticId(value: SemanticId): string {
	return typeof value === 'string' ? value : value.id;
}

/**
 * NOTE: the form ids work through concatenation; a child's Id is typicall <parent_id><separator><child_id>.
 * However, the ids can be user-supplied, so we need to make sure the concatenation is injective (i.e. output is unique for every unique input).
 * Basically ensure that this operation will never result in collisions.
 * To do this, we escape the segments so that the separator character ("/") cannot appear in any segment.
 */
function segment(value: SemanticId): string {
	return encodeURIComponent(semanticId(value));
}

function id(family: string, ...semanticPath: SemanticId[]): string {
	return [NAMESPACE, family, ...semanticPath.map(segment)].join('/');
}

function formKind(formId: string): SearchFormSection | null {
	if (formId.startsWith(`${id('search-form')}/`)) return 'search';
	if (formId.startsWith(`${id('explore-form')}/`)) return 'explore';
	return null;
}

/** Predictable IDs for every node created by the standard search-form builder. */
export const searchFormIds = {
	root: () => id('root'),

	searchSection: () => id('section', 'search'),
	searchSectionHeading: () => id('section-heading', 'search'),
	searchFormsContainer: () => id('forms', 'search'),
	searchForm: (mode: PatternMode) => id('search-form', mode),

	exploreSection: () => id('section', 'explore'),
	exploreSectionHeading: () => id('section-heading', 'explore'),
	exploreFormsContainer: () => id('forms', 'explore'),
	exploreForm: (mode: ExploreFormMode) => id('explore-form', mode),

	withinField: () => id('within-field'),
	sharedFiltersRegion: () => id('shared-filters-region'),
	sharedFiltersHeading: () => id('shared-filters-heading'),
	sharedFilters: () => id('shared-filters'),
	sharedFiltersSummary: () => id('shared-filters-summary'),
	filterTab: (group: SemanticId) => id('filter-tab', group),
	metadataFilter: (field: SemanticId) => id('metadata-filter', field),
	withinFilter: (element: SemanticId, attribute: SemanticId) => id('within-filter', element, attribute),

	annotationTabs: () => id('annotation-tabs'),
	annotationTab: (group: SemanticId) => id('annotation-tab', group),
	annotationField: (scope: SemanticId, annotatedField: SemanticId, annotation: SemanticId) => id('annotation-field', scope, annotatedField, annotation),

	queryRegion: (mode: PatternMode) => id('query-region', mode),
	queryHeading: (mode: PatternMode) => id('query-heading', mode),
	queryField: (mode: PatternMode) => id('query-field', mode),
	queryFieldTemplate: (mode: PatternMode) => id('query-field-template', mode),

	exploreControls: (mode: ExploreFormMode) => id('explore-controls', mode),
	exploreParallelSource: (mode: Exclude<ExploreFormMode, 'corpora'>) => id('explore-parallel-source', mode),
	exploreCorporaResultPreset: () => id('explore-corpora-result-preset'),
	exploreCorporaGroupBy: () => id('explore-corpora-group-by'),
	exploreCorporaGroupDisplayMode: () => id('explore-corpora-group-display-mode'),
	exploreNgramGroupBy: () => id('explore-ngram-group-by'),
	exploreNgramTokens: () => id('explore-ngram-tokens'),
	exploreFrequencyAnnotation: () => id('explore-frequency-annotation'),

	formKind,
} as const;
