<template>
	<QueryForm />
	<QuerySummary v-if="resultsVisible" class="cf-panel cf-panel-lg container" id="summary" />
	<Debug v-if="resultsVisible" is="div" class="cf-panel cf-panel-lg container" style="background: #f5f5f5 !important; color: 333">
		Full query:
		<table class="table" style="margin: 0; table-layout: auto">
			<template v-for="(v, k) in debugQuery">
				<tr v-if="v != undefined && v != ''">
					<th>{{ k }}</th>
					<td style="white-space: pre">{{ v }}</td>
				</tr>
			</template>
		</table>
	</Debug>
	<Results v-show="resultsVisible" id="results" class="container" />
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import * as RootStore from '@/app/state/root-store';
import * as InterfaceStore from '@/features/search/model/form/interface-state';

import QueryForm from '@/pages/search/form/QueryForm.vue';
import QuerySummary from '@/pages/search/results/QuerySummary.vue';
import Results from '@/pages/search/results/Results.vue';

export default defineComponent({
	components: {
		QueryForm,
		QuerySummary,
		Results,
	},
	computed: {
		resultsVisible(): boolean {
			return InterfaceStore.getState().viewedResults != null;
		},
		debugQuery: RootStore.get.blacklabParameters,
	},
});
</script>
