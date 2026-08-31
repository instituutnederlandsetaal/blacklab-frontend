// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, test, vi } from 'vitest';

import type { ColumnDefs, DisplaySettingsForRendering, HitRowData } from '@/pages/search/results/table/table-layout';
import type { BLHit } from '@/types/blacklabtypes';

import { CancelableRequest } from '@/shared/api/lib/api-types';

import HitContext from '@/pages/search/results/table/HitContext.vue';
import HitRowDetails from '@/pages/search/results/table/HitRowDetails.vue';

const mock = vi.hoisted(() => ({
	addon: vi.fn(),
	corpus: { hasRelations: false, id: 'corpus' },
	formatError: vi.fn((error: Error) => error.message),
	getSnippet: vi.fn(),
	sentenceElement: null as string | null,
	transformResultSnippet: vi.fn(),
}));

vi.mock('@/app/state/useCorpusContext', () => ({ useCorpus: () => ({ value: mock.corpus }) }));
vi.mock('@/shared/api', () => ({ useBlackLabApi: () => ({ getSnippet: mock.getSnippet }) }));
vi.mock('@/customization-api/internal/internal-api', () => ({
	useCustomizations: () => ({
		formatError: mock.formatError,
		resultConcordanceSize: () => 5,
		resultHitAddons: () => [mock.addon],
		searchFormSentenceElement: () => mock.sentenceElement,
		transformResultSnippet: mock.transformResultSnippet,
	}),
}));

const snippet = {
	before: { punct: [] },
	match: { punct: [] },
	after: { punct: [] },
} as unknown as BLHit;

function deferredRequest<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	const cancel = vi.fn();
	return { cancel, reject, request: new CancelableRequest(promise, cancel), resolve };
}

function row(docPid = 'doc'): HitRowData {
	return {
		annotatedField: { id: 'parallel' },
		context: { before: [], match: [], after: [] },
		dir: 'ltr',
		doc: { docInfo: { mayView: true, metadata: {}, tokenCounts: [] }, docPid },
		first_of_hit: false,
		hit: { ...snippet, docPid, end: 2, start: 1 },
		hit_id: 'hit',
		href: `/corpus/docs/${docPid}?field=parallel`,
		isForeign: true,
		last_of_hit: false,
		muted: false,
		customHitInfo: '',
		type: 'hit',
	} as unknown as HitRowData;
}

