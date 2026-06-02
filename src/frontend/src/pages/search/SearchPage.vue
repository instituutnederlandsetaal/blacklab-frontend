<template>
	<SearchForm @url-parsed="onUrlParsed" />
</template>

<script setup lang="ts">
// import Results from '@/pages/search/results/Results.vue';
// import * as InterfaceStore from '@/features/search/model/form/interface-state';
// import { useRouteBootstrap } from '@/app/providers/providePageBootstrapState.ts';

import { useRouteBootstrap } from '@/app/providers/providePageBootstrapState.ts';

import SearchForm from './form/ui/SearchForm.vue';
// import QuerySummary from '@/pages/search/results/QuerySummary.vue';
// import { wideView } from '@/pages/search/form/QueryFormSettings.vue';

const bootstrap = useRouteBootstrap();

function onUrlParsed() {
	bootstrap.markPageUrlParsed();
	bootstrap.markPageBootstrapped();
}

// const resultsVisible = computed(() => InterfaceStore.getState().viewedResults != null);
</script>

<style lang="scss"></style>
