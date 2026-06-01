<template>
	<SearchForm @page-bootstrapped="emit('page-bootstrapped')" @page-url-parsed="emit('page-url-parsed')" />
</template>

<script setup lang="ts">
// import Results from '@/pages/search/results/Results.vue';
// import * as InterfaceStore from '@/features/search/model/form/interface-state';
import SearchForm from './form/ui/SearchForm.vue';
// import QuerySummary from '@/pages/search/results/QuerySummary.vue';
// import { wideView } from '@/pages/search/form/QueryFormSettings.vue';

const emit = defineEmits<{
	'page-bootstrapped': [];
	'page-url-parsed': [];
}>();
// const resultsVisible = computed(() => InterfaceStore.getState().viewedResults != null);
</script>

<style lang="scss"></style>
