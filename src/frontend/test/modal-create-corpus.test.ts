// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, test, vi } from 'vitest';

import type { NormalizedFormat } from '@/types/apptypes';
import type { BLResponse, BLUser } from '@/types/blacklabtypes';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';

import ModalCreateCorpus from '@/pages/corpora/ModalCreateCorpus.vue';
import Modal from '@/shared/ui/Modal.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

const mock = vi.hoisted(() => ({ postCorpus: vi.fn() }));
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

function format(id: string, displayName: string, description: string, helpUrl: string | null = null) {
	return { id, displayName, description, helpUrl } as NormalizedFormat;
}

const publicFormats = [format('tei', 'Public TEI', 'Public description', 'https://example.com/public')];
const privateFormats = [format('alice:tei', 'Custom TEI', 'Custom description')];
const user: BLUser = { canCreateIndex: true, id: 'alice', loggedIn: true };
const response = { status: { code: 'SUCCESS', message: 'Created' } } as BLResponse;

function mountModal(overrides: Partial<{ publicFormats: NormalizedFormat[]; privateFormats: NormalizedFormat[]; loading: boolean; user: BLUser }> = {}) {
	return mount(ModalCreateCorpus, { props: { publicFormats, privateFormats, loading: false, user, ...overrides } });
}

async function enterCorpus(wrapper: ReturnType<typeof mountModal>, name = ' Raw / Corpus ', documentType = 'alice:tei') {
	await wrapper.get('#corpus_name').setValue(name);
	wrapper.getComponent(SelectPicker).vm.$emit('update:modelValue', documentType);
	await wrapper.vm.$nextTick();
}

beforeEach(() => vi.clearAllMocks());

test('preserves document format groups, labels, loading, and public-first selection', async () => {
	const duplicatePrivate = format('tei', 'Custom duplicate', 'Private duplicate description');
	const wrapper = mountModal({ loading: true, privateFormats: [duplicatePrivate, ...privateFormats] });
	const picker = wrapper.getComponent(SelectPicker);

	expect(picker.props('loading')).toBe(true);
	expect(picker.props('options')).toEqual([
		{
			label: 'Custom',
			options: [
				{ value: 'tei', label: 'Custom duplicate <small class="text-muted">tei</small>' },
				{ value: 'alice:tei', label: 'Custom TEI <small class="text-muted">alice:tei</small>' },
			],
		},
		{ label: 'Public', options: [{ value: 'tei', label: 'Public TEI <small class="text-muted">tei</small>' }] },
	]);

	picker.vm.$emit('update:modelValue', 'tei');
	await wrapper.vm.$nextTick();
	expect(wrapper.text()).toContain('Public description');
	expect(wrapper.get('a[target="_blank"]').attributes('href')).toBe('https://example.com/public');
});

test('validates name then format locally while keeping confirm available', async () => {
	const wrapper = mountModal();
	const modal = wrapper.getComponent(Modal);
	expect(modal.props('confirmEnabled')).toBe(true);

	modal.vm.$emit('confirm');
	await wrapper.vm.$nextTick();
	expect(wrapper.text()).toContain('Please enter a name for the corpus.');
	expect(mock.postCorpus).not.toHaveBeenCalled();

	await wrapper.get('#corpus_name').setValue('Corpus');
	modal.vm.$emit('confirm');
	await wrapper.vm.$nextTick();
	expect(wrapper.text()).toContain('Please select a document format.');
	expect(mock.postCorpus).not.toHaveBeenCalled();
});

test('sanitizes only the corpus id and emits create, success, then close', async () => {
	const create = deferredRequest<BLResponse>();
	const events: string[] = [];
	mock.postCorpus.mockReturnValue(create.request);
	const wrapper = mount(ModalCreateCorpus, {
		props: {
			publicFormats,
			privateFormats,
			loading: false,
			user,
			onClose: () => events.push('close'),
			onCreate: () => events.push('create'),
			onSuccess: (message: string) => events.push(`success:${message}`),
		},
	});
	await enterCorpus(wrapper);
	wrapper.getComponent(Modal).vm.$emit('confirm');

	expect(mock.postCorpus).toHaveBeenCalledWith('alice:_Raw_Corpus_', ' Raw / Corpus ', 'alice:tei');
	create.resolve(response);
	await flushPromises();
	expect(events).toEqual(['create', 'success:Corpus " Raw / Corpus " created.', 'close']);
});

test('emits error then close and does not own the request lifetime', async () => {
	const create = deferredRequest<BLResponse>();
	const events: string[] = [];
	mock.postCorpus.mockReturnValue(create.request);
	const wrapper = mount(ModalCreateCorpus, {
		props: {
			publicFormats,
			privateFormats,
			loading: false,
			user,
			onClose: () => events.push('close'),
			onError: (message: string) => events.push(`error:${message}`),
		},
	});
	await enterCorpus(wrapper, 'Corpus');
	wrapper.getComponent(Modal).vm.$emit('confirm');
	create.reject(new ApiError('Error', 'Creation failed', 'Error', 500));
	await flushPromises();
	expect(events).toEqual(['error:Could not create corpus "Corpus": Creation failed', 'close']);

	const pending = deferredRequest<BLResponse>();
	mock.postCorpus.mockReturnValue(pending.request);
	const pendingWrapper = mountModal();
	await enterCorpus(pendingWrapper, 'Pending');
	pendingWrapper.getComponent(Modal).vm.$emit('confirm');
	pendingWrapper.unmount();
	expect(pending.cancel).not.toHaveBeenCalled();
});
