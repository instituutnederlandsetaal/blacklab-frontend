// @vitest-environment jsdom

import { flushPromises, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { NormalizedBlacklabServer, NormalizedFormat, NormalizedIndexBase } from '@/types/apptypes';
import type { BLResponse } from '@/types/blacklabtypes';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';
import { resolvedRequest } from '@/shared/api/lib/api-utils';

import CorporaPage from '@/pages/corpora/CorporaPage.vue';
import CorpusTable from '@/pages/corpora/CorpusTable.vue';
import FormatsTable from '@/pages/corpora/FormatsTable.vue';
import ModalUpload from '@/pages/corpora/ModalUpload.vue';
import Modal from '@/shared/ui/Modal.vue';

const mock = vi.hoisted(() => ({
	api: {
		deleteCorpus: vi.fn(),
		deleteFormat: vi.fn(),
		getCorpora: vi.fn(),
		getCorpusStatus: vi.fn(),
		getFormats: vi.fn(),
		getServerInfo: vi.fn(),
	},
}));

vi.mock('@/shared/api/index.ts', () => ({ useBlackLabApi: () => mock.api }));

const format = (id: string, displayName: string, owner: string | null = 'alice') => ({ id, owner, shortId: id.split(':').at(-1)!, displayName }) as NormalizedFormat;

function corpus(overrides: Partial<NormalizedIndexBase> = {}): NormalizedIndexBase {
	return {
		description: 'Description',
		displayName: 'Corpus',
		documentCount: 1,
		documentFormat: 'alice:tei',
		id: 'alice:corpus',
		indexProgress: null,
		owner: 'alice',
		status: 'available',
		timeModified: '2024-01-01 00:00:00',
		tokenCount: 2,
		...overrides,
	};
}

function server(corpora: NormalizedIndexBase[]): NormalizedBlacklabServer {
	return { corpora: Object.fromEntries(corpora.map(value => [value.id, value])), user: { canCreateIndex: true, id: 'alice', loggedIn: true } } as unknown as NormalizedBlacklabServer;
}

function deferredRequest<T>() {
	let resolve!: (value: T) => void;
	let reject!: (cause: unknown) => void;
	const request = new CancelableRequest<T>(
		new Promise<T>((resolvePromise, rejectPromise) => {
			resolve = resolvePromise;
			reject = rejectPromise;
		}),
		vi.fn(() => reject(ApiError.CANCELLED)),
	);
	return { request, resolve, reject };
}

const deleteResponse = { status: { message: 'Deleted' } } as BLResponse;

async function mountPage(initialCorpora = [corpus()]) {
	mock.api.getServerInfo.mockReturnValue(resolvedRequest(server(initialCorpora)));
	mock.api.getFormats.mockReturnValue(resolvedRequest([format('alice:tei', 'TEI')]));
	const wrapper = shallowMount(CorporaPage);
	await flushPromises();
	return wrapper;
}

function privateTable(wrapper: ReturnType<typeof shallowMount<typeof CorporaPage>>) {
	return wrapper.findAllComponents(CorpusTable).find(table => table.props('isPrivate'))!;
}

async function startUploadPoll(wrapper: ReturnType<typeof shallowMount<typeof CorporaPage>>, id = 'alice:corpus') {
	privateTable(wrapper).vm.$emit('upload', id);
	await wrapper.vm.$nextTick();
	const upload = wrapper.getComponent(ModalUpload);
	upload.vm.$emit('indexing', id);
	return upload;
}

async function confirmCorpusDeletion(wrapper: ReturnType<typeof shallowMount<typeof CorporaPage>>, id = 'alice:corpus') {
	privateTable(wrapper).vm.$emit('delete', id);
	await wrapper.vm.$nextTick();
	wrapper.getComponent(Modal).vm.$emit('confirm');
	await flushPromises();
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.clearAllMocks();
	mock.api.getCorpora.mockReturnValue(resolvedRequest([]));
	mock.api.deleteCorpus.mockReturnValue(resolvedRequest(deleteResponse));
	mock.api.deleteFormat.mockReturnValue(resolvedRequest(deleteResponse));
});

