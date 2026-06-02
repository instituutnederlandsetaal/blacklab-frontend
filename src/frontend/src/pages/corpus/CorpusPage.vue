<template>
	<div>
		<div v-if="loadingState.isLoading()" class="container main-content">
			<Spinner center />
			<h2>Please wait while we load the corpus...</h2>
		</div>
		<div v-else-if="loadingState.isError()" class="container main-content">
			<h2>{{ loadingState.error.title }}</h2>
			<p>{{ loadingState.error }}</p>
			<pre v-if="loadingState.error.stack">{{ loadingState.error.stack }}</pre>
			<button @click="loadingState.retry()" type="button" class="btn btn-primary">Retry</button>
		</div>
		<router-view v-else-if="loadingState.isLoaded() && loadingState.value.index" />
		<!-- <pre v-else class="container main-content">LoadingState is empty or doesn't have a corpus? {{ loadingState }}</pre> -->
	</div>
</template>

<script setup lang="ts">
import { useCurrentCorpusData } from '@/entities/corpus/model/corpus-context';
import { startLegacyCorpusStoreWiring } from '@/pages/corpus/effects/legacy-corpus-store-wiring.effect';

import Spinner from '@/shared/ui/Spinner.vue';

const loadingState = useCurrentCorpusData();
startLegacyCorpusStoreWiring();
</script>

<style lang="scss"></style>
