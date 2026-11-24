<template>
	<QueryForm />
	<QuerySummary v-if="resultsVisible" class="cf-panel cf-panel-lg" :class="containerClass" id="summary" />
	<Debug v-if="resultsVisible" is="div" class="cf-panel cf-panel-lg" :class="containerClass" style="background: #f5f5f5 !important; color: 333">
		Full query:
		<table class="table" style="margin: 0; table-layout: auto">
			<template v-for="(v, k) in activeSearchParameters">
				<tr v-if="v != undefined && v != ''">
					<th>{{ k }}</th>
					<td style="white-space: pre">{{ v }}</td>
				</tr>
			</template>
		</table>
	</Debug>
	<Results v-show="resultsVisible" id="results" :class="containerClass" />
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';

import { useLayout } from '@/app/state/layout';
import { useResultsState } from '@/features/search/model/results/results-state';
import { usePageBootstrap } from '@/navigation/page-bootstrap';

import QueryForm from '@/pages/search/form/QueryForm.vue';
import QuerySummary from '@/pages/search/results/QuerySummary.vue';
import Results from '@/pages/search/results/Results.vue';

const { containerClass } = useLayout();

const resultState = useResultsState();
const { parameters: activeSearchParameters } = resultState;

const pageBootstrap = usePageBootstrap();
const resultsVisible = computed(() => resultState.selectedViewName != null);

onMounted(() => pageBootstrap.markScriptsReady());
</script>