afterEach(() => vi.useRealTimers());

test('deduplicates upload triggers and keeps identity through the two-second indexing cadence', async () => {
	const first = deferredRequest<NormalizedIndexBase>();
	const second = deferredRequest<NormalizedIndexBase>();
	mock.api.getCorpusStatus.mockReturnValueOnce(first.request).mockReturnValueOnce(second.request);
	const wrapper = await mountPage();
	const initial = privateTable(wrapper).props('corpora')[0];
	const upload = await startUploadPoll(wrapper);

	upload.vm.$emit('indexing', initial.id);
	expect(mock.api.getCorpusStatus).toHaveBeenCalledTimes(1);

	first.resolve(corpus({ status: 'indexing', tokenCount: 10, indexProgress: { docsDone: 1, filesProcessed: 2, tokensProcessed: 3 } as NonNullable<NormalizedIndexBase['indexProgress']> }));
	await flushPromises();
	expect(privateTable(wrapper).props('corpora')[0]).toBe(initial);
	expect(upload.props('corpus')).toBe(initial);
	expect(initial.status).toBe('indexing');

	await vi.advanceTimersByTimeAsync(1999);
	expect(mock.api.getCorpusStatus).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(1);
	expect(mock.api.getCorpusStatus).toHaveBeenCalledTimes(2);

	second.resolve(corpus({ status: 'available', tokenCount: 20 }));
	await flushPromises();
	expect(privateTable(wrapper).props('corpora')[0]).toBe(initial);
	expect(initial.tokenCount).toBe(20);
	await vi.advanceTimersByTimeAsync(2000);
	expect(mock.api.getCorpusStatus).toHaveBeenCalledTimes(2);
	wrapper.unmount();
});

test('releases a failed poll for an explicit retry and gives its current error precedence', async () => {
	const failed = deferredRequest<NormalizedIndexBase>();
	const retried = deferredRequest<NormalizedIndexBase>();
	mock.api.getCorpusStatus.mockReturnValueOnce(failed.request).mockReturnValueOnce(retried.request);
	const wrapper = await mountPage();
	const upload = await startUploadPoll(wrapper);
	upload.vm.$emit('success', 'Upload complete');

	failed.reject(new Error('offline'));
	await flushPromises();
	expect(wrapper.text()).toContain('Could not retrieve status for corpus "Corpus": offline');
	expect(wrapper.text()).not.toContain('Upload complete');

	upload.vm.$emit('indexing', 'alice:corpus');
	expect(mock.api.getCorpusStatus).toHaveBeenCalledTimes(2);
	retried.resolve(corpus());
	await flushPromises();
	wrapper.unmount();
});

test('successful deletion during the delay stops the matching poll', async () => {
	mock.api.getCorpusStatus.mockReturnValue(resolvedRequest(corpus({ status: 'indexing' })));
	const wrapper = await mountPage();
	await startUploadPoll(wrapper);
	await flushPromises();
	expect(vi.getTimerCount()).toBe(1);

	await confirmCorpusDeletion(wrapper);
	expect(privateTable(wrapper).props('corpora')).toEqual([]);
	expect(vi.getTimerCount()).toBe(0);
	await vi.advanceTimersByTimeAsync(2000);
	expect(mock.api.getCorpusStatus).toHaveBeenCalledTimes(1);
	wrapper.unmount();
});

test('deletion and unmount cancel in-flight polls without surfacing cancellation', async () => {
	const deleting = deferredRequest<NormalizedIndexBase>();
	mock.api.getCorpusStatus.mockReturnValueOnce(deleting.request);
	const wrapper = await mountPage();
	await startUploadPoll(wrapper);
	await confirmCorpusDeletion(wrapper);
	expect(deleting.request.cancel).toHaveBeenCalledOnce();
	expect(wrapper.text()).not.toContain('Could not retrieve status');
	wrapper.unmount();

	const unmounting = deferredRequest<NormalizedIndexBase>();
	mock.api.getCorpusStatus.mockReturnValueOnce(unmounting.request);
	const nextWrapper = await mountPage();
	await startUploadPoll(nextWrapper);
	nextWrapper.unmount();
	expect(unmounting.request.cancel).toHaveBeenCalledOnce();
	await flushPromises();
});

