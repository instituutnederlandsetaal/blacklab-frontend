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
	</div>
</template>

<script setup lang="ts">
import { useCorpusContextLoader } from '@/app/state/useCorpusContext';

import Spinner from '@/shared/ui/Spinner.vue';

const loadingState = useCorpusContextLoader();
</script>

<style lang="scss"></style>
