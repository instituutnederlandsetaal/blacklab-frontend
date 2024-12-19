<template>
	<div>
		<Spinner v-if="loading" />
		<div v-else v-html="content"></div>
	</div>
</template>

<script>
import Spinner from './Spinner.vue';

export default {
	name: 'ServerRenderedContentPage',
	components: {
		Spinner
	},
	props: {
		loading: {
			type: Boolean,
			required: true
		},
		content: {
			type: String,
			required: true
		}
	}
};
</script>

<style scoped>
/* Add your styles here */
</style></div>