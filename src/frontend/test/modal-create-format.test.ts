// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, test, vi } from 'vitest';
import { defineComponent } from 'vue';

import type { NormalizedFormat } from '@/types/apptypes';
import type { BLFormatContent, BLResponse } from '@/types/blacklabtypes';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';

import ModalCreateFormat from '@/pages/corpora/ModalCreateFormat.vue';
import Modal from '@/shared/ui/Modal.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

const mock = vi.hoisted(() => ({
	getFormatContent: vi.fn(),
	postFormat: vi.fn(),
}));

vi.mock('@/shared/api', () => ({ useBlackLabApi: () => mock }));

const MonacoEditor = defineComponent({
	name: 'MonacoEditor',
	props: ['modelValue', 'language', 'filename', 'options'],
	emits: ['update:modelValue'],
	template: '<textarea data-testid="editor" :data-filename="filename" :data-language="language" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
});

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

const format = { id: 'owner:preset', displayName: 'Preset' } as NormalizedFormat;
const availableFormats = ['owner:preset', 'owner:replacement', 'owner:next', 'owner:unmounting', 'standalone', 'owner:broken'].map(id => ({ id, displayName: id })) as NormalizedFormat[];
const content = (configFile: string, configFileType: string = 'json') => ({ configFile, configFileType, formatName: 'preset' }) as BLFormatContent;
const response = (message: string) => ({ status: { code: 'SUCCESS', message } }) as BLResponse;

function mountFormat(options: { format?: NormalizedFormat; onCreate?: () => void; onSuccess?: (message: string) => void } = {}) {
	return mount(ModalCreateFormat, {
		props: {
			format: options.format,
			privateFormats: availableFormats,
			publicFormats: [],
			onCreate: options.onCreate,
			onSuccess: options.onSuccess,
		},
		global: { stubs: { MonacoEditor } },
	});
}

function presetPicker(wrapper: ReturnType<typeof mountFormat>) {
	return wrapper.findAllComponents(SelectPicker).find(picker => picker.props('placeholder') === 'Select an existing format')!;
}

