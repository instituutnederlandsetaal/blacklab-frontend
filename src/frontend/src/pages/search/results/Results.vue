<template>
	<div>
		<div v-if="['search', 'explore'].includes(activeForm)">
			<ul id="resultTabs" class="nav nav-tabs cf-panel-tab-header cf-panel-lg">
				<li v-for="v in customViews" :class="[{'active': viewedResults === v.id}]" :title="v.title"><a href="javascript:void(0);" @click="showView(v.id)">{{v.label || v.title || v.id}}</a></li>
			</ul>

			<div class="tab-content cf-panel-tab-body cf-panel-lg" style="padding-top: 0px;">
				<component v-for="v in customViews" :is="v.component" :key="v.id" v-show="viewedResults === v.id"
					:id="v.id"
					:active="viewedResults === v.id"
					:store="storeFor(v.id)"
				></component>
			</div>
		</div>
		<div v-else>
			<div class="tab-content cf-panel-tab-body cf-panel-lg" style="padding-top: 0px;">
				<ResultsView
					:id="activeForm"
					:label="activeForm+'Tab'"
					:active="true"
					:store="storeFor(activeForm)"
				></ResultsView>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import ResultsView from '@/pages/search/results/ResultsView.vue';

import * as InterfaceStore from '@/store/search/form/interface';
import * as UIStore from '@/store/search/ui';
import * as ViewStore from '@/store/search/results/views';

export default Vue.extend({
	components: {
		ResultsView,
	},
	methods: {
		showView(id: string) {
			InterfaceStore.actions.viewedResults(id);
		},
		storeFor(id: string) {
			return ViewStore.getOrCreateModule(id);
		}
	},
	computed: {
		viewedResults: InterfaceStore.get.viewedResults,
		customViews(): UIStore.CustomView[] {
			return UIStore.getState().results.customViews;
		},
		activeForm: InterfaceStore.get.form
	}
});
</script>

<style lang="scss" scoped>
</style>