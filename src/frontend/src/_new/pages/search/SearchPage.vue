<template>
	<div v-if="loadingState.isLoading()" class="container main-content">
		<Spinner center />
		<h2>Please wait while we load the corpus...</h2>
	</div>
	<div v-else-if="loadingState.isError()" class="container main-content">
		<!-- TODO requires login, forbidden states, retry -->
		<h2>{{ loadingState.error.title }}</h2>
		<p>{{ loadingState.error }}</p>
		<pre v-if="loadingState.error.stack">{{ loadingState.error.stack }}</pre>
		<button @click="loadingState.retry()" type="button" class="btn btn-primary">Retry</button>
	</div>
	<!-- <div :class="wideView.value ? 'container-fluid' : 'container'" v-if="loadingState.value?.index"> -->
	<QueryForm v-else-if="loadingState.isLoaded() && loadingState.value.index" @reset="reset" />
	<pre v-else>LoadingState is empty or doesn't have a corpus? {{ loadingState }}</pre>
	<!-- <QuerySummary v-if="resultsVisible" class="cf-panel cf-panel-lg" id="summary" /> -->

	<!-- <pre>{{ { resultsVisible } }}</pre> -->

	<!-- <Results v-show="resultsVisible" id="results"/> -->
	<!-- </div> -->
</template>

<script setup lang="ts">
import { useCurrentCorpusData } from '@/_new/app/plugins/installCorpusData';

import * as SearchStore from './search-store';

// import Results from '@/pages/search/results/Results.vue';
// import * as InterfaceStore from '@/features/search/model/form/interface-state';
import QueryForm from './form/ui/QueryForm.vue';
// import QuerySummary from '@/pages/search/results/QuerySummary.vue';
// import { wideView } from '@/pages/search/form/QueryFormSettings.vue';
import Spinner from '@/_new/shared/ui/Spinner.vue';

function reset() {
	SearchStore.actions.reset();
}

const loadingState = useCurrentCorpusData();
// const resultsVisible = computed(() => InterfaceStore.getState().viewedResults != null);
</script>

<style lang="scss"></style>
