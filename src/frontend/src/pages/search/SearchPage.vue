<template>
	<QueryForm @reset="reset" />
</template>

<script setup lang="ts">
import { startSearchStoreWiring } from '@/pages/search/effects/search-store-wiring.effect';

import * as SearchStore from './search-store';

// import Results from '@/pages/search/results/Results.vue';
// import * as InterfaceStore from '@/features/search/model/form/interface-state';
import QueryForm from './form/ui/QueryForm.vue';
// import QuerySummary from '@/pages/search/results/QuerySummary.vue';
// import { wideView } from '@/pages/search/form/QueryFormSettings.vue';

function reset() {
	SearchStore.actions.reset();
}

startSearchStoreWiring();
// const resultsVisible = computed(() => InterfaceStore.getState().viewedResults != null);
</script>

<style lang="scss"></style>
