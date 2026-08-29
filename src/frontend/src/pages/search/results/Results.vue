<template>
	<div>
		<ul id="resultTabs" class="nav nav-tabs cf-panel-tab-header cf-panel-lg">
			<li v-for="v in customViews" :class="[{ active: viewedResults === v.id }]" :title="v.title">
				<a href="javascript:void(0);" @click="InterfaceStore.actions.viewedResults(v.id)">{{ v.label || v.title || v.id }}</a>
			</li>
		</ul>

		<div class="tab-content cf-panel-tab-body cf-panel-lg" style="padding-top: 0px">
			<component
				v-for="v in customViews"
				:is="v.component"
				:key="v.id"
				v-show="viewedResults === v.id"
				:id="v.id"
				:active="viewedResults === v.id"
				:store="ViewStore.getOrCreateModule(v.id)"
			></component>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useCustomizations, type ResultView } from '@/customization-api/internal/internal-api';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as ViewStore from '@/features/search/model/results/view-state';

import ResultsView from '@/pages/search/results/ResultsView.vue';

defineOptions({
	components: {
		ResultsView,
	},
});

const customizations = useCustomizations();
const viewedResults = computed(InterfaceStore.get.viewedResults);
const customViews = computed<ResultView[]>(customizations.resultViews);
</script>
