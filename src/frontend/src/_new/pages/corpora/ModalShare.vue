<template>
	<Modal confirmMessage="Save" @confirm="save" @close="$emit('close')" :confirmEnabled="!loading">
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

<script lang="ts">
import { type PropType, defineComponent } from 'vue';

import { useBlackLabApi } from '@/_new/app/plugins/installApi';
import type { NormalizedIndexBase } from '@/_new/types/apptypes';

import type { ApiError } from '@/_new/shared/api/lib/api-types';

import Modal from '@/_new/shared/ui/Modal.vue';

export default defineComponent({
	components: { Modal },
	props: {
		corpus: { type: Object as PropType<NormalizedIndexBase>, required: true },
	},
	data: () => ({
		content: '',
		loading: false,
		error: '',
		blacklab: useBlackLabApi(),
	}),
	methods: {
		save() {
			this.loading = true;
			this.blacklab
				.postShares(this.corpus.id, this.content.split('\n'))
				.then(r => {
					this.$emit('success', r.status.message);
					this.$emit('close');
				})
				.catch((e: ApiError) => (this.error = `Could not save shares for corpus "${this.corpus.displayName}": ${e.message}`))
				.finally(() => (this.loading = false));
		},
	},
	created() {
		this.loading = true;
		useBlackLabApi()
			.getShares(this.corpus.id)
			.then(shares => (this.content = shares.join('\n')))
			.catch((e: ApiError) => (this.error = `Could not retrieve share list for corpus "${this.corpus.displayName}": ${e.message}`))
			.finally(() => (this.loading = false));
	},
});
</script>
