<template>
	<div>
		<ServerRenderedComponent :loading="loading" :content="content"/>
	</div>
</template>

<script lang="ts">
import ServerRenderedComponent from '@/components/ServerRenderedContentPage.vue';
import { frontend } from '@/api';

export default {
	components: {
		ServerRenderedComponent
	},
	data() {
		return {
			loading: true,
			content: null as string|null,
			error: null as string|null,
		};
	},
	created() {
		frontend.getAbout(INDEX_ID).then(c => this.content = c, e => this.error = e).finally(() => this.loading = false);
	},
};
</script>

<style scoped>
/* Add your styles here */
</style>