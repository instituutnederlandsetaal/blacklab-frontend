<template>
	<div class="container">
		<div v-if="storeLoadingState.isLoading()">
			<Spinner center/>
			<h2>Please wait while we load the corpus...</h2>
		</div>
		<div v-else-if="storeLoadingState.isError()">
			<!-- TODO requires login, forbidden states, retry -->
			<h2>{{ storeLoadingState.error.title }}</h2>
			<p>{{ storeLoadingState.error }}</p>
			<pre v-if="storeLoadingState.error.stack">{{ storeLoadingState.error.stack }}</pre>
		</div>
		<div v-else-if="corpus.isEmpty()">
			<h2>Strange... there should be a corpus here, but there isn't...</h2>
			<p>Please report this so we can fix it.</p>
		</div>

		<template v-else>
			<QueryForm/>
			<QuerySummary v-if="resultsVisible" class="cf-panel cf-panel-lg" id="summary"/>
			<Debug v-if="resultsVisible">
				<div style="margin: 0 -15px; margin-bottom: 40px;">
					<div>{{ $t('searchPage.fullQuery') }}: </div>
					<pre><template v-for="(v, k) in debugQuery"><template v-if="v != null && v !== ''">{{k}}: {{ v }}<br></template></template></pre>
				</div>
			</Debug>

			<Results v-show="resultsVisible" id="results"/>

			<PageGuide v-if="pageGuideEnabled"/>
		</template>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import * as RootStore from '@/store';
import * as InterfaceStore from '@/store/form/interface';
import * as UIStore from '@/store/ui';
import * as CorpusStore from '@/store/corpus';

import QueryForm from '@/pages/search/form/QueryForm.vue';
import QuerySummary from '@/pages/search/results/QuerySummary.vue';
import Results from '@/pages/search/results/Results.vue';
import PageGuide from '@/pages/search/PageGuide.vue';
import Spinner from '@/components/Spinner.vue';

export default Vue.extend({
	components: {
		QueryForm,
		QuerySummary,
		Results,
		PageGuide,
		Spinner
	},
	computed: {
		storeLoadingState() { return RootStore.get.loadingState(); },
		corpus() { return CorpusStore.getState(); },
		resultsVisible(): boolean { return InterfaceStore.getState().viewedResults != null; },
		pageGuideEnabled(): boolean { return UIStore.getState().global.pageGuide.enabled; },
		debugQuery: RootStore.get.blacklabParameters
	},
});
</script>

<style lang="scss">

</style>
