<template>
	<Modal confirmMessage="Save" @confirm="save" @close="$emit('close')" :confirmEnabled="!loading">
		<template #title>Sharing options for corpus <em>{{ corpus.displayName }}</em></template>
		<template #header><small class="text-muted">One username per line</small></template>

		<textarea v-model="content" style="width:100%; height: 400px; resize: vertical;" class="form-control"></textarea>

		<div v-if="error" class="alert alert-danger">
			<a href="#" class="close" aria-label="close" @click="error = ''">×</a>
			{{ error }}
		</div>
	</Modal>
</template>

<script lang="ts">
import {defineComponent} from 'vue';
import Modal from './Modal.vue';
import type { NormalizedIndexBase } from '@/types/apptypes';
import * as Api from '@/services/api';
export default defineComponent({
	components: {Modal},
	props: {
		corpus: { type: Object as () => NormalizedIndexBase, required: true },
	},
	data: () => ({
		content: '',
		loading: false,
		error: ''
	}),
	methods: {
		save() {
			this.loading = true;
			Api.blacklab.postShares(this.corpus.id, this.content.split('\n'))
			.then(r => {
				this.$emit('success', r.status.message)
				this.$emit('close');
			})
			.catch((e: Api.ApiError) => this.error = `Could not save shares for corpus "${this.corpus.displayName}": ${e.message}`)
			.finally(() => this.loading = false);
		}
	},
	created() {
		this.loading = true;
		Api.blacklab.getShares(this.corpus.id)
		.then(shares => this.content = shares.join('\n'))
		.catch((e: Api.ApiError) => this.error = `Could not retrieve share list for corpus "${this.corpus.displayName}": ${e.message}`)
		.finally(() => this.loading = false);
	}
});
</script>