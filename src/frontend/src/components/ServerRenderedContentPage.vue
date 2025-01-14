<template>
	<div>
		<Spinner v-if="isLoading(content)" />
		<div v-else-if="isError(content)">{{ content.error.message }}</div>
		<div v-else-if="isLoaded(content)" v-html="content.value"></div>
		<div v-else>Not applicable.</div>
	</div>
</template>

<script lang="ts">
import { isError, isLoaded, isLoading, Loadable } from '@/utils/loadable-streams';
import Spinner from './Spinner.vue';

export default {
	name: 'ServerRenderedContentPage',
	components: {Spinner},
	props: {
		content: Object as () => Loadable<string>
	},
	methods: {isLoading, isError, isLoaded},
};
</script>

<style scoped>
/* Add your styles here */
</style></div>