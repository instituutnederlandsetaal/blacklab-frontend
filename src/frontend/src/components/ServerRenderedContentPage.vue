<template>
	<div>
		<Spinner v-if="loading" />
		<div v-else-if="content" v-html="content"></div>
		<div v-else-if="error">{{ error }}</div>
		<div v-else>Something should be shown here.</div>
	</div>
</template>

<script lang="ts">
import Spinner from './Spinner.vue';

export default {
	name: 'ServerRenderedContentPage',
	components: {Spinner},
	props: {
		loading: Boolean,
		content: String,
		error: String
	}
};
</script>

<style scoped>
/* Add your styles here */
</style></div>