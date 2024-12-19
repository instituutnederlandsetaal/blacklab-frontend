<template>
	<div>
		<ServerRenderedComponent :loading="loading" :content="content"/>
	</div>
</template>

<script>
import ServerRenderedComponent from '@/components/ServerRenderedContentPage.vue';

export default {
	components: {
		ServerRenderedComponent
	},
	data() {
		return {
			loading: true,
			content: null
		};
	},
	created() {
		this.fetchContent();
	},
	methods: {
		fetchContent() {
			const cachedContent = localStorage.getItem('cachedContent');
			if (cachedContent) {
				this.content = JSON.parse(cachedContent);
				this.loading = false;
			} else {
				// Simulate an API call
				setTimeout(() => {
					this.content = 'This is the server-rendered content';
					localStorage.setItem('cachedContent', JSON.stringify(this.content));
					this.loading = false;
				}, 2000);
			}
		}
	}
};
</script>

<style scoped>
/* Add your styles here */
</style>