<template>
	<div class="container">
		Main App
		{{ storeLoadingState }}
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
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import {i18n} from '@/utils/i18n';
import {store, get} from '@/store';
import router from '@/router';

import Spinner from '@/components/Spinner.vue';

export default Vue.extend({
	components: {Spinner},
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