<template>
	<FormSystem v-if="newForm" :runtime="newForm" @submit="submitNewForm" @reset="resetNewForm" class="container">
		<template #actions>
			<button type="button" class="btn btn-default btn-lg" @click="historyOpen = true">{{ $t('queryForm.history') }}</button>
			<button type="button" class="btn btn-default btn-lg" @click="settingsOpen = true"><span class="glyphicon glyphicon-cog" style="vertical-align: text-top"></span></button>
		</template>
	</FormSystem>
	<div v-else>
		<ul class="nav nav-tabs cf-panel-tab-header cf-panel-lg">
			<li :class="{ active: activeForm === 'search' }" @click.prevent="activeForm = 'search'">
				<a href="#form-search">{{ $t('queryForm.search') }}</a>
			</li>
			<li :class="{ active: activeForm === 'explore' }" @click.prevent="activeForm = 'explore'">
				<a href="#form-explore">{{ $t('queryForm.explore') }}</a>
			</li>
		</ul>
		<form class="tab-content cf-panel-tab-body cf-panel-lg clearfix" style="padding-top: 0" @submit.prevent.stop="submit" @reset.prevent.stop="reset">
			<QueryFormSearch
				id="form-search"
				v-show="activeForm === 'search'"
				:class="{
					'col-xs-12': true,
					'col-md-6': filtersVisible && !queryBuilderVisible,
				}"
				:errorNoParallelSourceVersion="errorNoParallelSourceVersion"
			/>
			<QueryFormExplore
				id="form-explore"
				v-show="activeForm === 'explore'"
				:class="{
					'col-xs-12': true,
				}"
				:errorNoParallelSourceVersion="errorNoParallelSourceVersion"
			/>

			<!-- TODO this is a bit dumb, only show the hr when the filters and pattern form are below each other, but that's rather conditional... -->
			<div
				v-if="filtersVisible"
				:class="{
					'col-xs-12': true,
					'visible-xs': true,
					'visible-sm': true,
					'visible-md': queryBuilderVisible || activeForm === 'explore',
					'visible-lg': queryBuilderVisible || activeForm === 'explore',
				}"
			>
				<hr />
			</div>
			<QueryFormFilters
				id="filtercontainer"
				v-show="filtersVisible"
				:class="{
					'col-xs-12': true,
					'col-md-6': activeForm === 'search' && !queryBuilderVisible,
					'col-md-9': activeForm === 'explore' || queryBuilderVisible,
				}"
			/>
			<div class="col-xs-12">
				<hr />
				<div class="btn-toolbar">
					<button type="submit" class="btn btn-primary btn-lg">{{ $t('queryForm.search') }}</button>
					<button type="reset" class="btn btn-default btn-lg" title="Start a new search">{{ $t('queryForm.reset') }}</button>
					<button type="button" class="btn btn-lg btn-default" @click="historyOpen = true">{{ $t('queryForm.history') }}</button>
					<button type="button" class="btn btn-lg btn-default" @click="settingsOpen = true"><span class="glyphicon glyphicon-cog" style="vertical-align: text-top"></span></button>
				</div>
			</div>
		</form>
	</div>
	<QueryFormSettings v-if="settingsOpen" id="settings" @close="settingsOpen = false" />
	<History v-if="historyOpen" id="history" @close="historyOpen = false" />
</template>

<script lang="ts">
import { stripIndent } from 'common-tags';
import { defineComponent } from 'vue';

import { selectedSubcorpusLoader } from '@/api/async/instances/result-count';
import * as RootStore from '@/app/state/root-store';
import { useCorpus } from '@/app/state/useCorpusContext';
import type { CompiledFormStateWithSummaries, FormRuntime } from '@/features/form';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as PatternStore from '@/features/search/model/form/pattern-state';
import * as GlobalViewSettings from '@/features/search/model/results/global-results-state';
import { getLegacyFormNameFromNewFormId, useSearchFormSystem } from '@/features/search/model/search-form-builder';

