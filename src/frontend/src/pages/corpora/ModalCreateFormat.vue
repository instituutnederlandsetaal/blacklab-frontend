<template>
	<Modal
		title="New import format"
		:closeEnabled="!uploading"
		:confirmEnabled="!uploading"
		:confirmMessage="uploading ? 'Saving...' : dirty ? 'Save*' : 'Save'"

		fullscreen

		@confirm="uploadFormat"
		@close="$emit('close')"
	>
		<div
			style="display: flex; flex-direction: column; height: 100%; position: relative; gap: 15px;"
			@dragover.prevent="onDragOver" 
			@dragleave.prevent="onDragLeave"
			@drop.prevent="onDrop"
		>
			<!-- Drag overlay -->
			<div v-if="dragActive" style="position: absolute; inset: 0; background: rgba(0,0,0,0.15); z-index: 10; display: flex; align-items: center; justify-content: center; pointer-events: none;">
				<h2 style="color: #333; background: #fff; padding: 2em 3em; border-radius: 10px; box-shadow: 0 2px 8px #0002; pointer-events: none;">Drop file to load</h2>
			</div>

			<div style="display:flex; align-items: flex-start; justify-content: space-between;">
				<div class="form-group" style="margin-right: 50px; margin-bottom: 0; flex: 1 1 auto;">
					<label for="format_name">Format name</label>
					<div class="input-group" style="width:100%">
						<input type="text" id="format_name" name="format_name" class="form-control" v-model.lazy="formatName">
						<SelectPicker v-model="formatLanguage" :options="formatTypes" hideEmpty data-class="btn-primary dropdown-toggle" class="input-group-btn"/>
					</div>
				</div>

				<div>
					<label style="display: flex; align-items: baseline; justify-content: space-between;"><span>Load a file</span> <small class="text-muted"><em><span class="fa fa-info-circle"></span> Or drag and drop a file anywhere</em></small> </label>
					<div style="display: inline-flex; flex-wrap: nowrap;">
						<label class="btn btn-primary" style="position:relative;" for="format_file">
							<input type="file" name="format_file" id="format_file" title="Open a file from your computer. You can also drag and drop a file." style="position:absolute;left:0;top:0;width:0px;height:100%;padding-left:100%;opacity:0;cursor:pointer;overflow:hidden;" @change="loadFormatFromDisk">
							Open file...
						</label>

						<label style="padding: 0 0.5em; align-self: flex-end;">Or</label>

						<div style="display: inline-flex; flex-wrap: nowrap; flex-direction: row;">
							<SelectPicker :options="formatOptions" data-style="border-right: none; border-top-right-radius: 0; border-bottom-right-radius: 0;" right :showValues="true" searchable placeholder="Select an existing format" hideEmpty allowHtml data-menu-width="auto" container="body" v-model="formatPresetName"/>
							<button @click="downloadFormat" :disabled="!formatPresetName || downloading" class="btn btn-primary" style="border-top-left-radius: 0; border-bottom-left-radius: 0">Load</button>
						</div>
					</div>
				</div>
			</div>

			<div v-if="error" class="alert alert-danger" style="margin: 0;">
				<a href="#" class="close" aria-label="close" @click="error = ''">×</a>
				{{ error }}
			</div>

			<MonacoEditor style="flex-grow: 1"
				:options="editorOptions"
				:language="formatLanguage"
				:filename="fullFormatName"
				v-model="formatContents"
				@input="dirty = true"
			/>

		</div>
		<template #footer>
			<h5 class="pull-left"><span class="fa fa-question-circle text-muted"></span> <a href="https://blacklab.ivdnt.org/how-to-configure-indexing.html" target="_blank" style="font-weight: bold">How to write your own format</a></h5>
		</template>
	</Modal>
</template>

<script lang="ts">
import Vue from 'vue';
import Modal from '@/components/Modal.vue';
import { NormalizedFormat, Option } from '@/types/apptypes';
import * as Api from '@/api';

import SelectPicker from '@/components/SelectPicker.vue'
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { Options } from '@/components/SelectPicker.vue';

