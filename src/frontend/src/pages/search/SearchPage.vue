<template>
	<!-- <div :class="wideView.value ? 'container-fluid' : 'container'"> -->
	<QueryForm />
	<QuerySummary v-if="resultsVisible" class="cf-panel cf-panel-lg" id="summary" />

	<Results v-show="resultsVisible" id="results" />
	<!-- </div> -->
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import * as RootStore from '@/app/state/root-store';
import * as InterfaceStore from '@/features/search/model/form/interface-state';

import QueryForm from '@/pages/search/form/QueryForm.vue';
import { wideView } from '@/pages/search/form/QueryFormSettings.vue';
import QuerySummary from '@/pages/search/results/QuerySummary.vue';
import Results from '@/pages/search/results/Results.vue';
import Spinner from '@/shared/ui/Spinner.vue';

export default defineComponent({
	components: {
		QueryForm,
		QuerySummary,
		Results,
		Spinner,
	},
	data: () => ({
		wideView,
	}),
	computed: {
		resultsVisible(): boolean {
			return InterfaceStore.getState().viewedResults != null;
		},
		debugQuery: RootStore.get.blacklabParameters,
	},
});
</script>

<style lang="scss"></style>
