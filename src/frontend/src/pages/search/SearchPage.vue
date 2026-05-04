<template>
	<div v-if="loadingState.isLoading()" class="container main-content">
		<Spinner center/>
		<h2>Please wait while we load the corpus...</h2>
	</div>
	<div v-else-if="loadingState.isError()" class="container main-content">
		<!-- TODO requires login, forbidden states, retry -->
		<h2>{{ loadingState.error.title }}</h2>
		<p>{{ loadingState.error }}</p>
		<pre v-if="loadingState.error.stack">{{ loadingState.error.stack }}</pre>
	</div>
	<div :class="wideView.value ? 'container-fluid' : 'container'" v-if="loadingState.value?.index">
		<QueryForm/>
		<QuerySummary v-if="resultsVisible" class="cf-panel cf-panel-lg" id="summary"/>
		<!-- <Debug v-if="resultsVisible">
			<div style="margin: 0 -15px; margin-bottom: 40px;">
				<div>{{ $t('searchPage.fullQuery') }}: </div>
				<pre><template v-for="(v, k) in debugQuery"><template v-if="v != null && v !== ''">{{k}}: {{ v }}<br></template></template></pre>
			</div>
		</Debug> -->
		<pre>{{ {resultsVisible} }}</pre>

		<Results v-show="resultsVisible" id="results"/>
	</div>
</template>

<script setup lang="ts">
import * as InterfaceStore from '@/features/search/model/form/interface-state';

import Spinner from '@/components/Spinner.vue';
import QueryForm from '@/pages/search/form/QueryForm.vue';
import QuerySummary from '@/pages/search/results/QuerySummary.vue';
import Results from '@/pages/search/results/Results.vue';

import { useCurrentCorpusData } from '@/_new/app/plugins/installCorpusData';
import { wideView } from '@/pages/search/form/QueryFormSettings.vue';
import { computed } from 'vue';

const loadingState = useCurrentCorpusData();
const resultsVisible = computed(() => InterfaceStore.getState().viewedResults != null);
</script>

<style lang="scss">

</style>
