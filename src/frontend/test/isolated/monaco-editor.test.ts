// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import MonacoEditor from '@/shared/ui/MonacoEditor.vue';

type FakeModel = {
	value: string;
	language: string;
	uri: unknown;
	dispose: ReturnType<typeof vi.fn>;
	getValue: ReturnType<typeof vi.fn>;
	setValue: ReturnType<typeof vi.fn>;
};

const mock = vi.hoisted(() => ({
	contentListener: undefined as undefined | (() => void),
	contentListenerDispose: vi.fn(),
	create: vi.fn(),
	createModel: vi.fn(),
	currentModel: undefined as FakeModel | undefined,
	disposeEditor: vi.fn(),
	models: [] as FakeModel[],
	restoreViewState: vi.fn(),
	saveViewState: vi.fn(() => ({ cursorState: [] })),
	setModel: vi.fn(),
	setModelLanguage: vi.fn(),
	setTheme: vi.fn(),
	updateOptions: vi.fn(),
	uriFrom: vi.fn((value: unknown) => value),
}));

vi.mock('@/shared/ui/monacoEditor', () => ({
	default: {
		Uri: { from: mock.uriFrom },
		editor: {
			create: mock.create,
			createModel: mock.createModel,
			setModelLanguage: mock.setModelLanguage,
			setTheme: mock.setTheme,
		},
	},
}));

beforeEach(() => {
	vi.clearAllMocks();
	mock.contentListener = undefined;
	mock.currentModel = undefined;
	mock.models.length = 0;

	mock.createModel.mockImplementation((value: string, language: string, uri: unknown): FakeModel => {
		const model = {
			value,
			language,
			uri,
			dispose: vi.fn(),
			getValue: vi.fn(() => model.value),
			setValue: vi.fn((nextValue: string) => {
				model.value = nextValue;
				if (mock.currentModel === model) mock.contentListener?.();
			}),
		};
		mock.models.push(model);
		return model;
	});

	mock.create.mockImplementation((_element: HTMLElement, options: { model: FakeModel }) => {
		mock.currentModel = options.model;
		return {
			dispose: mock.disposeEditor,
			getValue: () => mock.currentModel?.value ?? '',
			onDidChangeModelContent: (listener: () => void) => {
				mock.contentListener = listener;
				return { dispose: mock.contentListenerDispose };
			},
			restoreViewState: mock.restoreViewState,
			saveViewState: mock.saveViewState,
			setModel: (model: FakeModel) => {
				mock.currentModel = model;
				mock.setModel(model);
			},
			updateOptions: mock.updateOptions,
		};
	});
});

describe('MonacoEditor', () => {
	test('creates a schema-addressable model with the requested options', () => {
		const options = { automaticLayout: true, minimap: { enabled: false } };
		const wrapper = mount(MonacoEditor, {
			props: {
				filename: 'example.blf.yaml',
				language: 'yaml',
				modelValue: 'version: 2',
				options,
			},
		});

		expect(mock.uriFrom).toHaveBeenCalledWith(
			expect.objectContaining({
				authority: 'blacklab-format-editor',
				path: expect.stringMatching(/\/example\.blf\.yaml$/),
				scheme: 'inmemory',
			}),
		);
		expect(mock.createModel).toHaveBeenCalledWith('version: 2', 'yaml', expect.anything());
		expect(mock.create).toHaveBeenCalledWith(wrapper.get('.monaco-editor-container').element, expect.objectContaining({ ...options, model: mock.models[0], theme: 'vs' }));
	});

	test('emits edits and accepts external value updates without echoing them', async () => {
		const wrapper = mount(MonacoEditor, { props: { modelValue: '{}' } });
		mock.models[0].value = '{"version": 2}';
		mock.contentListener?.();

		expect(wrapper.emitted('update:modelValue')).toEqual([['{"version": 2}']]);
		expect(wrapper.emitted('change')).toEqual([['{"version": 2}']]);

		await wrapper.setProps({ modelValue: '{"version": 1}' });
		expect(mock.models[0].setValue).toHaveBeenCalledWith('{"version": 1}');
		expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
	});

	test('replaces and disposes the model when its filename or language changes', async () => {
		const wrapper = mount(MonacoEditor, {
			props: { filename: 'example.blf.yaml', language: 'yaml', modelValue: 'version: 2' },
		});
		const yamlModel = mock.models[0];

		await wrapper.setProps({ filename: 'example.blf.json', language: 'json' });

		expect(mock.createModel).toHaveBeenLastCalledWith('version: 2', 'json', expect.anything());
		expect(mock.uriFrom).toHaveBeenLastCalledWith(expect.objectContaining({ path: expect.stringMatching(/\/example\.blf\.json$/) }));
		expect(mock.setModel).toHaveBeenCalledWith(mock.models[1]);
		expect(mock.restoreViewState).toHaveBeenCalledWith({ cursorState: [] });
		expect(yamlModel.dispose).toHaveBeenCalledOnce();
	});

	test('updates options and themes and disposes all owned resources', async () => {
		const wrapper = mount(MonacoEditor, { props: { modelValue: '' } });
		await wrapper.setProps({ options: { readOnly: true, theme: 'hc-black' } });

		expect(mock.updateOptions).toHaveBeenCalledWith({ readOnly: true, theme: 'hc-black' });
		expect(mock.setTheme).toHaveBeenCalledWith('hc-black');

		const currentModel = mock.currentModel!;
		wrapper.unmount();
		expect(mock.contentListenerDispose).toHaveBeenCalledOnce();
		expect(mock.disposeEditor).toHaveBeenCalledOnce();
		expect(currentModel.dispose).toHaveBeenCalledOnce();
	});
});
