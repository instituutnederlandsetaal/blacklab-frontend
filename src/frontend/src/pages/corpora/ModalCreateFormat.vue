<template>
	<Modal
		title="New import format"
		:closeEnabled="!uploading"
		:confirmEnabled="!uploading && !downloading"
		:confirmMessage="uploading ? 'Saving...' : dirty ? 'Save*' : 'Save'"
		fullscreen
		@confirm="uploadFormat"
		@close="emit('close')"
	>
		<div style="display: flex; flex-direction: column; height: 100%; position: relative; gap: 15px" @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave" @drop.prevent="onDrop">
			<!-- Drag overlay -->
			<div v-if="dragActive" style="position: absolute; inset: 0; background: rgba(0, 0, 0, 0.15); z-index: 10; display: flex; align-items: center; justify-content: center; pointer-events: none">
				<h2 style="color: #333; background: #fff; padding: 2em 3em; border-radius: 10px; box-shadow: 0 2px 8px #0002; pointer-events: none">Drop file to load</h2>
			</div>

			<div style="display: flex; align-items: flex-start; justify-content: space-between">
				<div class="form-group" style="margin-right: 50px; margin-bottom: 0; flex: 1 1 auto">
					<label for="format_name">Format name</label>
					<div class="input-group" style="width: 100%">
						<input type="text" id="format_name" name="format_name" class="form-control" v-model.lazy="formatName" />
						<SelectPicker v-model="formatLanguage" :options="formatTypes" hideEmpty data-class="btn-primary dropdown-toggle" class="input-group-btn" />
					</div>
				</div>

				<div>
					<label style="display: flex; align-items: baseline; justify-content: space-between"
						><span>Load a file</span>
						<small class="text-muted"
							><em><span class="fa fa-info-circle"></span> Or drag and drop a file anywhere</em></small
						>
					</label>
					<div style="display: inline-flex; flex-wrap: nowrap">
						<label class="btn btn-primary" style="position: relative" for="format_file">
							<input
								type="file"
								name="format_file"
								id="format_file"
								title="Open a file from your computer. You can also drag and drop a file."
								style="position: absolute; left: 0; top: 0; width: 0px; height: 100%; padding-left: 100%; opacity: 0; cursor: pointer; overflow: hidden"
								@change="loadFormatFromDisk"
							/>
							Open file...
						</label>

						<label style="padding: 0 0.5em; align-self: flex-end">Or</label>

						<div style="display: inline-flex; flex-wrap: nowrap; flex-direction: row">
							<SelectPicker
								:options="formatOptions"
								data-style="border-right: none; border-top-right-radius: 0; border-bottom-right-radius: 0;"
								right
								:showValues="true"
								searchable
								placeholder="Select an existing format"
								hideEmpty
								allowHtml
								data-menu-width="auto"
								container="body"
								:modelValue="formatPresetName"
								@update:modelValue="replacePreset"
							/>
							<button @click="downloadFormat" :disabled="!formatPresetName || downloading" class="btn btn-primary" style="border-top-left-radius: 0; border-bottom-left-radius: 0">Load</button>
						</div>
					</div>
				</div>
			</div>

			<div v-if="error" class="alert alert-danger" style="margin: 0">
				<a href="#" class="close" aria-label="close" @click="error = ''">×</a>
				{{ error }}
			</div>

			<MonacoEditor style="flex-grow: 1" :options="editorOptions" :language="formatLanguage" :filename="fullFormatName" v-model="formatContents" @update:modelValue="markLocalEdit" />
		</div>
		<template #footer>
			<h5 class="pull-left">
				<span class="fa fa-question-circle text-muted"></span>
				<a href="https://blacklab.ivdnt.org/how-to-configure-indexing.html" target="_blank" style="font-weight: bold">How to write your own format</a>
			</h5>
		</template>
	</Modal>
</template>

<script setup lang="ts">
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { computed, defineAsyncComponent, onBeforeUnmount, ref } from 'vue';

import type { NormalizedFormat } from '@/types/apptypes';
import type { BLFormatContent } from '@/types/blacklabtypes';

