import { describe, expect, test } from 'vitest';

import { searchFormIds as ids } from '@/features/search/model/search-form-ids';

describe('standard search-form IDs', () => {
	test('emits stable namespaced paths for every standard node ID helper', () => {
		const generated = {
			root: ids.root(),
			searchSection: ids.searchSection(),
			searchSectionHeading: ids.searchSectionHeading(),
			searchFormsContainer: ids.searchFormsContainer(),
			searchForm: ids.searchForm('extended'),
			exploreSection: ids.exploreSection(),
			exploreSectionHeading: ids.exploreSectionHeading(),
			exploreFormsContainer: ids.exploreFormsContainer(),
			exploreForm: ids.exploreForm('ngram'),
			withinField: ids.withinField(),
			sharedFiltersRegion: ids.sharedFiltersRegion(),
			sharedFiltersHeading: ids.sharedFiltersHeading(),
			sharedFilters: ids.sharedFilters(),
			sharedFiltersSummary: ids.sharedFiltersSummary(),
			filterTab: ids.filterTab('Bibliographic'),
			metadataFilter: ids.metadataFilter('author'),
			withinFilter: ids.withinFilter('speech', 'person'),
			annotationTabs: ids.annotationTabs(),
			annotationTab: ids.annotationTab('Grammar'),
			annotationField: ids.annotationField('extended', 'contents__nl', 'pos'),
			queryRegion: ids.queryRegion('expert'),
			queryHeading: ids.queryHeading('expert'),
			queryField: ids.queryField('advanced'),
			queryFieldTemplate: ids.queryFieldTemplate('advanced'),
			exploreControls: ids.exploreControls('frequency'),
			exploreParallelSource: ids.exploreParallelSource('frequency'),
			exploreCorporaResultPreset: ids.exploreCorporaResultPreset(),
			exploreCorporaGroupBy: ids.exploreCorporaGroupBy(),
			exploreCorporaGroupDisplayMode: ids.exploreCorporaGroupDisplayMode(),
			exploreNgramGroupBy: ids.exploreNgramGroupBy(),
			exploreNgramTokens: ids.exploreNgramTokens(),
			exploreFrequencyAnnotation: ids.exploreFrequencyAnnotation(),
		};

		expect(Object.keys(generated).sort()).toEqual(
			Object.keys(ids)
				.filter(key => key !== 'formKind')
				.sort(),
		);
		expect(generated).toMatchInlineSnapshot(`
			{
			  "annotationField": "standard-search-form/annotation-field/extended/contents__nl/pos",
			  "annotationTab": "standard-search-form/annotation-tab/Grammar",
			  "annotationTabs": "standard-search-form/annotation-tabs",
			  "exploreControls": "standard-search-form/explore-controls/frequency",
			  "exploreCorporaGroupBy": "standard-search-form/explore-corpora-group-by",
			  "exploreCorporaGroupDisplayMode": "standard-search-form/explore-corpora-group-display-mode",
			  "exploreCorporaResultPreset": "standard-search-form/explore-corpora-result-preset",
			  "exploreForm": "standard-search-form/explore-form/ngram",
			  "exploreFormsContainer": "standard-search-form/forms/explore",
			  "exploreFrequencyAnnotation": "standard-search-form/explore-frequency-annotation",
			  "exploreNgramGroupBy": "standard-search-form/explore-ngram-group-by",
			  "exploreNgramTokens": "standard-search-form/explore-ngram-tokens",
			  "exploreParallelSource": "standard-search-form/explore-parallel-source/frequency",
			  "exploreSection": "standard-search-form/section/explore",
			  "exploreSectionHeading": "standard-search-form/section-heading/explore",
			  "filterTab": "standard-search-form/filter-tab/Bibliographic",
			  "metadataFilter": "standard-search-form/metadata-filter/author",
			  "queryField": "standard-search-form/query-field/advanced",
			  "queryFieldTemplate": "standard-search-form/query-field-template/advanced",
			  "queryHeading": "standard-search-form/query-heading/expert",
			  "queryRegion": "standard-search-form/query-region/expert",
			  "root": "standard-search-form/root",
			  "searchForm": "standard-search-form/search-form/extended",
			  "searchFormsContainer": "standard-search-form/forms/search",
			  "searchSection": "standard-search-form/section/search",
			  "searchSectionHeading": "standard-search-form/section-heading/search",
			  "sharedFilters": "standard-search-form/shared-filters",
			  "sharedFiltersHeading": "standard-search-form/shared-filters-heading",
			  "sharedFiltersRegion": "standard-search-form/shared-filters-region",
			  "sharedFiltersSummary": "standard-search-form/shared-filters-summary",
			  "withinField": "standard-search-form/within-field",
			  "withinFilter": "standard-search-form/within-filter/speech/person",
			}
		`);
	});

	test('accepts semantic objects without depending on display properties', () => {
		expect(ids.filterTab({ id: 'Bibliographic' })).toBe(ids.filterTab('Bibliographic'));
		expect(ids.metadataFilter({ id: 'author', defaultDisplayName: 'Author' } as { id: string })).toBe(ids.metadataFilter({ id: 'author', defaultDisplayName: 'Auteur' } as { id: string }));
		expect(ids.annotationField({ id: 'extended' }, { id: 'contents' }, { id: 'word' })).toBe(ids.annotationField('extended', 'contents', 'word'));
	});

	test('encodes collision-prone semantic segments injectively', () => {
		// Segment escaping keeps concatenation unambiguous: a separator in one
		// semantic value must not look like a boundary between two values.
		const values = ['a/b', 'a:b', 'a b', 'a%b', 'a.b', 'a-b', 'a_b', 'å', ''];
		const generated = values.map(ids.filterTab);

		expect(new Set(generated).size).toBe(values.length);
		expect(ids.filterTab('Part of speech')).not.toBe(ids.filterTab('Part-of-speech'));
		expect(ids.withinFilter('a/b', 'c')).not.toBe(ids.withinFilter('a', 'b/c'));
		expect(ids.annotationField('a/b', 'c', 'd')).not.toBe(ids.annotationField('a', 'b/c', 'd'));
		expect(ids.metadataFilter('same')).not.toBe(ids.filterTab('same'));
	});

	test('recognizes standard search and explore form IDs', () => {
		expect(ids.formKind(ids.searchForm('simple'))).toBe('search');
		expect(ids.formKind(ids.exploreForm('corpora'))).toBe('explore');
		expect(ids.formKind(ids.root())).toBeNull();
	});
});
