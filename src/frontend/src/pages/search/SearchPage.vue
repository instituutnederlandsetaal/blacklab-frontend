<template>

	<div class="container">
		<template v-if="loadingState === 'loaded'">
			<QueryForm/>
			<QuerySummary v-if="resultsVisible" class="cf-panel cf-panel-lg" id="summary"/>
			<Debug v-if="resultsVisible" style="margin: 0 -15px; margin-bottom: 40px;">
				<div>
					<div>{{ $t('searchPage.fullQuery') }}: </div>
					<pre><template v-for="(v, k) in debugQuery"><template v-if="v != null && v !== ''">{{k}}: {{ v }}<br></template></template></pre>
				</div>
			</Debug>

			<Results v-show="resultsVisible" id="results"/>

			<PageGuide v-if="pageGuideEnabled"/>
		</template>
		<div v-else>
			<h2>
				<span v-if="loadingState !== 'loading'" class="fa fa-danger fa-4x"></span>
				{{ loadingMessage }}
			</h2>
			<Spinner v-if="loadingState === 'loading'" center/>
			<button v-else-if="loadingState === 'requiresLogin'" type="button" class="btn btn-lg btn-primary">login (todo)</button>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import * as InterfaceStore from '@/store/search/form/interface';
import * as UIStore from '@/store/search/ui';
import * as RootStore from '@/store/search/';

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
		loadingState() { return RootStore.get.status().status; },
		loadingMessage() { return RootStore.get.status().message; },

		resultsVisible(): boolean { return InterfaceStore.getState().viewedResults != null; },
		pageGuideEnabled(): boolean { return UIStore.getState().global.pageGuide.enabled; },
		debugQuery: RootStore.get.blacklabParameters
	},
});
</script>

<style lang="scss">

</style>
