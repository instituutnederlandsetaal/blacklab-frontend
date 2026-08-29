// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, test, vi } from 'vitest';

import type { NormalizedFormat, NormalizedIndexBase } from '@/types/apptypes';
import type { BLResponse } from '@/types/blacklabtypes';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';

import ModalUpload from '@/pages/corpora/ModalUpload.vue';
import Modal from '@/shared/ui/Modal.vue';

const mock = vi.hoisted(() => ({ postDocuments: vi.fn() }));
vi.mock('@/shared/api', () => ({ useBlackLabApi: () => mock }));

function deferredRequest<T>() {
	let resolve!: (value: T) => void;
	let reject!: (cause: unknown) => void;
	const cancel = vi.fn();
	const request = new CancelableRequest<T>(
		new Promise<T>((resolvePromise, rejectPromise) => {
			resolve = resolvePromise;
			reject = rejectPromise;
		}),
		cancel,
	);
	return { cancel, reject, request, resolve };
}

function corpus(overrides: Partial<NormalizedIndexBase> = {}): NormalizedIndexBase {
	return {
		description: '',
		displayName: 'Private corpus',
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

const formats = [{ id: 'alice:tei', description: 'TEI documents', displayName: 'TEI' } as NormalizedFormat];
const response = { status: { code: 'SUCCESS', message: 'Uploaded' } } as BLResponse;

async function chooseFiles(wrapper: ReturnType<typeof mount<typeof ModalUpload>>, inputIndex: number, files: File[]) {
	const input = wrapper.findAll<HTMLInputElement>('input[type="file"]')[inputIndex];
	Object.defineProperty(input.element, 'files', { configurable: true, value: files });
	await input.trigger('change');
}

beforeEach(() => vi.clearAllMocks());

test('requires documents and preserves selected document, metadata, and format data on failure', async () => {
	const upload = deferredRequest<BLResponse>();
	mock.postDocuments.mockReturnValue(upload.request);
	const wrapper = mount(ModalUpload, { props: { corpus: corpus(), formats } });
	const modal = wrapper.getComponent(Modal);

	expect(wrapper.text()).toContain('TEI documents');
	expect(modal.props('confirmEnabled')).toBe(false);
	modal.vm.$emit('confirm');
	expect(mock.postDocuments).not.toHaveBeenCalled();

	const documents = [new File(['one'], 'one.xml'), new File(['two'], 'two.xml')];
	const metadata = [new File(['meta'], 'metadata.csv')];
	await chooseFiles(wrapper, 0, documents);
	await chooseFiles(wrapper, 1, metadata);
	expect(wrapper.text()).toContain('2 document file(s)');
	expect(wrapper.text()).toContain('metadata.csv');
	expect(modal.props('confirmEnabled')).toBe(true);

	modal.vm.$emit('confirm');
	await wrapper.vm.$nextTick();
	expect(mock.postDocuments).toHaveBeenCalledWith('alice:corpus', documents, metadata, expect.any(Function));
	expect(modal.props('closeEnabled')).toBe(false);
	upload.reject(new ApiError('Error', 'Upload failed', 'Error', 500));
	await flushPromises();
	expect(wrapper.text()).toContain('Upload failed');
	expect(modal.props('confirmEnabled')).toBe(true);
	expect(wrapper.emitted('success')).toBeUndefined();
	expect(wrapper.emitted('close')).toBeUndefined();
});

test('emits indexing at upload completion and again before terminal success and close', async () => {
	const upload = deferredRequest<BLResponse>();
	const events: string[] = [];
	mock.postDocuments.mockReturnValue(upload.request);
	const initialCorpus = corpus();
	const wrapper = mount(ModalUpload, {
		props: {
			corpus: initialCorpus,
			formats,
			onClose: () => events.push('close'),
			onIndexing: (id: string) => events.push(`indexing:${id}`),
			onSuccess: (message: string) => events.push(`success:${message}`),
		},
	});
	await chooseFiles(wrapper, 0, [new File(['one'], 'one.xml')]);
	const modal = wrapper.getComponent(Modal);
	modal.vm.$emit('confirm');
	await wrapper.vm.$nextTick();
	const progress = mock.postDocuments.mock.calls[0][3] as (value: number) => void;

	progress(100);
	await wrapper.vm.$nextTick();
	expect(events).toEqual(['indexing:alice:corpus']);
	expect(modal.props('closeEnabled')).toBe(true);

	await wrapper.setProps({ corpus: corpus({ status: 'indexing' }) });
	expect(wrapper.text()).not.toContain("files, '");
	await wrapper.setProps({ corpus: corpus({ status: 'indexing', indexProgress: { docsDone: 4, filesProcessed: 3, tokensProcessed: 5 } }) });
	expect(wrapper.text()).toContain('3 files, 4 documents, and 5 tokens indexed so far...');

	upload.resolve(response);
	await flushPromises();
	expect(events).toEqual(['indexing:alice:corpus', 'indexing:alice:corpus', 'success:Data added to Private corpus', 'close']);
});

test('does not cancel an upload when closed and unmounted', async () => {
	const upload = deferredRequest<BLResponse>();
	mock.postDocuments.mockReturnValue(upload.request);
	const wrapper = mount(ModalUpload, { props: { corpus: corpus(), formats } });
	await chooseFiles(wrapper, 0, [new File(['one'], 'one.xml')]);
	wrapper.getComponent(Modal).vm.$emit('confirm');
	wrapper.getComponent(Modal).vm.$emit('close');
	wrapper.unmount();
	expect(upload.cancel).not.toHaveBeenCalled();
});
