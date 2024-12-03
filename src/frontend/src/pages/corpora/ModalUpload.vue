<template>
	<Modal
		confirmMessage="Upload"
		:closeEnabled="!uploading || indexing"
		:confirmEnabled="canUpload"
		@confirm="upload"
		@close="$emit('close')"
	>
		<template #title>Upload new data to corpus <em>{{ corpus.displayName }}</em></template>

		<p>You may upload:</p>
		<ul>
			<li>Normal files to be indexed</li>
			<li><em>.zip</em> or <em>.tar.gz</em> archives containing multiple files at once.
				Archives should not contain files that cannot be indexed!
			</li>
			<li>External metadata files separately</li>
		</ul>

		<div style="padding: 10px 25px 0px;">
			<form v-if="!uploading">
				<label for="data[]" class="btn btn-info file-input-button document-upload-button">
					<span class="document-upload-button-text">{{ fileLabel }}</span>
					<input type="file" name="data[]" multiple @change="documentFiles = $event.target.files">
				</label>

				<label for="linkeddata[]" class="btn btn-default file-input-button document-upload-button">
					<span id="upload-metadata-label" class="document-upload-button-text">{{metadataFileLabel}}</span>
					<input type="file" name="linkeddata[]" multiple @change="metadataFiles = $event.target.files">
				</label>

				<small id="uploadFormatDescription" class="text-muted" style="display: block; margin: 12px 0px; width: 100%;">
					The corpus accepts the following files:<br>
					<template v-if="format">{{ format.description }}</template>
					<template v-else>Unknown format (it may have been deleted from the server), uploads might fail</template>
				</small>
			</form>

			<div class="progress" v-if="uploading">
				<div id="uploadProgress"
					:class="`progress-bar progress-bar-info progress-bar-striped ${indexing ? 'indexing' : ''}`"
					role="progressbar"
					aria-valuemin="0"
					aria-valuemax="100"
					:aria-valuenow="uploadProgress"
					:style="`width: ${uploadProgress}%;`"
				>{{indexing ? indexProgressMessage : uploadProgressMessage}}</div>
			</div>

			<div v-if="uploadError" class="alert alert-danger">{{ uploadError }}</div>
		</div>
	</Modal>
</template>
<script lang="ts">
import Vue from 'vue';
import Modal from '@/components/Modal.vue';
import { NormalizedFormat, NormalizedIndexBase } from '@/types/apptypes';
import * as Api from '@/api';


export default Vue.extend({
	components: {Modal},
	props: {
		corpus: Object as () => NormalizedIndexBase,
		formats: Array as () => NormalizedFormat[],
	},
	data: () => ({
		uploadProgress: 0,
		uploadProgressMessage: '',
		uploading: false,
		indexing: false,
		uploadError: '',

		documentFiles: undefined as FileList|undefined,
		metadataFiles: undefined as FileList|undefined,
	}),
	computed: {
		format(): NormalizedFormat | undefined {
			return this.formats.find(f => f.id === this.corpus.documentFormat);
		},
		fileLabel(): string {
			if (this.documentFiles?.length) {
				return this.documentFiles.length == 1 ? this.documentFiles[0].name : this.documentFiles.length + ' document file(s)';
			} else {
				return 'Select documents';
			}
		},
		metadataFileLabel(): string {
			if (this.metadataFiles?.length) {
				return this.metadataFiles.length == 1 ? this.metadataFiles[0].name : this.metadataFiles.length + ' linked file(s)';
			} else {
				return 'Select linked files';
			}
		},
		canUpload(): boolean {
			return !!this.documentFiles?.length && !this.uploading;
		},
		indexProgressMessage(): string|null {
			const corpus = this.corpus;
			if (corpus && corpus.status === 'indexing') {
				const {filesProcessed: files, docsDone: docs, tokensProcessed: tokens} = corpus.indexProgress!;
				return  `${files} files, ' ${docs} documents, and ${tokens} tokens indexed so far...`;
			}
			return null;
		}
	},
	methods: {
		upload() {
			const corpus = this.corpus;

			this.uploading = true;
			this.uploadError = '';
			this.uploadProgress = 0;
			this.uploadProgressMessage = 'Connecting...';

			// Uploads are a little annoying, the request "hangs" until indexing is complete.
			// So what we do, we start the upload, once the progress hits 100% we start polling the index status.
			// Then once the original request succeeds, we stop polling and show the success message.
			const {request, cancel} = Api.blacklab.postDocuments(
				corpus.id,
				Array.from(this.documentFiles || []),
				Array.from(this.metadataFiles || []),
				progress => this.handleUploadProgress(progress),
			);

			request.then(r => {
				// But if it does, close our model and pop a success message.
				// do one more refresh, sometimes the regular refresh actually happens _before_ the indexing begins
				this.$emit('indexing', this.corpus.id);
				this.$emit('success', 'Data added to ' + this.corpus.displayName);
				this.$emit('close');
			})
			.catch((e: Api.ApiError) => {
				const msg = e.message;
				this.uploadError = msg;
			})
			.finally(() => {
				this.uploading = false;
				this.indexing = false;

			})
		},
		handleUploadProgress(event: number): void {
			const progress = event;
			this.uploadProgressMessage = `Uploading... (${Math.floor(progress)}%)`;
			this.uploadProgress = progress;

			if (event === 100) {
				this.uploadProgress = 100;
				this.uploadProgressMessage = 'Upload complete, indexing...';
				this.indexing = true;
				this.$emit('indexing', this.corpus.id);
			}
		},
	},
})

</script>