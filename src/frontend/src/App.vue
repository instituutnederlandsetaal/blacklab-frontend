<template>
	<div class="container">
		<PageMetaUpdater/>
		<Navbar/>


		<!-- <pre>{{ storeLoadingState }}</pre> -->
		<div v-if="storeLoadingState.isLoading()">
			<Spinner center/>
			<h2>Please wait while we load the corpus...</h2>
		</div>
		<div v-else-if="storeLoadingState.isError()">
			<!-- TODO requires login, forbidden states, retry -->
			<h2>{{ storeLoadingState.error.title }}</h2>
			<p>{{ storeLoadingState.error }}</p>
			<pre v-if="storeLoadingState.error.stack">{{ storeLoadingState.error.stack }}</pre>
		</div>
		<router-view v-else/>

		<footer class="row">
			<hr>
			<p class="col-xs-12">Dutch Language Institute Corpus Search Interface v1.3 &copy; <a href="https://www.ivdnt.org/">INT</a> 2013-{{ new Date().getFullYear() }} </p>
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
</script>

<style lang="scss">

</style>