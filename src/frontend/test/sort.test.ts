// @vitest-environment jsdom

import { shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { NormalizedIndex } from '@/types/apptypes';

import type { OptGroup } from '@/shared/utils/options';

import Sort from '@/pages/search/results/Sort.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

const mock = vi.hoisted(() => ({
	sortOptionGroup: vi.fn((group: OptGroup) => group),
}));

vi.mock('@/customization-api/internal/internal-api', () => ({
	useCustomizations: () => ({
		resultMetadataField: vi.fn(() => true),
		sortOptionGroup: mock.sortOptionGroup,
	}),
}));
vi.mock('@/shared/blacklab-helpers/field-groups', () => ({
	getAnnotationSubset: () => [],
	getMetadataSubset: () => [],
}));
vi.mock('@/shared/i18n', () => ({
	useI18n: () => ({
		$t: (key: string, params?: { field?: string }) => (params?.field ? `${key}:${params.field}` : key),
	}),
}));

const corpus = {
	annotationGroups: [],
	annotatedFields: { contents: { annotations: {} } },
	mainAnnotatedField: 'contents',
	metadataFieldGroups: [],
	metadataFields: {},
} as unknown as NormalizedIndex;

beforeEach(() => vi.clearAllMocks());

describe('Sort', () => {
	test('keeps built-in sort pairs and customization order', () => {
		const wrapper = shallowMount(Sort, {
			props: { hits: true, docs: true, groups: true, parallelCorpus: true, corpus, annotations: [], metadata: [] },
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
});
