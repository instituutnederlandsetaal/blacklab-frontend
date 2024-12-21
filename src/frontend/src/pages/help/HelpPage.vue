<template>
	<ServerRenderedComponent :loading="loading" :content="content"/>
</template>

<script lang="ts">
import Vue from 'vue';
import ServerRenderedComponent from '@/components/ServerRenderedContentPage.vue';
import { frontend } from '@/api';

export default Vue.extend({
	components: {
		ServerRenderedComponent
	},
	data: () => ({
		loading: true as boolean,
		content: null as string|null,
		error: null as string|null,
	}),
	created() {
		frontend.getHelp(INDEX_ID).promise.then(c => this.content = c, e => this.error = e).finally(() => this.loading = false);
	},
});
</script>

<style scoped>
/* Add your styles here */
</style>