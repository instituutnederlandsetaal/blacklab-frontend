// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, test, vi } from 'vitest';

import type { ColumnDefs, DisplaySettingsForRendering, HitRowData } from '@/pages/search/results/table/table-layout';
import type { BLHit } from '@/types/blacklabtypes';

import { CancelableRequest } from '@/shared/api/lib/api-types';

import HitContext from '@/pages/search/results/table/HitContext.vue';
import HitRowDetails from '@/pages/search/results/table/HitRowDetails.vue';

const mock = vi.hoisted(() => ({
	getSnippet: vi.fn(),
	transformResultSnippet: vi.fn(),
}));

vi.mock('@/app/state/useCorpusContext', () => ({ useCorpus: () => ({ value: { hasRelations: false, id: 'corpus' } }) }));
vi.mock('@/shared/api', () => ({ useBlackLabApi: () => ({ getSnippet: mock.getSnippet }) }));
vi.mock('@/customization-api/internal/internal-api', () => ({
	useCustomizations: () => ({
		formatError: (error: Error) => error.message,
		resultConcordanceSize: () => 5,
		resultHitAddons: () => [],
		searchFormSentenceElement: () => null,
		transformResultSnippet: mock.transformResultSnippet,
	}),
}));

const snippet = {
	before: { punct: [] },
	match: { punct: [] },
	after: { punct: [] },
} as unknown as BLHit;

function row(): HitRowData {
	return {
		annotatedField: { id: 'parallel' },
		context: { before: [], match: [], after: [] },
		dir: 'ltr',
		doc: { docInfo: { mayView: true, metadata: {}, tokenCounts: [] }, docPid: 'doc' },
		first_of_hit: false,
		hit: { ...snippet, docPid: 'doc', end: 2, start: 1 },
		hit_id: 'hit',
		href: '/corpus/docs/doc?field=parallel',
		isForeign: true,
		last_of_hit: false,
		muted: false,
		customHitInfo: '',
		type: 'hit',
	} as unknown as HitRowData;
}

beforeEach(() => {
	vi.clearAllMocks();
	mock.getSnippet.mockReturnValue(new CancelableRequest(Promise.resolve(snippet), vi.fn()));
});

test('renders ordered context descriptors and forwards shared hover events', async () => {
	const wrapper = mount(HitRowDetails, {
		props: {
			cols: { hitColumns: [], docColumns: [], groupColumns: [], groupModeOptions: [] } as ColumnDefs,
			hoverMatchInfos: ['shared'],
			info: { detailedAnnotations: [], getMatchInfoHighlightStyle: () => undefined, html: false, mainAnnotation: { id: 'word' } } as unknown as DisplaySettingsForRendering,
			open: false,
			row: row(),
			type: 'hits',
		},
	});
	await wrapper.setProps({ open: true });
	await flushPromises();

	const contexts = wrapper.findAllComponents(HitContext);
	expect(contexts.map(context => context.props('tag'))).toEqual(['span', 'strong', 'span']);
	expect(contexts.map(context => context.props('bold'))).toEqual([false, true, false]);
	expect(contexts.map(context => context.props('before'))).toEqual([true, false, false]);
	expect(contexts.map(context => context.props('after'))).toEqual([false, false, true]);
	expect(contexts.map(context => context.props('hoverMatchInfos'))).toEqual([['shared'], ['shared'], ['shared']]);
	expect(Array.from(wrapper.get('p[dir="ltr"]').element.children, element => element.tagName.toLowerCase())).toEqual(['span', 'strong', 'a', 'span']);
	expect(wrapper.get('a').attributes()).toMatchObject({ href: '/corpus/docs/doc?field=parallel', target: '_blank' });
	expect(contexts[0].text()).toBe('…');
	expect(contexts[2].text()).toBe('…');

	for (const context of contexts) context.vm.$emit('hover', ['relation']);
	expect(wrapper.emitted('hover')).toEqual([[['relation']], [['relation']], [['relation']]]);
	contexts[1].vm.$emit('unhover');
	expect(wrapper.emitted('unhover')).toEqual([[]]);
});
