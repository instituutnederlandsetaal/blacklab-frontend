<template>
	<div>
		<Spinner v-if="content.isLoading()" />
		<div v-else-if="content.isError()">{{ content.error.message }}</div>
		<div v-else-if="content.isLoaded()" v-html="content.value"></div>
		<div v-else>Not applicable.</div>
	</div>
</template>

<script lang="ts">
import type { Loadable } from '@/utils/loadable/loadable-streams';
import type { PropType } from 'vue';
import { defineComponent } from 'vue';
import Spinner from './Spinner.vue';

export default defineComponent({
	name: 'ServerRenderedContentPage',
	components: {Spinner},
	props: {
		content: { type: Object as PropType<Loadable<string>>, required: true }
	},
});
</script>

<style scoped>
/* Add your styles here */
</style>