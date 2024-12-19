<template>
	<div>
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
</template>

<script lang="ts">
import Vue from 'vue';

import ResultsView from '@/pages/search/results/ResultsView.vue';

import * as InterfaceStore from '@/store/form/interface';
import * as UIStore from '@/store/ui';
import * as ViewStore from '@/store/results/views';

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
		}
	}
});
</script>

<style lang="scss" scoped>
</style>