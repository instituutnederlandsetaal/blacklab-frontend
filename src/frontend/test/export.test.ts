// @vitest-environment jsdom

import { shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ref } from 'vue';

import type { BLSearchResult } from '@/types/blacklabtypes';

import Export from '@/pages/search/results/Export.vue';

const mock = vi.hoisted(() => ({
	exportDescription: vi.fn(() => 'description'),
	exportSpanAttribute: vi.fn(() => true),
	getDocsCsv: vi.fn(),
	getHitsCsv: vi.fn(),
	resultDetailedAnnotationIds: vi.fn(),
	resultDetailedMetadataIds: vi.fn(),
}));

const corpus = {
	allAnnotatedFieldsMap: { contents: { id: 'contents' } },
	id: 'test',
	mainAnnotatedField: 'contents',
	relations: { spans: {} },
};

vi.mock('@/app/state/useCorpusContext', () => ({ useCorpus: () => ref(corpus) }));
vi.mock('@/customization-api/internal/internal-api', () => ({
	useCustomizations: () => ({
		exportDescription: mock.exportDescription,
		exportSpanAttribute: mock.exportSpanAttribute,
		resultDetailedAnnotationIds: mock.resultDetailedAnnotationIds,
		resultDetailedMetadataIds: mock.resultDetailedMetadataIds,
	}),
}));
vi.mock('@/shared/api', () => ({ useBlackLabApi: () => ({ getDocsCsv: mock.getDocsCsv, getHitsCsv: mock.getHitsCsv }) }));
vi.mock('@/shared/i18n', () => ({
	useI18n: () => ({ $tAnnotatedFieldDisplayName: ({ id }: { id: string }) => id }),
}));

function results(): BLSearchResult {
	return {
		docInfos: {},
		hits: [],
		summary: {
			params: { first: 0, number: 20, patt: '[]' },
			pattern: { bcql: '[]', fieldName: 'contents', otherFields: [] },
			results: { stats: { processed: { documents: 0, hits: 0 }, counted: { documents: 0, hits: 0 } } },
		},
	} as unknown as BLSearchResult;
}

beforeEach(() => {
	vi.clearAllMocks();
	mock.resultDetailedAnnotationIds.mockReturnValue(['initial-annotation']);
	mock.resultDetailedMetadataIds.mockReturnValue(['initial-metadata']);
	const pending = new Promise<Blob>(() => undefined);
	mock.getHitsCsv.mockReturnValue({ request: pending });
	mock.getDocsCsv.mockReturnValue({ request: pending });
});

describe('Export', () => {
	test('exports the full collocation group through the ordinary filtered hits request', async () => {
		const displayedResults = results();
		Object.assign(displayedResults.summary.params, {
			context: '3:4',
			hitfiltercrit: 'hit:lemma:i',
			hitfilterval: 'cws:contents%lemma:i:ship',
			patt: 'meet([pos="N.*"], [word="water"],-3,4)',
		});
		const wrapper = shallowMount(Export, {
			props: { results: displayedResults, type: 'hits' },
			global: { mocks: { $t: (key: string) => key } },
		});

		await wrapper.get('button').trigger('click');

		expect(mock.getHitsCsv).toHaveBeenCalledWith('test', {
			context: '3:4',
			csvdescription: 'description',
			csvsepline: false,
			csvsummary: true,
			first: 0,
			hitfiltercrit: 'hit:lemma:i',
			hitfilterval: 'cws:contents%lemma:i:ship',
			listmetadatavalues: 'initial-metadata',
			listspanattributes: '',
			listvalues: 'initial-annotation',
			number: 20,
			patt: 'meet([pos="N.*"], [word="water"],-3,4)',
		});
	});

	test('reads the latest customizations at click time without mutating result parameters', async () => {
		const displayedResults = results();
		const originalParams = { ...displayedResults.summary.params };
		const wrapper = shallowMount(Export, {
			props: { results: displayedResults, type: 'hits' },
			global: { mocks: { $t: (key: string) => key } },
		});

		expect(mock.resultDetailedAnnotationIds).not.toHaveBeenCalled();
		expect(mock.resultDetailedMetadataIds).not.toHaveBeenCalled();
		mock.resultDetailedAnnotationIds.mockReturnValue(['latest-annotation']);
		mock.resultDetailedMetadataIds.mockReturnValue(['latest-metadata']);
		await wrapper.get('button').trigger('click');

		expect(mock.getHitsCsv).toHaveBeenCalledWith(
			'test',
			expect.objectContaining({
				csvdescription: 'description',
				csvsepline: false,
				csvsummary: true,
				listmetadatavalues: 'latest-metadata',
				listspanattributes: '',
				listvalues: 'latest-annotation',
			}),
		);
		expect(displayedResults.summary.params).toEqual(originalParams);
	});
});
