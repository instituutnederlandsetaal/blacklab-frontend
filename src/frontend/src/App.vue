<template>
	<div>
		<PageMetaUpdater/>
		<Navbar/>

		<!-- <pre>{{ storeLoadingState }}</pre> -->
		<div v-if="storeLoadingState.isLoading()" class="container main-content">
			<Spinner center/>
			<h2>Please wait while we load the corpus...</h2>
		</div>
		<div v-else-if="storeLoadingState.isError()" class="container main-content">
			<!-- TODO requires login, forbidden states, retry -->
			<h2>{{ storeLoadingState.error.title }}</h2>
			<p>{{ storeLoadingState.error }}</p>
			<pre v-if="storeLoadingState.error.stack">{{ storeLoadingState.error.stack }}</pre>
		</div>
		<router-view v-else class="container main-content"/>

		<footer class="container" style="padding: 20px; border-top: 1px solid rgba(0,0,0,0.1)">
			Dutch Language Institute Corpus Search Interface v1.3 &copy; <a href="https://www.ivdnt.org/">INT</a> 2013-{{ new Date().getFullYear() }}
		</footer>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import {i18n} from '@/utils/i18n';
import {store, get} from '@/store';
import router from '@/router';

import Spinner from '@/components/Spinner.vue';
import Navbar from '@/components/Navbar.vue';
import PageMetaUpdater from '@/PageMetaUpdater.vue';

export default Vue.extend({
	components: {Spinner, Navbar, PageMetaUpdater},
	router,
	i18n,
	store,
	data: () => ({
		storeLoadingState: get.loadingState(),
	})
})

alert('todo version');
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