// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { createMockCorpusContext } from '@test/mocks/corpus';
import { createMockCustomizations } from '@test/mocks/customizations';
import { shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { Corpus } from '@/types/apptypes';
import type { BLSearchResult } from '@/types/blacklabtypes';

import { CancelableRequest } from '@/shared/api/lib/api-types';

import Export from '@/pages/search/results/Export.vue';

let api: ReturnType<typeof createMockApi>;
let corpusContext: ReturnType<typeof createMockCorpusContext>;
let customizations: ReturnType<typeof createMockCustomizations>;

const corpus = {
	allAnnotatedFieldsMap: { contents: { id: 'contents' } },
	id: 'test',
	mainAnnotatedField: 'contents',
	relations: { spans: {} },
} as unknown as Corpus;

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
	api = createMockApi();
	corpusContext = createMockCorpusContext({ corpus });
	customizations = createMockCustomizations(corpus);
	customizations.exportDescription.mockReturnValue('description');
	customizations.exportSpanAttribute.mockReturnValue(true);
	customizations.resultDetailedAnnotationIds.mockReturnValue(['initial-annotation']);
	customizations.resultDetailedMetadataIds.mockReturnValue(['initial-metadata']);
	const pending = new CancelableRequest(new Promise<Blob>(() => undefined), vi.fn());
	api.blacklabApi.getHitsCsv.mockReturnValue(pending);
	api.blacklabApi.getDocsCsv.mockReturnValue(pending);
});

describe('Export', () => {
	test('exports displayed collocation hits with click-time customizations without mutating the query', async () => {
		const displayedResults = results();
		Object.assign(displayedResults.summary.params, {
			context: '3:4',
			hitfiltercrit: 'hit:lemma:i',
			hitfilterval: 'cws:contents%lemma:i:ship',
			patt: 'meet([pos="N.*"], [word="water"],-3,4)',
		});
		const originalParams = { ...displayedResults.summary.params };
		const wrapper = shallowMount(Export, {
			props: { results: displayedResults, type: 'hits' },
			global: { plugins: [api, corpusContext, customizations] },
		});

		customizations.resultDetailedAnnotationIds.mockReturnValue(['latest-annotation']);
		customizations.resultDetailedMetadataIds.mockReturnValue(['latest-metadata']);
		await wrapper.get('button').trigger('click');

		expect(api.blacklabApi.getHitsCsv).toHaveBeenCalledWith('test', {
			context: '3:4',
			csvdescription: 'description',
			csvsepline: false,
			csvsummary: true,
			first: 0,
			hitfiltercrit: 'hit:lemma:i',
			hitfilterval: 'cws:contents%lemma:i:ship',
			listmetadatavalues: 'latest-metadata',
			listspanattributes: '',
			listvalues: 'latest-annotation',
			number: 20,
			patt: 'meet([pos="N.*"], [word="water"],-3,4)',
		});
		expect(displayedResults.summary.params).toEqual(originalParams);
	});
});
