<template>
	<div>
		<ul class="nav nav-tabs cf-panel-tab-header cf-panel-lg">
			<li :class="{'active': activeForm==='search'}" @click.prevent="activeForm='search'"><a href="#form-search">{{$t('queryForm.search')}}</a></li>
			<li :class="{'active': activeForm==='explore'}" @click.prevent="activeForm='explore'"><a href="#form-explore">{{$t('queryForm.explore')}}</a></li>
		</ul>
		<form class="tab-content cf-panel-tab-body cf-panel-lg clearfix" style="padding-top: 0;" @submit.prevent.stop="submit" @reset.prevent.stop="reset">
			<QueryFormSearch  id="form-search" v-show="activeForm === 'search'"
				:class="{
					'col-xs-12': true,
					'col-md-6': filtersVisible && !queryBuilderVisible
				}"
			/>
			<QueryFormExplore id="form-explore" v-show="activeForm === 'explore'"
				:class="{
					'col-xs-12': true
				}"
			/>

			<!-- TODO this is a bit dumb, only show the hr when the filters and pattern form are below each other, but that's rather conditional... -->
			<div v-if="filtersVisible"
				:class="{
					'col-xs-12': true,
			 		'visible-xs': true,
					'visible-sm': true,
					'visible-md': queryBuilderVisible || activeForm === 'explore',
					'visible-lg': queryBuilderVisible || activeForm === 'explore'
				}"
			>
				<hr/>
			</div>
			<QueryFormFilters id="filtercontainer" v-show="filtersVisible"
				:class="{
					'col-xs-12': true,
					'col-md-6': activeForm === 'search' && !queryBuilderVisible,
					'col-md-9': activeForm === 'explore' || queryBuilderVisible
				}"
			/>
			<div class="col-xs-12">
				<hr/>
				<button type="submit" class="btn btn-primary btn-lg">{{$t('queryForm.search')}}</button>
				<button type="reset" class="btn btn-default btn-lg" title="Start a new search">{{$t('queryForm.reset')}}</button>
				<button type="button" class="btn btn-lg btn-default" @click="historyOpen = true">{{$t('queryForm.history')}}</button>
				<button type="button" class="btn btn-lg btn-default" @click="settingsOpen = true"><span class="glyphicon glyphicon-cog" style="vertical-align:text-top;"></span></button>
			</div>
		</form>
		<QueryFormSettings v-if="settingsOpen" id="settings" @close="settingsOpen=false"/>
		<History v-if="historyOpen" id="history" @close="historyOpen=false"/>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import {Subscription} from 'rxjs';
import {stripIndent} from 'common-tags';

import * as RootStore from '@/store/search/';
import * as InterfaceStore from '@/store/search/form/interface';

import { selectedSubCorpus$ } from '@/store/search/streams';

import QueryFormSearch from '@/pages/search/form/QueryFormSearch.vue';
import QueryFormExplore from '@/pages/search/form/QueryFormExplore.vue';
import QueryFormFilters from '@/pages/search/form/QueryFormFilters.vue';
import QueryFormSettings from '@/pages/search/form/QueryFormSettings.vue';

import History from '@/pages/search/History.vue';

import * as BLTypes from '@/types/blacklabtypes';
import {ApiError} from '@/types/apptypes';

export default Vue.extend({
	components: {
		QueryFormExplore,
		QueryFormSearch,
		QueryFormFilters,
		QueryFormSettings,
		History
	},
	data: () => ({
		subscriptions: [] as Subscription[],
		subCorpusStats: null as null|BLTypes.BLDocResults,
		error: null as null|ApiError,

		settingsOpen: false,
		historyOpen: false,

	}),
	computed: {
		queryBuilderVisible(): boolean { return RootStore.get.queryBuilderActive(); },
		filtersVisible(): boolean { return RootStore.get.filtersActive(); },
		activeForm: {
			get: InterfaceStore.get.form,
			set: InterfaceStore.actions.form
		},
	},
	methods: {
		reset: RootStore.actions.reset,
		submit() {
			if (this.activeForm === 'explore' && this.subCorpusStats && this.subCorpusStats.summary.tokensInMatchingDocuments! > 5_000_000) {
				const msg = stripIndent`
					You have selected a subcorpus of over ${(5_000_000).toLocaleString()} tokens.
					Please note that this query, on first execution, may take a considerable amount of time to complete.
					Proceed with caution.

					Continue?`;

				if (!confirm(msg)) {
					return;
				}
			}
			if (document.activeElement) {
				(document.activeElement as HTMLInputElement).blur();
			}
			RootStore.actions.searchFromSubmit();
		}
	},
	created() {
		this.subscriptions.push(selectedSubCorpus$.subscribe(v => {
			this.subCorpusStats = v.value || null;
			this.error = v.error || null;
		}));
	},
	destroyed() {
		this.subscriptions.forEach(s => s.unsubscribe());
	}
});
</script>

<style lang="scss">

#searchContainer, #filterContainer {
	-webkit-transition: all 0.5s ease;
	-moz-transition: all 0.5s ease;
	-o-transition: all 0.5s ease;
	transition: all 0.5s ease;
}


#filterContainer>.tab-content {
	max-height: 500px;
	overflow-y: auto;
	overflow-x: hidden;
	/* required due to negative margin-right of contents causing scrollbar otherwise */
}

</style>
