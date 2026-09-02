<template>
	<div>
		<ul id="resultTabs" class="nav nav-tabs cf-panel-tab-header cf-panel-lg">
			<li v-for="v in resultViews" :class="[{ active: InterfaceStore.get.viewedResults() === v.id }]" :title="v.title">
				<a href="javascript:void(0);" @click="InterfaceStore.actions.viewedResults(v.id)">{{ v.label || v.title || v.id }}</a>
			</li>
		</ul>

		<div class="tab-content cf-panel-tab-body cf-panel-lg" style="padding-top: 0px">
			<component
				v-for="v in resultViews"
				:is="v.component"
				:key="v.id"
				v-show="InterfaceStore.get.viewedResults() === v.id"
				:id="v.id"
				:active="InterfaceStore.get.viewedResults() === v.id"
				:store="ViewStore.getOrCreateModule(v.id)"
			></component>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import * as RootStore from '@/app/state/root-store';
import { useCustomizations } from '@/customization-api/internal/internal-api';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import { isEffectiveCollocationParameters } from '@/features/search/model/results/result-types';
import * as ViewStore from '@/features/search/model/results/view-state';

import { useI18n } from '@/shared/i18n';

import ResultsView from '@/pages/search/results/ResultsView.vue';

defineOptions({
	components: {
		ResultsView,
	},
});

const customizations = useCustomizations();
const translate = useI18n();
const resultViews = computed(() => {
	const views = customizations.resultViews();
	return isEffectiveCollocationParameters(RootStore.get.blacklabParameters())
		? views.filter(view => view.id === 'hits').map(view => ({ ...view, label: translate.$t('queryForm.collocations').toString(), title: translate.$t('collocations.heading').toString() }))
		: views;
});
</script>
