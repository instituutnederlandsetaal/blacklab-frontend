<template>
	<div>
		<Spinner v-if="content.isLoading()" />
		<div v-else-if="content.isError()">{{ content.error.message }}</div>
		<div v-else-if="content.isLoaded()" v-html="content.value"></div>
		<div v-else>Not applicable.</div>
	</div>
</template>

<script lang="ts">
import { Loadable } from '@/utils/loadable-streams';
import Spinner from './Spinner.vue';

export default {
	name: 'ServerRenderedContentPage',
	components: {Spinner},
	props: {
		content: Object as () => Loadable<string>
	},
};
</script>

<style scoped>
/* Add your styles here */
</style></div>