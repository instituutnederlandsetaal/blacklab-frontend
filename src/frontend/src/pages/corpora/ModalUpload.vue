<template>
	<Modal confirmMessage="Upload" :closeEnabled="!uploading || indexing" :confirmEnabled="canUpload" @confirm="upload" @close="emit('close')">
		<template #title
			>Upload new data to corpus <em>{{ corpus.displayName }}</em></template
		>

		<p>You may upload:</p>
		<ul>
			<li>Normal files to be indexed</li>
			<li><em>.zip</em> or <em>.tar.gz</em> archives containing multiple files at once. Archives should not contain files that cannot be indexed!</li>
			<li>External metadata files separately</li>
		</ul>

		<div style="padding: 10px 25px 0px">
			<form v-if="!uploading">
				<label for="data[]" class="btn btn-info file-input-button document-upload-button">
					<span class="document-upload-button-text">{{ fileLabel }}</span>
					<input type="file" name="data[]" multiple @change="documentFiles = ($event.target as HTMLInputElement).files" />
				</label>

				<label for="linkeddata[]" class="btn btn-default file-input-button document-upload-button">
					<span id="upload-metadata-label" class="document-upload-button-text">{{ metadataFileLabel }}</span>
					<input type="file" name="linkeddata[]" multiple @change="metadataFiles = ($event.target as HTMLInputElement).files" />
				</label>

				<small id="uploadFormatDescription" class="text-muted" style="display: block; margin: 12px 0px; width: 100%">
					The corpus accepts the following files:<br />
					<template v-if="format">{{ format.description }}</template>
					<template v-else>Unknown format (it may have been deleted from the server), uploads might fail</template>
				</small>
			</form>

			<div class="progress" v-if="uploading">
				<div
					id="uploadProgress"
					:class="`progress-bar progress-bar-info progress-bar-striped ${indexing ? 'indexing' : ''}`"
					role="progressbar"
					aria-valuemin="0"
					aria-valuemax="100"
					:aria-valuenow="uploadProgress"
					:style="`width: ${uploadProgress}%;`"
				>
					{{ indexing ? indexProgressMessage : uploadProgressMessage }}
				</div>
			</div>

			<div v-if="uploadError" class="alert alert-danger">{{ uploadError }}</div>
		</div>
	</Modal>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';

import type { NormalizedFormat, NormalizedIndexBase } from '@/types/apptypes';

import { useBlackLabApi } from '@/shared/api';
import type { ApiError } from '@/shared/api/lib/api-types';

import Modal from '@/shared/ui/Modal.vue';

const props = defineProps<{ corpus: NormalizedIndexBase; formats: NormalizedFormat[] }>();
const emit = defineEmits<{ close: []; indexing: [corpusId: string]; success: [message: string] }>();
const blacklab = useBlackLabApi();

const uploadProgress = ref(0);
const uploadProgressMessage = ref('');
const uploading = ref(false);
const indexing = ref(false);
const uploadError = ref('');
const documentFiles = ref<FileList | null>(null);
const metadataFiles = ref<FileList | null>(null);

const format = computed(() => props.formats.find(value => value.id === props.corpus.documentFormat));
const fileLabel = computed(() =>
	documentFiles.value?.length ? (documentFiles.value.length === 1 ? documentFiles.value[0].name : documentFiles.value.length + ' document file(s)') : 'Select documents',
);
const metadataFileLabel = computed(() =>
	metadataFiles.value?.length ? (metadataFiles.value.length === 1 ? metadataFiles.value[0].name : metadataFiles.value.length + ' linked file(s)') : 'Select linked files',
);
const canUpload = computed(() => !!documentFiles.value?.length && !uploading.value);
const indexProgressMessage = computed(() => {
	const progress = props.corpus.status === 'indexing' ? props.corpus.indexProgress : null;
	return progress ? `${progress.filesProcessed} files, ${progress.docsDone} documents, and ${progress.tokensProcessed} tokens indexed so far...` : null;
});

function upload() {
	if (!canUpload.value) return;
	uploading.value = true;
	uploadError.value = '';
	uploadProgress.value = 0;
	uploadProgressMessage.value = 'Connecting...';

	// The upload request settles only after indexing completes. Poll from upload completion so progress remains visible in the meantime.
	blacklab
		.postDocuments(props.corpus.id, Array.from(documentFiles.value || []), Array.from(metadataFiles.value || []), handleUploadProgress)
		.then(
			() => {
				// Refresh once more because the first poll can run before indexing begins.
				emit('indexing', props.corpus.id);
				emit('success', 'Data added to ' + props.corpus.displayName);
				emit('close');
			},
			(error: ApiError) => (uploadError.value = error.message),
		)
		.finally(() => {
			uploading.value = false;
			indexing.value = false;
		});
}

function handleUploadProgress(progress: number) {
	uploadProgress.value = progress;
	uploadProgressMessage.value = `Uploading... (${Math.floor(progress)}%)`;
	if (progress === 100) {
		uploadProgressMessage.value = 'Upload complete, indexing...';
		indexing.value = true;
		emit('indexing', props.corpus.id);
	}
}
</script>

<style>
.document-upload-button {
	flex-shrink: 0;
	font-size: 24px;
	height: 100px;
	overflow: hidden;
	position: relative;
	width: 200px;
	white-space: normal;
}
.document-upload-button:before {
	content: '\f093';
	color: black;
	font: normal normal normal 14px/1 FontAwesome;
	font-size: 80px;
	left: 50%;
	opacity: 0.08;
	position: absolute;
	top: 50%;
	transform: translate(-50%, -50%);
}

.document-upload-button-text {
	/* one word per line*/
	color: inherit;
	display: table-caption;
	left: 50%;
	position: absolute;
	top: 50%;
	transform: translate(-50%, -50%);
	width: 100%;
	word-spacing: 9999em;
}

@keyframes grow {
	0% {
		width: 0%;
	}
	100% {
		width: 95%;
	}
}

#uploadProgress {
	white-space: nowrap;
	padding-left: 6px;
}

#uploadProgress.indexing {
	animation: 40s grow;
	width: 95%; /* stay wide at end of animation */
	-webkit-transition-timing-function: cubic-bezier(0.05, 0.895, 0, 0.995);
	-moz-transition-timing-function: cubic-bezier(0.05, 0.895, 0, 0.995);
	-o-transition-timing-function: cubic-bezier(0.05, 0.895, 0, 0.995);
	transition-timing-function: cubic-bezier(0.05, 0.895, 0, 0.995);
}
</style>
