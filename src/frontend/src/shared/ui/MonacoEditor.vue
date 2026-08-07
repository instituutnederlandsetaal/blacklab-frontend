<template>
	<div class="monaco-editor-wrapper">
		<div ref="editorElement" class="monaco-editor-container"></div>
		<label v-if="!options.theme" class="monaco-theme-toggle"><input v-model="darkMode" type="checkbox" /> Dark mode</label>
	</div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { PropType } from 'vue';
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js';

import monaco from './monacoEditor';

type MonacoEditorLanguage = 'json' | 'yaml';

const props = defineProps({
	modelValue: { type: String, default: '' },
	language: { type: String as PropType<MonacoEditorLanguage>, default: 'yaml' },
	filename: { type: String, default: 'file.blf.yaml' },
	options: { type: Object as PropType<Monaco.editor.IStandaloneEditorConstructionOptions>, default: () => ({}) },
});

const emit = defineEmits<{
	'update:modelValue': [value: string];
	change: [value: string];
}>();

const editorId = getCurrentInstance()?.uid ?? 0;
let modelVersion = 0;

const editorElement = ref<HTMLElement>();
const darkMode = ref(typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true);
const effectiveTheme = computed(() => props.options.theme || (darkMode.value ? 'vs-dark' : 'vs'));

let editor: Monaco.editor.IStandaloneCodeEditor | undefined;
let model: Monaco.editor.ITextModel | undefined;
let changeListener: Monaco.IDisposable | undefined;

function modelUri(filename: string, language: MonacoEditorLanguage): Monaco.Uri {
	const fallback = `file.blf.${language}`;
	const basename = filename.replaceAll('\\', '/').split('/').pop() || fallback;
	const expectedExtension = `.blf.${language}`;
	const schemaFilename = basename.toLowerCase().endsWith(expectedExtension) ? basename : `${basename.replace(/(?:\.blf)?\.(?:json|ya?ml)$/i, '') || 'file'}${expectedExtension}`;
	return monaco.Uri.from({
		scheme: 'inmemory',
		authority: 'blacklab-format-editor',
		path: `/${editorId}/${++modelVersion}/${schemaFilename}`,
	});
}

function replaceModel(filename: string, language: MonacoEditorLanguage) {
	if (!editor || !model) return;

	const previousModel = model;
	const viewState = editor.saveViewState();
	model = monaco.editor.createModel(previousModel.getValue(), language, modelUri(filename, language));
	editor.setModel(model);
	if (viewState) editor.restoreViewState(viewState);
	previousModel.dispose();
}

watch(
	() => props.modelValue,
	value => {
		if (model && model.getValue() !== value) model.setValue(value);
	},
);

watch([() => props.filename, () => props.language], ([filename, language], [oldFilename, oldLanguage]) => {
	if (!editor || !model) return;
	if (filename !== oldFilename || language !== oldLanguage) replaceModel(filename, language);
});

watch(
	() => props.options,
	options => editor?.updateOptions(options),
	{ deep: true },
);

watch(effectiveTheme, theme => monaco.editor.setTheme(theme));

onMounted(() => {
	if (!editorElement.value) return;

	model = monaco.editor.createModel(props.modelValue, props.language, modelUri(props.filename, props.language));
	editor = monaco.editor.create(editorElement.value, {
		...props.options,
		model,
		theme: effectiveTheme.value,
	});
	changeListener = editor.onDidChangeModelContent(() => {
		const value = editor?.getValue() ?? '';
		if (value !== props.modelValue) {
			emit('update:modelValue', value);
			emit('change', value);
		}
	});
});

onBeforeUnmount(() => {
	changeListener?.dispose();
	editor?.dispose();
	model?.dispose();
	changeListener = undefined;
	editor = undefined;
	model = undefined;
});
</script>

<style scoped>
.monaco-editor-wrapper {
	display: flex;
	width: 100%;
	height: 200px;
	min-height: 200px;
	flex-direction: column;
}

.monaco-editor-container {
	width: 100%;
	min-height: 0;
	flex: 1 1 auto;
}

.monaco-theme-toggle {
	margin: 0;
	flex: 0 0 auto;
	font-weight: normal;
}
</style>