import FormSystem from '@/features/form/ui/FormSystem.vue';
import QueryFormExplore from '@/pages/search/form/QueryFormExplore.vue';
import QueryFormFilters from '@/pages/search/form/QueryFormFilters.vue';
import QueryFormSearch from '@/pages/search/form/QueryFormSearch.vue';
import QueryFormSettings from '@/pages/search/form/QueryFormSettings.vue';
import History from '@/pages/search/History.vue';

export default defineComponent({
	components: {
		QueryFormExplore,
		QueryFormSearch,
		QueryFormFilters,
		QueryFormSettings,
		History,
		FormSystem,
	},
	data: () => ({
		subcorpus: selectedSubcorpusLoader,
		settingsOpen: false,
		historyOpen: false,
		errorNoParallelSourceVersion: false,
		corpus: useCorpus(),
		searchFormRuntime: useSearchFormSystem(),
	}),
	computed: {
		newForm(): FormRuntime | null {
			const useForm = GlobalViewSettings.getState().useNewSearchForm;
			return useForm ? this.searchFormRuntime : null;
		},

		queryBuilderVisible(): boolean {
			return RootStore.get.queryBuilderActive();
		},
		filtersVisible(): boolean {
			return RootStore.get.filtersActive();
		},
		activeForm: {
			get: InterfaceStore.get.form,
			set: InterfaceStore.actions.form,
		},
		exploreMode: {
			get: InterfaceStore.get.exploreMode,
			set: InterfaceStore.actions.exploreMode,
		},
	},
	methods: {
		reset(_event?: Event) {
			RootStore.actions.reset();
		},
		confirmLargeExploreSearch(form?: 'search' | 'explore'): boolean {
			const activeForm = form ?? this.activeForm;
			if (activeForm !== 'explore' || !this.subcorpus.isLoaded() || this.subcorpus.value.tokensInMatchingDocuments <= 5000000) return true;
			const msg = stripIndent`
				You have selected a subcorpus of over ${(5000000).toLocaleString()} tokens.
				Please note that this query, on first execution, may take a considerable amount of time to complete.
				Proceed with caution.

				Continue?`;

			return confirm(msg);
		},
		blurActiveElement() {
			if (document.activeElement) (document.activeElement as HTMLInputElement).blur();
		},
		submit() {
			if (this.corpus.isParallelCorpus && PatternStore.getState().shared.source === null) {
				// No source version selected. Required for most operations.
				const needsSource = this.activeForm === 'search' || (this.activeForm === 'explore' && (this.exploreMode === 'ngram' || this.exploreMode === 'frequency'));
				if (needsSource) {
					// Source is required. Alert the user that they need to select a source version
					this.errorNoParallelSourceVersion = true;
					// Scroll to the top of the page so the user can see the error
					window.scrollTo(0, 0);
					setTimeout(() => (this.errorNoParallelSourceVersion = false), 3000);
					return;
				} else {
					this.errorNoParallelSourceVersion = false;
				}
			}

			if (!this.confirmLargeExploreSearch()) return;
			this.blurActiveElement();
			RootStore.actions.searchFromSubmit();
		},

		submitNewForm(snapshot: CompiledFormStateWithSummaries) {
			if (!this.confirmLargeExploreSearch(getLegacyFormNameFromNewFormId(snapshot.formId))) return;
			this.blurActiveElement();
			RootStore.actions.searchFromSubmit(snapshot);
		},
		resetNewForm() {
			RootStore.actions.reset();
		},
	},
});
</script>

<style lang="scss">
#searchContainer,
#filterContainer {
	-webkit-transition: all 0.5s ease;
	-moz-transition: all 0.5s ease;
	-o-transition: all 0.5s ease;
	transition: all 0.5s ease;
}

#filterContainer > .tab-content {
	max-height: 500px;
	overflow-y: auto;
	overflow-x: hidden;
	/* required due to negative margin-right of contents causing scrollbar otherwise */
}
</style>