export default Vue.extend({
	components: {
		Modal,
		SelectPicker,
		// this causes the monaco editor to become its own js bundle, nice, since it's literally bigger than all of our other code combined
		MonacoEditor: () => import('@/components/MonacoEditor.vue')
	},
	props: {
		/** When clicking the pencil to edit an existing format. */
		format: Object as () => undefined|NormalizedFormat,
		publicFormats: Array as () => NormalizedFormat[],
		privateFormats: Array as () => NormalizedFormat[],
		loading: Boolean
	},
	data: () => ({
		formatName: '',
		formatPresetName: '',
		formatContents: '',
		formatLanguage: 'json',
		// during upload
		error: '',
		uploading: false,
		downloading: false,
		dirty: false,

		formatTypes: [{
			label: 'JSON',
			value: 'json'
		}, {
			label: 'YAML',
			value: 'yaml'
		}] as Option[],
		dragActive: false,
	}),
	computed: {
		fullFormatName(): string {
			return `${this.formatName || 'my-custom-format'}.blf.${this.formatLanguage}`;
		},
		editorOptions(): monaco.editor.IStandaloneEditorConstructionOptions {
			return {
				automaticLayout: true,
				minimap: { autohide: true, },
			}
		},
		formatOptions(): Options {
			const r: Options = [];
			if (this.privateFormats.length) r.push({label: 'Custom', options: this.privateFormats.map(f => ({value: f.id, label: `${f.displayName} <small class="text-muted">${f.id}</small>`}))});
			if (this.publicFormats.length) r.push({label: 'Public', options: this.publicFormats.map(f => ({value: f.id, label: `${f.displayName} <small class="text-muted">${f.id}</small>`}))});
			return r;
		}
	},
	methods: {
		downloadFormat() {
			if (!this.formatPresetName) { return; }
			const presetName = this.formatPresetName;
			this.downloading = true;

			Api.blacklab.getFormatContent(this.formatPresetName)
			.then(data => {
				let configFileType = data.configFileType.toLowerCase();
				if (configFileType === 'yml') {
					configFileType = 'yaml';
				}
				this.formatLanguage = configFileType;
				this.formatContents = data.configFile;

				if (!this.formatName)
					this.formatName = presetName.split(':')[1] || presetName; // default to the preset name
				this.dirty = false;
			})
			.catch((e: Api.ApiError) => this.error = e.message)
			.finally(() => this.downloading = false)
		},
		loadFormatFromDisk(e: InputEvent) {
			const input = e.target as HTMLInputElement;
			if (!input.files || !input.files.length) return;
			const file = input.files[0];
			const reader = new FileReader();
			reader.onload = () => {
				this.dirty = true;
				this.formatContents = reader.result as string;
				const parsedLanguage = file.name.split('.').pop()!.toLowerCase();
				if (this.formatTypes.find(t => t.value === parsedLanguage))
					this.formatLanguage = parsedLanguage;

				this.formatName = file.name.split('.').shift()!;
			}
			reader.readAsText(file);
			input.value = '';
		},
		onDragOver(e: DragEvent) {
			if (e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length) {
				const item = e.dataTransfer.items[0];
				if (item.kind === 'file') {
					this.dragActive = true;
				}
			}
		},
		onDragLeave(e: DragEvent) {
			this.dragActive = false;
		},
		onDrop(e: DragEvent) {
			this.dragActive = false;
			if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
			const file = e.dataTransfer.files[0];
			const validExts = [
				'.yaml', '.yml', '.txt', '.text', '.json'
			];
			const name = file.name.toLowerCase();
			const isValid = validExts.some(ext => name.endsWith(ext));
			if (!isValid) {
				this.error = `File type not supported. Please drop a ${validExts.join(', ')} file.`;
				return;
			}
			if (file.size > 100 * 1024) { // 100kb
				this.error = 'File is too large (max 100kb).';
				return;
			}
			const reader = new FileReader();
			reader.onload = () => {
				this.dirty = true;
				this.formatContents = reader.result as string;
				// Set language based on extension
				if (name.endsWith('.json')) this.formatLanguage = 'json';
				else if (name.endsWith('.yaml') || name.endsWith('.yml')) this.formatLanguage = 'yaml';
				else this.formatLanguage = 'json';
				// Set name (strip extension)
				this.formatName = file.name.replace(/\.(blf\.yaml|blf\.yml|yaml|yml|json|txt|text)$/i, '');
			};
			reader.readAsText(file);
		},
		uploadFormat() {
			this.uploading = true;
			Api.blacklab.postFormat(`${this.formatName}.blf.${this.formatLanguage.toLowerCase()}`, this.formatContents)
			.then(data => {
				this.$emit('create');
				this.$emit('success', data.status.message);
				this.dirty = false;
				this.error = '';
			})
			.catch((e: Api.ApiError) => this.error = e.message)
			.finally(() => this.uploading = false);
		}
	},
	created() {
		this.formatPresetName = this.format?.id ?? '';
		this.downloadFormat();
	}
})

</script>