<template>
	<div>
		<Navbar />
		<!-- <pre style="overflow: auto; width: 100%; max-height: 20vh">{{ completeStoreState }}</pre> -->

		<!-- <pre>{{ storeLoadingState }}</pre> -->
		<div v-if="storeLoadingState.isLoading()" class="container main-content">
			<Spinner center />
			<h2>Please wait while we load the corpus...</h2>
		</div>
		<div v-else-if="storeLoadingState.isError()" class="container main-content">
			<!-- TODO requires login, forbidden states, retry -->
			<h2>{{ storeLoadingState.error.title }}</h2>
			<p>{{ storeLoadingState.error }}</p>
			<pre v-if="storeLoadingState.error.stack">{{ storeLoadingState.error.stack }}</pre>
		</div>
		<router-view v-else class="container main-content" />

		<footer class="container" style="padding: 20px; border-top: 1px solid rgba(0, 0, 0, 0.1)">
			Dutch Language Institute Corpus Search Interface v1.3 &copy; <a href="https://www.ivdnt.org/">INT</a> 2013-{{ new Date().getFullYear() }}
		</footer>
	</div>
</template>

<script setup lang="ts">
import * as RootStore from '@/app/state/root-store';

import Navbar from '@/components/Navbar.vue';
import Spinner from '@/components/Spinner.vue';

const storeLoadingState = RootStore.get.loadingState();
</script>

<style lang="scss">
body {
	min-height: 100vh;
	display: flex;
	flex-direction: column;
	> div {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		> .main-content {
			flex-grow: 1;
		}
	}
}
</style>