test('keeps a newer cross-table confirmation when an earlier deletion settles and gives its error precedence', async () => {
	const corpusDeletion = deferredRequest<BLResponse>();
	const formatDeletion = deferredRequest<BLResponse>();
	mock.api.deleteCorpus.mockReturnValueOnce(corpusDeletion.request);
	mock.api.deleteFormat.mockReturnValueOnce(formatDeletion.request);
	const wrapper = await mountPage();

	privateTable(wrapper).vm.$emit('delete', 'alice:corpus');
	await wrapper.vm.$nextTick();
	wrapper.getComponent(Modal).vm.$emit('confirm');
	await wrapper.vm.$nextTick();
	wrapper.getComponent(FormatsTable).vm.$emit('delete', 'alice:tei');
	await wrapper.vm.$nextTick();

	corpusDeletion.resolve({ status: { message: 'Corpus deleted first' } } as BLResponse);
	await flushPromises();
	expect(wrapper.text()).toContain('Corpus deleted first');
	wrapper.getComponent(Modal).vm.$emit('confirm');
	expect(mock.api.deleteFormat).toHaveBeenCalledWith('alice:tei');

	formatDeletion.reject(new Error('format failure'));
	await flushPromises();
	expect(wrapper.text()).toContain('Could not delete format "TEI": format failure');
	expect(wrapper.text()).not.toContain('Corpus deleted first');
	wrapper.unmount();
});

test('unmount clears a scheduled poll', async () => {
	mock.api.getCorpusStatus.mockReturnValue(resolvedRequest(corpus({ status: 'indexing' })));
	const wrapper = await mountPage([corpus({ status: 'indexing' })]);
	await flushPromises();
	expect(vi.getTimerCount()).toBe(1);

	wrapper.unmount();
	expect(vi.getTimerCount()).toBe(0);
	await vi.advanceTimersByTimeAsync(2000);
	expect(mock.api.getCorpusStatus).toHaveBeenCalledTimes(1);
});

test('settles sorted corpus partitions before independently loading sorted formats', async () => {
	const serverRequest = deferredRequest<NormalizedBlacklabServer>();
	const formatsRequest = deferredRequest<NormalizedFormat[]>();
	mock.api.getServerInfo.mockReturnValue(serverRequest.request);
	mock.api.getFormats.mockReturnValue(formatsRequest.request);
	const wrapper = shallowMount(CorporaPage);

	expect(mock.api.getFormats).not.toHaveBeenCalled();
	serverRequest.resolve(
		server([
			corpus({ id: 'alice:z', displayName: 'Zulu' }),
			corpus({ id: 'public:z', displayName: 'Public Z', owner: null }),
			corpus({ id: 'alice:a', displayName: 'Alpha' }),
			corpus({ id: 'public:a', displayName: 'Public A', owner: null }),
		]),
	);
	await flushPromises();

	expect(mock.api.getFormats).toHaveBeenCalledOnce();
	const tables = wrapper.findAllComponents(CorpusTable);
	expect(tables[0].props('corpora').map((value: NormalizedIndexBase) => value.displayName)).toEqual(['Public A', 'Public Z']);
	expect(tables[1].props('corpora').map((value: NormalizedIndexBase) => value.displayName)).toEqual(['Alpha', 'Zulu']);
	expect(tables[1].props('loading')).toBe(false);
	expect(wrapper.getComponent(FormatsTable).props('loading')).toBe(true);

	formatsRequest.resolve([format('alice:z', 'Zulu'), format('public:a', 'Public', null), format('alice:a', 'Alpha')]);
	await flushPromises();
	expect(
		wrapper
			.getComponent(FormatsTable)
			.props('formats')
			.map((value: NormalizedFormat) => value.displayName),
	).toEqual(['Alpha', 'Zulu']);
	expect(tables[0].props('formats').map((value: NormalizedFormat) => value.displayName)).toEqual(['Alpha', 'Public', 'Zulu']);
	wrapper.unmount();
});
