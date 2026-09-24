<template>
	<QueryForm />
	<QuerySummary v-if="resultsVisible" class="cf-panel cf-panel-lg container" id="summary" />
	<Debug v-if="resultsVisible" is="div" class="cf-panel cf-panel-lg container" style="background: #f5f5f5 !important; color: 333">
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
	<Results v-show="resultsVisible" id="results" class="container" />
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';

import { useActiveSearch } from '@/features/search/model/active-search';
import { usePageBootstrap } from '@/navigation/page-bootstrap';

import QueryForm from '@/pages/search/form/QueryForm.vue';
import QuerySummary from '@/pages/search/results/QuerySummary.vue';
import Results from '@/pages/search/results/Results.vue';

const activeSearch = useActiveSearch();
const activeSearchParameters = activeSearch.parameters;

const pageBootstrap = usePageBootstrap();
const resultsVisible = computed(() => activeSearch.view.value != null);

onMounted(() => pageBootstrap.markScriptsReady());
</script>