import { useBlackLabApi } from '@/shared/api';
import type { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';
import type { Option, Options } from '@/shared/utils/options';

import Modal from '@/shared/ui/Modal.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

const props = defineProps<{
	/** When clicking the pencil to edit an existing format. */
	format?: NormalizedFormat | null;
	publicFormats: NormalizedFormat[];
	privateFormats: NormalizedFormat[];
}>();
const emit = defineEmits<{ close: []; create: []; success: [message: string] }>();
const blacklab = useBlackLabApi();
// This causes the Monaco editor to become its own bundle, since it is bigger than the rest of the application code combined.
const MonacoEditor = defineAsyncComponent(() => import('@/shared/ui/MonacoEditor.vue'));

const formatName = ref('');
const formatPresetName = ref('');
const formatContents = ref('');
const formatLanguage = ref<'json' | 'yaml'>('json');
const error = ref('');
const uploading = ref(false);
const downloading = ref(false);
const dirty = ref(false);
const dragActive = ref(false);
let downloadRequest: CancelableRequest<BLFormatContent> | null = null;

const formatTypes: Option[] = [
	{ label: 'JSON', value: 'json' },
	{ label: 'YAML', value: 'yaml' },
];
const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
	automaticLayout: true,
	minimap: { autohide: true },
};
const fullFormatName = computed(() => `${formatName.value || 'my-custom-format'}.blf.${formatLanguage.value}`);
const formatOptions = computed<Options>(() => [
	...(props.privateFormats.length ? [{ label: 'Custom', options: props.privateFormats.map(f => ({ value: f.id, label: `${f.displayName} <small class="text-muted">${f.id}</small>` })) }] : []),
	...(props.publicFormats.length ? [{ label: 'Public', options: props.publicFormats.map(f => ({ value: f.id, label: `${f.displayName} <small class="text-muted">${f.id}</small>` })) }] : []),
]);

function cancelDownload() {
	const request = downloadRequest;
	downloadRequest = null;
	request?.cancel();
	if (request) downloading.value = false;
}

function replacePreset(value: string | string[] | null) {
	cancelDownload();
	formatPresetName.value = typeof value === 'string' ? value : '';
}

function downloadFormat() {
	cancelDownload();
	const presetName = formatPresetName.value;
	if (!presetName) return;
	downloading.value = true;
	const request = (downloadRequest = blacklab.getFormatContent(presetName));
	request
		.then(
			data => {
				if (downloadRequest !== request) return;
				const configFileType = data.configFileType.toLowerCase();
				formatLanguage.value = (configFileType === 'yml' ? 'yaml' : configFileType) as typeof formatLanguage.value;
				formatContents.value = data.configFile;
				if (!formatName.value) formatName.value = presetName.split(':')[1] || presetName;
				dirty.value = false;
			},
			(cause: ApiError) => {
				if (downloadRequest === request) error.value = cause.message;
			},
		)
		.finally(() => {
			if (downloadRequest === request) {
				downloadRequest = null;
				downloading.value = false;
			}
		});
}

function markLocalEdit() {
	cancelDownload();
	dirty.value = true;
}

function readFile(file: File, loaded: () => void) {
	const reader = new FileReader();
	reader.onload = () => {
		markLocalEdit();
		formatContents.value = reader.result as string;
		loaded();
	};
	reader.readAsText(file);
}

function loadFormatFromDisk(event: Event) {
	const input = event.target as HTMLInputElement;
	if (!input.files?.length) return;
	const file = input.files[0];
	readFile(file, () => {
		const parsedLanguage = file.name.split('.').pop()!.toLowerCase();
		if (formatTypes.find(type => type.value === parsedLanguage)) formatLanguage.value = parsedLanguage as typeof formatLanguage.value;
		formatName.value = file.name.split('.').shift()!;
	});
	input.value = '';
}

function onDragOver(event: DragEvent) {
	const item = event.dataTransfer?.items?.[0];
	if (item?.kind === 'file') dragActive.value = true;
}

function onDragLeave() {
	dragActive.value = false;
}

function onDrop(event: DragEvent) {
	dragActive.value = false;
	if (!event.dataTransfer?.files.length) return;
	const file = event.dataTransfer.files[0];
	const validExts = ['.yaml', '.yml', '.txt', '.text', '.json'];
	const name = file.name.toLowerCase();
	if (!validExts.some(ext => name.endsWith(ext))) {
		error.value = `File type not supported. Please drop a ${validExts.join(', ')} file.`;
		return;
	}
	if (file.size > 100 * 1024) {
		error.value = 'File is too large (max 100kb).';
		return;
	}
	readFile(file, () => {
		formatLanguage.value = name.endsWith('.yaml') || name.endsWith('.yml') ? 'yaml' : 'json';
		formatName.value = file.name.replace(/\.(blf\.yaml|blf\.yml|yaml|yml|json|txt|text)$/i, '');
	});
}

function uploadFormat() {
	uploading.value = true;
	blacklab
		.postFormat(`${formatName.value}.blf.${formatLanguage.value.toLowerCase()}`, formatContents.value)
		.then(
			data => {
				emit('create');
				emit('success', data.status.message);
				dirty.value = false;
				error.value = '';
			},
			(cause: ApiError) => (error.value = cause.message),
		)
		.finally(() => (uploading.value = false));
}

onBeforeUnmount(cancelDownload);
if (props.format) {
	formatPresetName.value = props.format.id;
	downloadFormat();
}
</script>
