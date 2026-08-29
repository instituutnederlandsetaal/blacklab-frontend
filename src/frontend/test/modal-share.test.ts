// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, test, vi } from 'vitest';

import type { NormalizedIndexBase } from '@/types/apptypes';
import type { BLResponse } from '@/types/blacklabtypes';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';

import ModalShare from '@/pages/corpora/ModalShare.vue';
import Modal from '@/shared/ui/Modal.vue';

const mock = vi.hoisted(() => ({
	getShares: vi.fn(),
	postShares: vi.fn(),
}));

vi.mock('@/shared/api', () => ({ useBlackLabApi: () => mock }));

function deferredRequest<T>() {
	let resolve!: (value: T) => void;
	let reject!: (cause: unknown) => void;
	const cancel = vi.fn(() => reject(ApiError.CANCELLED));
	const request = new CancelableRequest<T>(
		new Promise<T>((resolvePromise, rejectPromise) => {
			resolve = resolvePromise;
			reject = rejectPromise;
		}),
		cancel,
	);
	return { cancel, reject, request, resolve };
}

const corpus = {
	displayName: 'Private corpus',
	id: 'alice:private',
} as NormalizedIndexBase;
const response = (message: string) => ({ status: { code: 'SUCCESS', message } }) as BLResponse;

beforeEach(() => vi.clearAllMocks());

test('enables saving an empty successful share list and emits success before close', async () => {
	const load = deferredRequest<string[]>();
	const save = deferredRequest<BLResponse>();
	const events: string[] = [];
	mock.getShares.mockReturnValue(load.request);
	mock.postShares.mockReturnValue(save.request);
	const wrapper = mount(ModalShare, {
		props: {
			corpus,
			onClose: () => events.push('close'),
			onSuccess: (message: string) => events.push(`success:${message}`),
		},
	});
	const modal = wrapper.getComponent(Modal);

	expect(modal.props('confirmEnabled')).toBe(false);
	expect(modal.props('closeEnabled')).toBe(true);
	modal.vm.$emit('confirm');
	expect(mock.postShares).not.toHaveBeenCalled();

	load.resolve([]);
	await flushPromises();
	expect(wrapper.get<HTMLTextAreaElement>('textarea').element.value).toBe('');
	expect(modal.props('confirmEnabled')).toBe(true);

	modal.vm.$emit('confirm');
	await wrapper.vm.$nextTick();
	expect(mock.postShares).toHaveBeenCalledWith(corpus.id, ['']);
	expect(modal.props('confirmEnabled')).toBe(false);
	expect(modal.props('closeEnabled')).toBe(true);

	save.resolve(response('Shares saved'));
	await flushPromises();
	expect(events).toEqual(['success:Shares saved', 'close']);
	wrapper.unmount();
});

test('keeps saving disabled after a failed load and retries when reopened', async () => {
	const failed = deferredRequest<string[]>();
	const retried = deferredRequest<string[]>();
	mock.getShares.mockReturnValueOnce(failed.request).mockReturnValueOnce(retried.request);
	const wrapper = mount(ModalShare, { props: { corpus } });

	failed.reject(new ApiError('Error', 'Server unavailable', 'Error', 500));
	await flushPromises();
	expect(wrapper.text()).toContain('Could not retrieve share list for corpus "Private corpus": Server unavailable');
	expect(wrapper.getComponent(Modal).props('confirmEnabled')).toBe(false);
	wrapper.getComponent(Modal).vm.$emit('confirm');
	expect(mock.postShares).not.toHaveBeenCalled();
	wrapper.unmount();

	const reopened = mount(ModalShare, { props: { corpus } });
	expect(mock.getShares).toHaveBeenCalledTimes(2);
	retried.resolve(['alice', 'bob']);
	await flushPromises();
	expect(reopened.get<HTMLTextAreaElement>('textarea').element.value).toBe('alice\nbob');
	expect(reopened.getComponent(Modal).props('confirmEnabled')).toBe(true);
	reopened.unmount();
});

test('preserves raw newline splitting and displays save failures locally', async () => {
	const load = deferredRequest<string[]>();
	const save = deferredRequest<BLResponse>();
	mock.getShares.mockReturnValue(load.request);
	mock.postShares.mockReturnValue(save.request);
	const wrapper = mount(ModalShare, { props: { corpus } });
	load.resolve(['alice']);
	await flushPromises();

	await wrapper.get('textarea').setValue(' alice \n\nbob ');
	wrapper.getComponent(Modal).vm.$emit('confirm');
	await wrapper.vm.$nextTick();
	expect(mock.postShares).toHaveBeenCalledWith(corpus.id, [' alice ', '', 'bob ']);
	expect(wrapper.getComponent(Modal).props('confirmEnabled')).toBe(false);
	expect(wrapper.getComponent(Modal).props('closeEnabled')).toBe(true);

	save.reject(new ApiError('Error', 'Write failed', 'Error', 500));
	await flushPromises();
	expect(wrapper.text()).toContain('Could not save shares for corpus "Private corpus": Write failed');
	expect(wrapper.getComponent(Modal).props('confirmEnabled')).toBe(true);
	expect(wrapper.emitted('success')).toBeUndefined();
	expect(wrapper.emitted('close')).toBeUndefined();

	await wrapper.get('.alert .close').trigger('click');
	expect(wrapper.find('.alert').exists()).toBe(false);
	wrapper.unmount();
});

test('cancels only the initial load when unmounted', async () => {
	const load = deferredRequest<string[]>();
	mock.getShares.mockReturnValue(load.request);
	const loadingWrapper = mount(ModalShare, { props: { corpus } });
	loadingWrapper.unmount();
	expect(load.cancel).toHaveBeenCalledOnce();
	await flushPromises();

	const loaded = deferredRequest<string[]>();
	const save = deferredRequest<BLResponse>();
	mock.getShares.mockReturnValue(loaded.request);
	mock.postShares.mockReturnValue(save.request);
	const savingWrapper = mount(ModalShare, { props: { corpus } });
	loaded.resolve([]);
	await flushPromises();
	savingWrapper.getComponent(Modal).vm.$emit('confirm');
	savingWrapper.unmount();
	expect(save.cancel).not.toHaveBeenCalled();
});
