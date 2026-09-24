<template>
	<div>
		<div v-if="loadingState.isLoading()" class="container main-content">
			<Spinner center />
			<h2>{{ $t('corpus.loading') }}</h2>
		</div>
		<div v-else-if="errorPresentation" class="container main-content">
			<h2>{{ errorPresentation.title }}</h2>
			<p>{{ errorPresentation.message }}</p>
			<p v-if="loadingState.error?.httpCode === 404"><router-link :to="{ name: 'corpora' }">Browse corpora</router-link></p>
			<button @click="loadingState.retry()" type="button" class="btn btn-primary">Retry</button>
		</div>
		<div v-else-if="loadingState.isLoaded() && !loadingState.value.index" class="container main-content">
			<h2>Corpus not found</h2>
			<p>The requested corpus is unavailable.</p>
			<router-link :to="{ name: 'corpora' }">Browse corpora</router-link>
		</div>
		<router-view v-else-if="loadingState.isLoaded() && loadingState.value.index" />
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useCorpusContextLoader } from '@/app/state/useCorpusContext';

import Spinner from '@/shared/ui/Spinner.vue';

const loadingState = useCorpusContextLoader();
const errorPresentation = computed(() => {
	if (!loadingState.isError()) return null;
	const error = loadingState.error;
	if (error.httpCode === 401) return { title: 'Sign in required', message: 'You need to be logged in to access this corpus.' };
	if (error.httpCode === 403) return { title: 'Access denied', message: 'You do not have permission to access this corpus.' };
	if (error.httpCode === 404 && (error.title === 'CANNOT_OPEN_INDEX' || error.message.includes('CANNOT_OPEN_INDEX')))
		return { title: 'Corpus not found', message: 'The requested corpus was not found. Please check the spelling.' };
	if (error.httpCode === 404) return { title: 'Could not load corpus', message: 'The server could not find a required resource for this corpus.' };
	return { title: 'Could not load corpus', message: error.message };
});
</script>

<style lang="scss"></style>