beforeEach(() => {
	vi.clearAllMocks();
	mock.addon.mockReturnValue(null);
	mock.corpus.hasRelations = false;
	mock.corpus.id = 'corpus';
	mock.sentenceElement = null;
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

test('retains snippet and sentence requests across close and uncheck', async () => {
	const requests = [deferredRequest<BLHit>(), deferredRequest<BLHit>()];
	mock.getSnippet.mockReset();
	for (const pending of requests) mock.getSnippet.mockReturnValueOnce(pending.request);
	mock.corpus.hasRelations = true;
	mock.sentenceElement = 's';

	const wrapper = mount(HitRowDetails, {
		props: {
			cols: { hitColumns: [], docColumns: [], groupColumns: [], groupModeOptions: [] } as ColumnDefs,
			hoverMatchInfos: [],
			info: { detailedAnnotations: [], getMatchInfoHighlightStyle: () => undefined, html: false, mainAnnotation: { id: 'word' } } as unknown as DisplaySettingsForRendering,
			open: false,
			row: row(),
			type: 'hits',
		},
	});
	await wrapper.setProps({ open: true });
	await wrapper.setProps({ open: false });
	expect(requests[0].cancel).not.toHaveBeenCalled();
	requests[0].resolve(snippet);
	await flushPromises();
	await wrapper.setProps({ open: true });
	expect(mock.getSnippet).toHaveBeenCalledOnce();

	await wrapper.get('.show-sentence-checkbox').setValue(true);
	await wrapper.get('.show-sentence-checkbox').setValue(false);
	expect(requests[1].cancel).not.toHaveBeenCalled();
	requests[1].resolve(snippet);
	await flushPromises();
	await wrapper.get('.show-sentence-checkbox').setValue(true);
	expect(mock.getSnippet).toHaveBeenCalledTimes(2);
});

test('resets replaced rows synchronously and activates only the final open row', async () => {
	const requests = [deferredRequest<BLHit>(), deferredRequest<BLHit>(), deferredRequest<BLHit>()];
	mock.getSnippet.mockReset();
	for (const pending of requests) mock.getSnippet.mockReturnValueOnce(pending.request);
	mock.addon.mockReturnValue({ name: 'test' });

	const wrapper = mount(HitRowDetails, {
		props: {
			cols: { hitColumns: [], docColumns: [], groupColumns: [], groupModeOptions: [] } as ColumnDefs,
			hoverMatchInfos: [],
			info: { detailedAnnotations: [], getMatchInfoHighlightStyle: () => undefined, html: false, mainAnnotation: { id: 'word' } } as unknown as DisplaySettingsForRendering,
			open: true,
			row: row('first'),
			type: 'hits',
		},
	});
	await wrapper.setProps({ open: false, row: row('second') });
	expect(requests[0].cancel).toHaveBeenCalledOnce();
	expect(mock.getSnippet).toHaveBeenCalledOnce();

	requests[0].resolve(snippet);
	await flushPromises();
	expect(mock.transformResultSnippet).not.toHaveBeenCalled();
	expect(mock.addon).not.toHaveBeenCalled();
	expect(wrapper.findComponent(HitContext).exists()).toBe(false);

	await wrapper.setProps({ open: true });
	expect(mock.getSnippet).toHaveBeenNthCalledWith(2, 'corpus', 'second', 'parallel', 1, 2, 5);
	await wrapper.setProps({ row: row('third') });
	expect(requests[1].cancel).toHaveBeenCalledOnce();
	expect(mock.getSnippet).toHaveBeenNthCalledWith(3, 'corpus', 'third', 'parallel', 1, 2, 5);
	requests[1].reject(new Error('stale failure'));
	mock.corpus.id = 'later-corpus';
	requests[2].resolve(snippet);
	await flushPromises();
	expect(mock.transformResultSnippet).toHaveBeenCalledOnce();
	expect(mock.formatError).not.toHaveBeenCalled();
	expect(mock.addon).toHaveBeenCalledWith(expect.objectContaining({ corpus: 'corpus', docId: 'third' }));
});

test('scope disposal suppresses noncooperative fulfillment and rejection', async () => {
	const fulfilled = deferredRequest<BLHit>();
	const rejected = deferredRequest<BLHit>();
	const highlight = vi.fn();
	mock.getSnippet.mockReset().mockReturnValueOnce(fulfilled.request).mockReturnValueOnce(rejected.request);
	const props = {
		cols: { hitColumns: [], docColumns: [], groupColumns: [], groupModeOptions: [] } as ColumnDefs,
		hoverMatchInfos: [],
		info: { detailedAnnotations: [], getMatchInfoHighlightStyle: highlight, html: false, mainAnnotation: { id: 'word' } } as unknown as DisplaySettingsForRendering,
		open: true,
		row: row(),
		type: 'hits' as const,
	};

	const fulfilledWrapper = mount(HitRowDetails, { props });
	fulfilledWrapper.unmount();
	const rejectedWrapper = mount(HitRowDetails, { props });
	rejectedWrapper.unmount();
	expect(fulfilled.cancel).toHaveBeenCalledOnce();
	expect(rejected.cancel).toHaveBeenCalledOnce();
	fulfilled.resolve(snippet);
	rejected.reject(new Error('late failure'));
	await flushPromises();
	expect(mock.transformResultSnippet).not.toHaveBeenCalled();
	expect(highlight).not.toHaveBeenCalled();
	expect(mock.addon).not.toHaveBeenCalled();
	expect(mock.formatError).not.toHaveBeenCalled();
});

test('retries a failed snippet without exposing the retained error while loading', async () => {
	const requests = [deferredRequest<BLHit>(), deferredRequest<BLHit>()];
	mock.getSnippet.mockReset();
	for (const pending of requests) mock.getSnippet.mockReturnValueOnce(pending.request);
	const wrapper = mount(HitRowDetails, {
		props: {
			cols: { hitColumns: [], docColumns: [], groupColumns: [], groupModeOptions: [] } as ColumnDefs,
			hoverMatchInfos: [],
			info: { detailedAnnotations: [], getMatchInfoHighlightStyle: () => undefined, html: false, mainAnnotation: { id: 'word' } } as unknown as DisplaySettingsForRendering,
			open: true,
			row: row(),
			type: 'hits',
		},
	});
	requests[0].reject(new Error('failed snippet'));
	await flushPromises();
	expect(wrapper.get('p.text-danger').text()).toContain('failed snippet');

	await wrapper.setProps({ open: false });
	await wrapper.setProps({ open: true });
	expect(wrapper.get('p.text-danger').text()).not.toContain('failed snippet');
	requests[1].resolve(snippet);
	await flushPromises();
	expect(wrapper.find('p.text-danger').exists()).toBe(false);
	expect(wrapper.findAllComponents(HitContext)).toHaveLength(3);
	expect(mock.formatError).toHaveBeenCalledOnce();
});
