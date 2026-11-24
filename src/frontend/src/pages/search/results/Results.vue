<template>
	<div>
		<ul id="resultTabs" class="nav nav-tabs cf-panel-tab-header cf-panel-lg">
			<li v-for="v in resultViews" :class="[{ active: activeView === v.id }]" :title="v.title">
				<a href="javascript:void(0);" @click="resultState.selectView(v.id)">{{ v.label || v.title || v.id }}</a>
			</li>
		</ul>

		<div class="tab-content cf-panel-tab-body cf-panel-lg" style="padding-top: 0px">
			<component v-for="v in resultViews" :is="v.component" :key="v.id" v-show="activeView === v.id" :id="v.id" :active="activeView === v.id" :store="v.store"></component>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useCustomizations } from '@/customization-api/internal/internal-api';
import { LegacyResultView } from '@/interop/legacy-store-adapters/search';
import { isEffectiveCollocationParameters } from '@/pages/search/model/results/result-types';
import { useResultsState } from '@/pages/search/model/results/results-state';

import { useI18n } from '@/shared/i18n';

import ResultsView from '@/pages/search/results/ResultsView.vue';

defineOptions({
	components: {
		ResultsView,
	},
});

const resultState = useResultsState();
const { parameters: activeSearchParameters } = resultState;
const activeView = computed(() => resultState.selectedViewName);
const customizations = useCustomizations();
const translate = useI18n();
const configuredViews = computed(() =>
	customizations.resultViews().map(view => {
		const controls = resultState.view(view.id);
		return { ...view, store: view.component === 'ResultsView' ? controls : new LegacyResultView(controls) };
	}),
);
const resultViews = computed(() => {
	const views = configuredViews.value;
	return isEffectiveCollocationParameters(activeSearchParameters.value)
		? views.map(view => (view.id === 'hits' ? { ...view, label: translate.$t('queryForm.collocations').toString(), title: translate.$t('collocations.heading').toString() } : view))
		: views;
});
</script>
