<template>
	<Modal title="Create new Corpus" @close="emit('close')" @confirm="createCorpus" closeMessage="Cancel">
		<div v-if="errorMessage" class="alert alert-danger">
			<a href="#" class="close" aria-label="close" @click="errorMessage = ''">×</a>
			{{ errorMessage }}
		</div>

		<div class="container-fluid">
			<div class="form-group">
				<label style="width: 100%">Corpus Name <input id="corpus_name" maxlength="80" class="form-control" v-model="corpusName" placeholder="Corpus name" /></label>
			</div>
			<div class="form-group">
				<label for="corpus_document_type" title="The format of the documents that will be stored in the corpus">Document Format</label>
				<br />
				<SelectPicker
					id="corpus_document_type"
					hideEmpty
					allowHtml
					placeholder="Select a document format..."
					container="body"
					data-menu-width="auto"
					data-width="100%"
					:loading="loading"
					:options="formatOptions"
					v-model="documentType"
				/>
				<small v-if="selectedFormat" class="text-muted" style="display: block; padding: 8px 8px 0px">{{ selectedFormat.description }}</small>
				<small v-if="selectedFormat && selectedFormat.helpUrl" style="display: block; padding: 8px 8px 0px"><a target="_blank" :href="selectedFormat.helpUrl">More information</a></small>
			</div>
		</div>
	</Modal>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';

import type { NormalizedFormat } from '@/types/apptypes';
import type { BLUser } from '@/types/blacklabtypes';

import { useBlackLabApi } from '@/shared/api';
import type { ApiError } from '@/shared/api/lib/api-types';
import type { Options } from '@/shared/utils/options';

import Modal from '@/shared/ui/Modal.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

const props = defineProps<{
	publicFormats: NormalizedFormat[];
	privateFormats: NormalizedFormat[];
	loading: boolean;
	user: BLUser;
}>();
const emit = defineEmits<{
	close: [];
	create: [];
	error: [message: string];
	success: [message: string];
}>();

const blacklab = useBlackLabApi();
const corpusName = ref('');
const documentType = ref('');
const errorMessage = ref('');
const selectedFormat = computed(() => props.publicFormats.find(f => f.id === documentType.value) || props.privateFormats.find(f => f.id === documentType.value));
const formatOptions = computed<Options>(() => [
	{ label: 'Custom', options: props.privateFormats.map(f => ({ value: f.id, label: `${f.displayName} <small class="text-muted">${f.id}</small>` })) },
	{ label: 'Public', options: props.publicFormats.map(f => ({ value: f.id, label: `${f.displayName} <small class="text-muted">${f.id}</small>` })) },
]);

function createCorpus() {
	if (!corpusName.value) return (errorMessage.value = 'Please enter a name for the corpus.');
	if (!documentType.value) return (errorMessage.value = 'Please select a document format.');
	if (!props.user.loggedIn || !props.user.id) {
		console.error('user not logged in - cannot create corpus (!?)');
		return;
	}

	// Prefix the user name because it's a private index
	const indexName = props.user.id + ':' + corpusName.value.replace(/[\s\\/:]+/g, '_');
	const displayName = corpusName.value;

	blacklab
		.postCorpus(indexName, displayName, documentType.value)
		.then(() => {
			emit('create');
			emit('success', `Corpus "${displayName}" created.`);
		})
		.catch((e: ApiError) => emit('error', `Could not create corpus "${displayName}": ${e.message}`))
		.finally(() => emit('close'));
}
</script>
