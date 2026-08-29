<template>
	<Modal confirmMessage="Save" :confirmEnabled="ready && !loading" @confirm="save" @close="emit('close')">
		<template #title
			>Sharing options for corpus <em>{{ corpus.displayName }}</em></template
		>
		<template #header><small class="text-muted">One username per line</small></template>

		<textarea v-model="content" style="width: 100%; height: 400px; resize: vertical" class="form-control"></textarea>

		<div v-if="error" class="alert alert-danger">
			<a href="#" class="close" aria-label="close" @click="error = ''">×</a>
			{{ error }}
		</div>
	</Modal>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';

import type { NormalizedIndexBase } from '@/types/apptypes';

import { useBlackLabApi } from '@/shared/api';
import type { ApiError } from '@/shared/api/lib/api-types';

import Modal from '@/shared/ui/Modal.vue';

const { corpus } = defineProps<{ corpus: NormalizedIndexBase }>();
const emit = defineEmits<{ close: []; success: [message: string] }>();
const blacklab = useBlackLabApi();
const content = ref('');
const error = ref('');
const loading = ref(true);
const ready = ref(false);

const loadRequest = blacklab.getShares(corpus.id);
loadRequest
	.then(shares => {
		content.value = shares.join('\n');
		ready.value = true;
	})
	.catch((e: ApiError) => (error.value = `Could not retrieve share list for corpus "${corpus.displayName}": ${e.message}`))
	.finally(() => (loading.value = false));
onBeforeUnmount(loadRequest.cancel);

function save() {
	if (!ready.value || loading.value) return;
	loading.value = true;
	blacklab
		.postShares(corpus.id, content.value.split('\n'))
		.then(r => {
			emit('success', r.status.message);
			emit('close');
		})
		.catch((e: ApiError) => (error.value = `Could not save shares for corpus "${corpus.displayName}": ${e.message}`))
		.finally(() => (loading.value = false));
}
</script>
