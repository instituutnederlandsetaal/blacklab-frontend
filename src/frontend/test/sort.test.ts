// @vitest-environment jsdom

import { shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref } from 'vue';

import type { Corpus } from '@/types/apptypes';

import type { OptGroup } from '@/shared/utils/options';

import Sort from '@/pages/search/results/Sort.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

const mock = vi.hoisted(() => ({
	getAnnotationSubset: vi.fn(() => []),
	getMetadataSubset: vi.fn(() => []),
	resultSortAnnotationIds: vi.fn(),
	resultSortAnnotationLabelsVisible: vi.fn(),
	resultSortMetadataIds: vi.fn(),
	resultSortMetadataLabelsVisible: vi.fn(),
	sortOptionGroup: vi.fn((group: OptGroup) => group),
}));

vi.mock('@/customization-api/internal/internal-api', () => ({
	useCustomizations: () => ({
		resultSortAnnotationIds: mock.resultSortAnnotationIds,
		resultSortAnnotationLabelsVisible: mock.resultSortAnnotationLabelsVisible,
		resultSortMetadataIds: mock.resultSortMetadataIds,
		resultSortMetadataLabelsVisible: mock.resultSortMetadataLabelsVisible,
		resultMetadataField: vi.fn(() => true),
		sortOptionGroup: mock.sortOptionGroup,
	}),
}));
vi.mock('@/shared/blacklab-helpers/field-groups', () => ({
	getAnnotationSubset: mock.getAnnotationSubset,
	getMetadataSubset: mock.getMetadataSubset,
}));
vi.mock('@/shared/i18n', () => ({
	useI18n: () => ({
		$t: (key: string, params?: { field?: string; scorer?: string }) => (params?.field ? `${key}:${params.field}` : params?.scorer ? `${key}:${params.scorer}` : key),
	}),
}));

const annotationIds = ref<string[]>([]);
const annotationLabels = ref(false);
const metadataIds = ref<string[]>([]);
const metadataLabels = ref(false);
const corpus = {
	annotationGroups: [],
	annotatedFields: { contents: { annotations: {} } },
	isParallelCorpus: true,
	mainAnnotatedField: 'contents',
	metadataFieldGroups: [],
	metadataFields: {},
} as unknown as Corpus;

beforeEach(() => {
	vi.clearAllMocks();
	annotationIds.value = [];
	annotationLabels.value = false;
	metadataIds.value = [];
	metadataLabels.value = false;
	mock.resultSortAnnotationIds.mockImplementation(() => annotationIds.value);
	mock.resultSortAnnotationLabelsVisible.mockImplementation(() => annotationLabels.value);
	mock.resultSortMetadataIds.mockImplementation(() => metadataIds.value);
	mock.resultSortMetadataLabelsVisible.mockImplementation(() => metadataLabels.value);
});

describe('Sort', () => {
	test('keeps built-in sort pairs and customization order', () => {
		const wrapper = shallowMount(Sort, {
			props: { hits: true, docs: true, groups: true, corpus },
		});
		const options = wrapper.getComponent(SelectPicker).props('options') as OptGroup[];

		expect(options.map(group => group.label)).toEqual(['results.sort.groups', 'results.sort.parallelCorpus', 'results.sort.documents']);
		expect(options.map(group => group.options)).toEqual([
			[
				{ label: 'results.table.sortBy:results.table.sort_groupName', value: 'identity' },
				{ label: 'results.table.sortByDescending:results.table.sort_groupName', value: '-identity' },
				{ label: 'results.table.sortBy:results.table.sort_groupSize', value: 'size' },
				{ label: 'results.table.sortByDescending:results.table.sort_groupSize', value: '-size' },
			],
			[
				{ label: 'results.table.sortBy:results.table.sort_alignments', value: 'alignments' },
				{ label: 'results.table.sortByDescending:results.table.sort_alignments', value: '-alignments' },
			],
			[
				{ label: 'results.table.sortBy:results.table.sort_numberOfHits', value: 'numhits' },
				{ label: 'results.table.sortByDescending:results.table.sort_numberOfHits', value: '-numhits' },
			],
		]);
		expect(mock.sortOptionGroup.mock.calls.map(([group]) => group.label)).toEqual(['results.sort.groups', 'results.sort.parallelCorpus', 'results.sort.documents']);
	});

	test('uses the latest reactive sort customizations', async () => {
		annotationIds.value = ['initial-annotation'];
		metadataIds.value = ['initial-metadata'];
		const wrapper = shallowMount(Sort, { props: { hits: true, docs: true, corpus } });
		wrapper.getComponent(SelectPicker).props('options');

		expect(mock.getAnnotationSubset).toHaveBeenLastCalledWith(['initial-annotation'], expect.anything(), expect.anything(), 'Sort', expect.anything(), expect.anything(), false);
		expect(mock.getMetadataSubset).toHaveBeenLastCalledWith(['initial-metadata'], expect.anything(), expect.anything(), 'Sort', expect.anything(), expect.anything(), false, expect.any(Function));

		annotationIds.value = ['latest-annotation'];
		annotationLabels.value = true;
		metadataIds.value = ['latest-metadata'];
		metadataLabels.value = true;
		await nextTick();
		wrapper.getComponent(SelectPicker).props('options');

		expect(mock.getAnnotationSubset).toHaveBeenLastCalledWith(['latest-annotation'], expect.anything(), expect.anything(), 'Sort', expect.anything(), expect.anything(), true);
		expect(mock.getMetadataSubset).toHaveBeenLastCalledWith(['latest-metadata'], expect.anything(), expect.anything(), 'Sort', expect.anything(), expect.anything(), true, expect.any(Function));
	});

	test('offers association, collocate, and co-occurrence sorting for collocation groups', () => {
		const wrapper = shallowMount(Sort, { props: { groups: true, collocations: true, collocationScorer: 'coll-dice', corpus } });
		const options = wrapper.getComponent(SelectPicker).props('options') as OptGroup[];

		expect(options).toEqual([
			{
				label: 'queryForm.collocations',
				options: [
					{ label: 'results.table.sortBy:collocations.results.association:collocations.scorers.dice', value: 'score' },
					{ label: 'results.table.sortByDescending:collocations.results.association:collocations.scorers.dice', value: '-score' },
					{ label: 'results.table.sortBy:collocations.results.collocate', value: 'identity' },
					{ label: 'results.table.sortByDescending:collocations.results.collocate', value: '-identity' },
					{ label: 'results.table.sortBy:collocations.results.cooccurrences', value: 'size' },
					{ label: 'results.table.sortByDescending:collocations.results.cooccurrences', value: '-size' },
				],
			},
		]);
	});
});
