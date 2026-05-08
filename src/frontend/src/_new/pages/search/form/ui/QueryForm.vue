<template>
	<div>
		<ul class="nav nav-tabs cf-panel-tab-header cf-panel-lg">
			<li :class="{ active: activeForm === 'search' }" @click.prevent="activeForm = 'search'">
				<a href="#form-search">{{ $t('queryForm.search') }}</a>
			</li>
			<!-- <li :class="{'active': activeForm==='explore'}" @click.prevent="activeForm='explore'"><a href="#form-explore">{{$t('queryForm.explore')}}</a></li> -->
		</ul>
		<form class="tab-content cf-panel-tab-body cf-panel-lg clearfix" style="padding-top: 0" @submit.prevent.stop="submit" @reset.prevent.stop="reset">
			<QueryFormSearch
				id="form-search"
				v-show="activeForm === 'search'"
				:class="{
					'col-xs-12': true,
					// 'col-md-6': filtersVisible && !queryBuilderVisible,
				}"
				:errorNoParallelSourceVersion="errorNoParallelSourceVersion"
			/>
			<!-- <QueryFormExplore id="form-explore" v-show="activeForm === 'explore'"
				:class="{
					'col-xs-12': true
				}"
				:errorNoParallelSourceVersion="errorNoParallelSourceVersion"
			/> -->

			<!-- TODO this is a bit dumb, only show the hr when the filters and pattern form are below each other, but that's rather conditional... -->
			<!-- <div v-if="filtersVisible"
				:class="{
					'col-xs-12': true,
			 		'visible-xs': true,
					'visible-sm': true,
					'visible-md': queryBuilderVisible || activeForm === 'explore',
					'visible-lg': queryBuilderVisible || activeForm === 'explore'
				}"
			>
				<hr/>
			</div> -->
			<!-- <QueryFormFilters id="filtercontainer" v-show="filtersVisible"
				:class="{
					'col-xs-12': true,
					'col-md-6': activeForm === 'search' && !queryBuilderVisible,
					'col-md-9': activeForm === 'explore' || queryBuilderVisible
				}"
			/> -->
			<div class="col-xs-12">
				<hr />
				<button type="submit" class="btn btn-primary btn-lg">{{ $t('queryForm.search') }}</button>
				<button type="reset" class="btn btn-default btn-lg" title="Start a new search">{{ $t('queryForm.reset') }}</button>
				<button type="button" class="btn btn-lg btn-default" @click="historyOpen = true">{{ $t('queryForm.history') }}</button>
				<button type="button" class="btn btn-lg btn-default" @click="settingsOpen = true"><span class="glyphicon glyphicon-cog" style="vertical-align: text-top"></span></button>
			</div>
		</form>
		<!-- <QueryFormSettings v-if="settingsOpen" id="settings" @close="settingsOpen=false"/> -->
		<!-- <History v-if="historyOpen" id="history" @close="historyOpen=false"/> -->
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

// import * as RootStore from '@/app/state/root-store';
// import * as CorpusStore from '@/features/corpus/model/corpus-state';
import * as InterfaceStore from '@/_new/pages/search/form/store/interface-state';

import QueryFormSearch from '@/_new/pages/search/form/ui/QueryFormSearch.vue';
// import * as PatternStore from '@/features/search/model/form/pattern-state';

// import QueryFormExplore from '@/pages/search/form/QueryFormExplore.vue';
// import QueryFormFilters from '@/pages/search/form/QueryFormFilters.vue';
// import QueryFormSearch from '@/pages/search/form/QueryFormSearch.vue';
// import QueryFormSettings from '@/pages/search/form/QueryFormSettings.vue';

// import { selectedSubcorpusLoader } from '@/api/async/instances/result-count';
// import History from '@/pages/search/History.vue';

const emit = defineEmits<{
	reset: [];
}>();

const settingsOpen = ref(false);
const historyOpen = ref(false);
const errorNoParallelSourceVersion = ref(false);

// TODO find a way to inject the popup about large corpus without coupling the form to the filters summary

// const subcorpus = selectedSubcorpusLoader;

// const queryBuilderVisible = computed(() => RootStore.get.queryBuilderActive());
// const filtersVisible = computed(() => RootStore.get.filtersActive());
const activeForm = computed({
	get: InterfaceStore.get.form,
	set: InterfaceStore.actions.form,
});
const exploreMode = computed({
	get: InterfaceStore.get.exploreMode,
	set: InterfaceStore.actions.exploreMode,
});

function reset(_event?: Event) {
	emit('reset');
	// RootStore.actions.reset();
}

function submit() {
	// 	if (CorpusStore.get.isParallelCorpus() && PatternStore.getState().shared.source === null) {
	// 			// No source version selected. Required for most operations.
	// 			const needsSource = this.activeForm === 'search' ||
	// 				(activeForm.value === 'explore' && (this.exploreMode === 'ngram' || this.exploreMode === 'frequency'));
	// 			if (needsSource) {
	// 				// Source is required. Alert the user that they need to select a source version
	// 				this.errorNoParallelSourceVersion = true;
	// 				// Scroll to the top of the page so the user can see the error
	// 				window.scrollTo(0, 0);
	// 				setTimeout(() => this.errorNoParallelSourceVersion = false, 3000);
	// 				return;
	// 			} else {
	// 				this.errorNoParallelSourceVersion = false;
	// 			}
	// 		}
	// 		if (this.activeForm === 'explore' && this.subcorpus.isLoaded() && this.subcorpus.value.tokensInMatchingDocuments > 5000000) {
	// 			const msg = stripIndent`
	// 				You have selected a subcorpus of over ${(5000000).toLocaleString()} tokens.
	// 				Please note that this query, on first execution, may take a considerable amount of time to complete.
	// 				Proceed with caution.
	// 				Continue?`;
	// 			if (!confirm(msg)) {
	// 				return;
	// 			}
	// 		}
	// 		if (document.activeElement) {
	// 			(document.activeElement as HTMLInputElement).blur();
	// 		}
	// 		RootStore.actions.searchFromSubmit();
	// 	}
}
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