function loadButton(wrapper: ReturnType<typeof mountFormat>) {
	return wrapper.findAll('button').find(button => button.text() === 'Load')!;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

test('loads an edited format immediately and disables saving while its request is pending', async () => {
	const pending = deferredRequest<BLFormatContent>();
	mock.getFormatContent.mockReturnValue(pending.request);
	const wrapper = mountFormat({ format });

	expect(mock.getFormatContent).toHaveBeenCalledWith('owner:preset');
	expect(wrapper.getComponent(Modal).props('confirmEnabled')).toBe(false);

	pending.resolve(content('remote', 'yml'));
	await flushPromises();
	expect(wrapper.getComponent(Modal).props('confirmEnabled')).toBe(true);
	const editor = wrapper.get<HTMLTextAreaElement>('[data-testid="editor"]');
	expect(editor.attributes()).toMatchObject({ 'data-filename': 'preset.blf.yaml', 'data-language': 'yaml' });
	expect(editor.element.value).toBe('remote');
});

test('editor changes and preset replacement cancel and invalidate stale downloads', async () => {
	const initial = deferredRequest<BLFormatContent>();
	const replacement = deferredRequest<BLFormatContent>();
	mock.getFormatContent.mockReturnValueOnce(initial.request).mockReturnValueOnce(replacement.request);
	const wrapper = mountFormat({ format });

	await wrapper.get('[data-testid="editor"]').setValue('local');
	expect(initial.cancel).toHaveBeenCalledOnce();
	initial.resolve(content('stale initial'));
	await flushPromises();
	expect(wrapper.get<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toBe('local');

	presetPicker(wrapper).vm.$emit('update:modelValue', 'owner:replacement');
	await wrapper.vm.$nextTick();
	await loadButton(wrapper).trigger('click');
	expect(mock.getFormatContent).toHaveBeenLastCalledWith('owner:replacement');
	presetPicker(wrapper).vm.$emit('update:modelValue', 'owner:next');
	expect(replacement.cancel).toHaveBeenCalledOnce();
	replacement.resolve(content('stale replacement'));
	await flushPromises();
	expect(wrapper.get<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toBe('local');
});

test('a completed local file read invalidates a pending download and unmount cancels the current one', async () => {
	const pending = deferredRequest<BLFormatContent>();
	mock.getFormatContent.mockReturnValue(pending.request);
	const wrapper = mountFormat({ format });
	vi.stubGlobal(
		'FileReader',
		class {
			result = 'local file';
			onload: null | (() => void) = null;
			readAsText() {
				this.onload?.();
			}
		},
	);
	const input = wrapper.get<HTMLInputElement>('#format_file');
	Object.defineProperty(input.element, 'files', { value: [new File(['local file'], 'local.txt', { type: 'text/plain' })] });
	await input.trigger('change');
	await vi.waitFor(() => expect(pending.cancel).toHaveBeenCalledOnce());
	expect(pending.cancel).toHaveBeenCalledOnce();
	expect(wrapper.get<HTMLTextAreaElement>('[data-testid="editor"]').element).toMatchObject({ value: 'local file' });
	expect(wrapper.get('[data-testid="editor"]').attributes('data-filename')).toBe('local.blf.json');

	const unmounting = deferredRequest<BLFormatContent>();
	mock.getFormatContent.mockReturnValue(unmounting.request);
	presetPicker(wrapper).vm.$emit('update:modelValue', 'owner:unmounting');
	await wrapper.vm.$nextTick();
	await loadButton(wrapper).trigger('click');
	wrapper.unmount();
	expect(unmounting.cancel).toHaveBeenCalledOnce();
});

test('only the active download applies success or error and settles the save control', async () => {
	const success = deferredRequest<BLFormatContent>();
	const failure = deferredRequest<BLFormatContent>();
	mock.getFormatContent.mockReturnValueOnce(success.request).mockReturnValueOnce(failure.request);
	const wrapper = mountFormat();

	presetPicker(wrapper).vm.$emit('update:modelValue', 'standalone');
	await wrapper.vm.$nextTick();
	await loadButton(wrapper).trigger('click');
	success.resolve(content('loaded', 'YML'));
	await flushPromises();
	const editor = wrapper.get<HTMLTextAreaElement>('[data-testid="editor"]');
	expect(editor.attributes()).toMatchObject({ 'data-filename': 'standalone.blf.yaml', 'data-language': 'yaml' });
	expect(editor.element.value).toBe('loaded');

	presetPicker(wrapper).vm.$emit('update:modelValue', 'owner:broken');
	await wrapper.vm.$nextTick();
	await loadButton(wrapper).trigger('click');
	failure.reject(new ApiError('Error', 'Could not load format', 'Error', 500));
	await flushPromises();
	expect(wrapper.text()).toContain('Could not load format');
	expect(wrapper.getComponent(Modal).props('confirmEnabled')).toBe(true);
});

test('saving emits create then success, clears local state, stays open, and is not cancelled on unmount', async () => {
	const events: string[] = [];
	const failed = deferredRequest<BLResponse>();
	const saved = deferredRequest<BLResponse>();
	const unmounting = deferredRequest<BLResponse>();
	mock.postFormat.mockReturnValueOnce(failed.request).mockReturnValueOnce(saved.request).mockReturnValueOnce(unmounting.request);
	const wrapper = mountFormat({ onCreate: () => events.push('create'), onSuccess: message => events.push(`success:${message}`) });
	await wrapper.get('#format_name').setValue('custom');
	await wrapper.get('[data-testid="editor"]').setValue('contents');

	wrapper.getComponent(Modal).vm.$emit('confirm');
	await wrapper.vm.$nextTick();
	expect(mock.postFormat).toHaveBeenCalledWith('custom.blf.json', 'contents');
	expect(wrapper.getComponent(Modal).props('confirmEnabled')).toBe(false);
	failed.reject(new ApiError('Error', 'Could not save format', 'Error', 500));
	await flushPromises();
	expect(wrapper.text()).toContain('Could not save format');

	wrapper.getComponent(Modal).vm.$emit('confirm');
	saved.resolve(response('Saved'));
	await flushPromises();
	expect(events).toEqual(['create', 'success:Saved']);
	expect(wrapper.emitted('close')).toBeUndefined();
	expect(wrapper.text()).not.toContain('Could not save format');
	expect(wrapper.getComponent(Modal).props('confirmMessage')).toBe('Save');

	wrapper.getComponent(Modal).vm.$emit('confirm');
	wrapper.unmount();
	expect(unmounting.cancel).not.toHaveBeenCalled();
});
