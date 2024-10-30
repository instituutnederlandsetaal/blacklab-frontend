<template>
	<div class="results-container" :disabled="request" :style="{minHeight: request ? '100px' : undefined}">

		<Spinner v-if="request" overlay size="75"/>

		<!-- i.e. HitResults, DocResults, GroupResults -->
		<!-- Minor annoyance, all slot components are re-created when we group/ungroup results because this :is changes, causing a complete re-render. -->
		<component v-if="resultsHaveData"
			:is="resultComponentName"
			v-bind="resultComponentData"

			@sort="sort = $event"
			@viewgroup="restoreOnViewGroupLeave = {page, sort}; viewGroup = $event.id; _viewGroupName = $event.displayName;"
		>
			<BreadCrumbs slot="breadcrumbs"
				:crumbs="breadCrumbs"
				:disabled="!!request"
			/>

			<Totals slot="totals"
				class="result-totals"
				:initialResults="results"
				:type="id"
				:indexId="indexId"

				@update="paginationResults = $event"
			/>

			<GroupBy slot="groupBy" v-if="!viewGroup"
				:type="id"
				:results="results"
				:disabled="!!request"
			/>
			<button v-else slot="groupBy" class="btn btn-sm btn-primary" @click="leaveViewgroup"><span class="fa fa-angle-double-left"></span> {{ $t('results.resultsView.navigation.backToGroupedResults') }}</button>

			<div slot="annotation-switcher" v-if="concordanceAnnotationOptions.length > 1">
				<label>{{$t('results.resultsView.selectAnnotation')}}: </label>
				<div class="btn-group" >
					<button v-for="a in concordanceAnnotationOptions" type="button"
						class="btn btn-default btn-sm"
						:class="{active: a.id === concordanceAnnotationId}"
						@click="concordanceAnnotationId = a.id">{{ $tAnnotDisplayName(a) }}</button>
				</div>
			</div>

			<Pagination slot="pagination"
				style="display: block; margin: 10px 0;"

				:page="pagination.shownPage"
				:maxPage="pagination.maxShownPage"
				:disabled="!!request"

				@change="page = $event"
			/>

			<Sort slot="sort"
				v-model="sort"
				:hits="isHits"
				:docs="isDocs"
				:groups="isGroups"

				:corpus="corpus"
				:annotations="sortAnnotations"
				:metadata="sortMetadata"

				:disabled="!!request"
			/>

			<Export slot="export" v-if="exportEnabled"
				:results="results"
				:type="id"
				:disabled="!!request"
				:annotations="exportAnnotations"
				:metadata="exportMetadata"
			/>

		</component>
		<div v-else-if="results" class="no-results-found">{{ $t('results.resultsView.noResultsFound') }}</div>
		<div v-else-if="!valid" class="no-results-found">
			{{ $t('results.resultsView.inactiveView') }}
		</div>
		<div v-else-if="error != null" class="no-results-found">
			<span class="fa fa-exclamation-triangle text-danger"></span><br>
			<span v-html="error"></span>
			<br>
			<br>
			<button type="button" class="btn btn-default" :title="$t('results.resultsView.tryAgainTitle').toString()" @click="markDirty();">{{ $t('results.resultsView.tryAgain') }}</button>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import jsonStableStringify from 'json-stable-stringify';

import * as Api from '@/api';

import * as RootStore from '@/store/search/';
import * as CorpusStore from '@/store/search/corpus';
import * as ResultsStore from '@/store/search/results/views';
import * as GlobalStore from '@/store/search/results/global';
import * as QueryStore from '@/store/search/query';
import * as UIStore from '@/store/search/ui';
import * as GlossModule from '@/store/search/form/glossStore' // Jesse

import GroupResults from '@/pages/search/results/table/GroupResults.vue';
import HitResults from '@/pages/search/results/table/HitResults.vue';
import DocResults from '@/pages/search/results/table/DocResults.vue';
import Totals from '@/pages/search/results/ResultTotals.vue';
import GroupBy from '@/pages/search/results/groupby/GroupBy.vue';

import Sort from '@/pages/search/results/Sort.vue';
import BreadCrumbs from '@/pages/search/results/BreadCrumbs.vue';
import Export from '@/pages/search/results/Export.vue';

import Pagination from '@/components/Pagination.vue';
import SelectPicker from '@/components/SelectPicker.vue';
import Spinner from '@/components/Spinner.vue';

import debug, { debugLog } from '@/utils/debug';

import * as BLTypes from '@/types/blacklabtypes';
import { NormalizedIndex } from '@/types/apptypes';
import { humanizeGroupBy, parseGroupBy, serializeGroupBy } from '@/utils/grouping';
import { TranslateResult } from 'vue-i18n';

export default Vue.extend({
	components: {
		Pagination,
		GroupResults,
		HitResults,
		DocResults,
		Totals,
		GroupBy,
		SelectPicker,
		Sort,
		BreadCrumbs,
		Export,
		Spinner
	},
	props: {
		/**
		 * In our case, always 'hits' or 'docs', we don't support adding another ResultsView tab with a different ID.
		 * Since we use this ID to determine whether we're getting hits or docs from blacklab, and some rendering or logic may depend on it being 'hits' or 'docs' as well.
		 */
		id: String as () => 'hits'|'docs',
		label: String,
		active: Boolean,

		store: Object as () => ResultsStore.ViewModule,
	},
	data: () => ({
		isDirty: true, // since we don't have any results yet
		request: null as null|Promise<BLTypes.BLSearchResult>,
		results: null as null|BLTypes.BLSearchResult,
		error: null as null|string,
		cancel: null as null|Api.Canceler,

		_viewGroupName: null as string|null,

		paginationResults: null as null|BLTypes.BLSearchResult,

		// Should we scroll when next results arrive - set when main form submitted
		scroll: true,
		// Should we clear the results when we begin the next request? - set when main form is submitted.
		clearResults: false,

		/** When no longer viewing contents of a group, restore the page and sorting (i.e. user's position in the results). */
		restoreOnViewGroupLeave: null as null|{
			page: number;
			sort: string|null;
		},

		debug
	}),
	methods: {
		markDirty() {
			this.isDirty = true;
			if (this.cancel) {
				debugLog('cancelling search request');
				this.cancel();
				this.cancel = null;
				this.request = null;
			}
			if (this.active) {
				this.refresh();
			}
		},
		refresh() {
			this.isDirty = false;
			debugLog('this is when the search should be refreshed');

			if (this.cancel) {
				debugLog('cancelling previous search request');
				this.cancel();
				this.request = null;
				this.cancel = null;
			}

			if (!this.valid) {
				this.results = null;
				this.paginationResults = null;
				this.error = null;
				this.clearResults = false;
				return;
			}

			if (this.clearResults) { this.results = this.error = null; this.clearResults = false; }

			const nonce = this.refreshParameters;
			const params = RootStore.get.blacklabParameters()!;
			const apiCall = this.id === 'hits' ? Api.blacklab.getHits : Api.blacklab.getDocs;
			debugLog('starting search', this.id, params);

			const r = apiCall(this.indexId, params, {headers: { 'Cache-Control': 'no-cache' }});
			this.request = r.request;
			this.cancel = r.cancel;

			setTimeout(() => this.scrollToResults(), 1500);

			this.request
			.then(
				r => { if (nonce === this.refreshParameters) this.setSuccess(r)},
				e => {
					if (nonce === this.refreshParameters) {
						// This happens when grouping on a capture group that no longer exists.
						// We can only detect it after trying to do so unfortunately.
						// (Blacklab does not return the group info when calling the parse query endpoint, so we can't check beforehand.)
						// We simply remove the offending grouping clause and try again.
						if (e.title === 'UNKNOWN_MATCH_INFO' && this.groupBy.length > 0) {
							// remove the group on label.
							debugLog('grouping failed, clearing groupBy');
							const okayGroups = parseGroupBy(this.groupBy).filter(g => !(g.type === 'context' && g.context.type === 'label'));
							const newGroupBy = serializeGroupBy(okayGroups);
							this.groupBy = newGroupBy;
						}
						this.setError(e, !!params.group)
					}
				}
			)
			.finally(() => this.scrollToResults())
		},
		setSuccess(data: BLTypes.BLSearchResult) {
			debugLog('search results', data);
			this.results = data;
			this.paginationResults = data;
			this.error = null;
			this.request = null;
			this.cancel = null;

			// Jesse (glosses): hier ook een keer de page hits in de gloss store updaten
			const get_hit_id = GlossModule.get.settings()?.get_hit_id;
			if (BLTypes.isHitResults(data) && get_hit_id) {
				GlossModule.actions.setCurrentPage(data.hits.map(get_hit_id));
			}
		},
		setError(data: Api.ApiError, isGrouped?: boolean) {
			if (data.title !== 'Request cancelled') { // TODO
				debugLog('Request failed: ', data);
				this.error = UIStore.getState().global.errorMessage(data, isGrouped ? 'groups' : this.id as 'hits'|'docs');
				this.results = null;
				this.paginationResults = null;
			}
			this.request = null;
			this.cancel= null;
		},

		scrollToResults() {
			if (this.scroll) {
				this.scroll = false;
				window.scroll({
					behavior: 'smooth',
					top: (this.$el as HTMLElement).offsetTop - 150
				});
			}
		},
		leaveViewgroup() {
			this.viewGroup = null;
			this.page = this.restoreOnViewGroupLeave?.page || 0;
			this.sort = this.restoreOnViewGroupLeave?.sort || null;
			this.restoreOnViewGroupLeave = null;
		}
	},
	computed: {
		groupBy: {
			get(): string[] { return this.store.getState().groupBy; },
			set(v: string[]) { this.store.actions.groupBy(v); }
		},
		page: {
			get(): number { return this.store.getState().page; },
			set(v: number) { this.store.actions.page(v);  }
		},
		sort: {
			get(): string|null { return this.store.getState().sort; },
			set(v: string|null) { this.store.actions.sort(v); }
		},
		viewGroup: {
			get(): string|null { return this.store.getState().viewGroup; },
			set(v: string|null) { this.store.actions.viewGroup(v); }
		},

		corpus(): NormalizedIndex { return CorpusStore.getState().corpus!; },

		concordanceAnnotationOptions(): CorpusStore.NormalizedAnnotation[] { return UIStore.getState().results.shared.concordanceAnnotationIdOptions.map(id => CorpusStore.get.allAnnotationsMap()[id]); },
		concordanceAnnotationId: {
			get(): string { return UIStore.getState().results.shared.concordanceAnnotationId; },
			set(v: string) { UIStore.actions.results.shared.concordanceAnnotationId(v); }
		},

		sortAnnotations(): string[] { return UIStore.getState().results.shared.sortAnnotationIds; },
		sortMetadata(): string[] { return UIStore.getState().results.shared.sortMetadataIds; },
		exportAnnotations(): string[]|null { return UIStore.getState().results.shared.detailedAnnotationIds; },
		exportMetadata(): string[]|null { return UIStore.getState().results.shared.detailedMetadataIds; },


		exportEnabled(): boolean { return UIStore.getState().results.shared.exportEnabled; },

		refreshParameters(): string {
			/*
				NOTE: we return this as a string so we can remove properties
				If we don't the watcher on this computed will fire regardless
				because some property somewhere in the object is a new instance and thus not equal...
				This would cause new results to be requested even when just changing the table display mode...
			*/
			return jsonStableStringify({
				global: GlobalStore.getState(),
				self: {
					...this.store.getState(),
					groupDisplayMode: null // ignore this property
				} as Partial<ResultsStore.ViewRootState>,
				query: QueryStore.getState()
			});
		},

		// When these change, the form has been resubmitted, so we need to initiate a scroll event
		querySettings() { return QueryStore.getState(); },

		pagination(): {
			shownPage: number,
			maxShownPage: number
		} {
			const r: BLTypes.BLSearchResult|null = this.paginationResults || this.results;
			if (r == null) {
				return {
					shownPage: 0,
					maxShownPage: 0,
				};
			}

			const pageSize = this.results!.summary.requestedWindowSize;
			const shownPage = Math.floor(this.results!.summary.windowFirstResult / pageSize);
			const totalResults =
				BLTypes.isGroups(r) ? r.summary.numberOfGroups :
				BLTypes.isHitResults(r) ? r.summary.numberOfHitsRetrieved :
				r.summary.numberOfDocsRetrieved;

			// subtract one page if number of results exactly diactive by page size
			// e.g. 20 results for a page size of 20 is still only one page instead of 2.
			const pageCount = Math.floor(totalResults / pageSize) - ((totalResults % pageSize === 0 && totalResults > 0) ? 1 : 0);

			return {
				shownPage,
				maxShownPage: pageCount
			};
		},

		valid(): boolean {
			if (this.id === 'hits') {
				const params = RootStore.get.blacklabParameters();
				return !!(params && params.patt);
			} else {
				return true;
			}
		},
		// simple view variables
		indexId(): string { return INDEX_ID; },
		resultsHaveData(): boolean {
			if (BLTypes.isDocGroups(this.results)) { return this.results.docGroups.length > 0; }
			if (BLTypes.isHitGroups(this.results)) { return this.results.hitGroups.length > 0; }
			if (BLTypes.isHitResults(this.results)) { return this.results.hits.length > 0; }
			if (BLTypes.isDocResults(this.results)) { return this.results.docs.length > 0; }
			return false;
		},
		isHits(): boolean { return BLTypes.isHitResults(this.results); },
		isDocs(): boolean { return BLTypes.isDocResults(this.results); },
		isGroups(): boolean { return BLTypes.isGroups(this.results); },

		viewGroupName(): string {
			if (this.viewGroup == null) { return ''; }
			return this._viewGroupName ?? this.viewGroup.substring(this.viewGroup.indexOf(':')+1) ?? this.$t('results.groupBy.groupNameWithoutValue').toString();
		},

		breadCrumbs(): Array<{
			label: TranslateResult,
			title: TranslateResult,
			active: boolean,
			onClick: () => void
		}> {
			// Labels and titles might look confusing
			// but, the label is what the uses is currently looking at
			// the title is what they will look at if they click the link
			// e.g. hits -> grouped by -> specific group -> sample
			// if clicking hits -> go to hits
			// if clicking grouped by -> go to grouped results
			// if clicking specific group -> go to specific group

			const r = [];
			r.push({
				label: this.id === 'hits' ? this.$t('results.resultsView.navigation.hits') : this.$t('results.resultsView.navigation.documents'),
				title: this.$t('results.resultsView.navigation.backToUngroupedResults').toString(),
				active: false,
				onClick: () => {
					this.groupBy = [];
					GlobalStore.actions.sampleSize(null);
				}
			});
			if (this.groupBy.length > 0) {
				const groupByLabel = parseGroupBy(this.groupBy).map(g => humanizeGroupBy(this, g, CorpusStore.get.allAnnotationsMap(), CorpusStore.get.allMetadataFieldsMap())).join(', ')
				r.push({
					label: this.$t('results.resultsView.navigation.groupedBy', {group: groupByLabel}),
					title: this.$t('results.resultsView.navigation.backToGroupedResults'),
					active: false,
					onClick: () => {
						this.leaveViewgroup();
						GlobalStore.actions.sampleSize(null);
					}
				});
			}
			if (this.viewGroup != null) {
				r.push({
					label: this.$t('results.resultsView.navigation.viewingGroup', {group: this.viewGroupName}),
					title: '',
					active: false,
					onClick: () => GlobalStore.actions.sampleSize(null)
				});
			}
			const {sampleMode, sampleSize} = GlobalStore.getState();
			if (sampleSize != null) {
				r.push({
					label: this.$t('results.resultsView.navigation.randomSample', {sample: `${sampleSize}${sampleMode === 'percentage' ? '%' : ''}`}),
					title: '',
					active: false,
					onClick: () => {
						$('#settings').modal('show')
					}
				})
			}
			r[r.length -1].active = true;
			return r;
		},

		resultComponentName(): string {
			if (this.isGroups) {
				return 'GroupResults';
			} else if (this.isHits) {
				return 'HitResults';
			} else {
				return 'DocResults';
			}
		},
		resultComponentData(): any {
			return {
				results: this.results,
				disabled: !!this.request,
				sort: this.sort,
			};
		},
	},
	watch: {
		querySettings: {
			deep: true,
			handler() {
				this.scroll = true;
				this.clearResults = true;
			},
		},
		refreshParameters: {
			handler(cur, prev) {
				if (this.active) {
					this.refresh();
				} else {
					this.markDirty();
				}
			},
		},
		active: {
			handler(active) {
				if (active && this.isDirty) {
					this.refresh();
				}
			},
			immediate: true
		},
	}
});
</script>

<style lang="scss">

.no-results-found {
	padding: 1.25em;
	text-align: center;
	font-style: italic;
	font-size: 16px;
	color: #777;
}

table {
	> thead > tr > th {
		text-align: left;
		background-color: white;
		border-bottom: 1px solid #aaa;
		padding-bottom: 5px;
	}

	> tbody > tr > td {
		vertical-align: top;
	}
}

.results-container {
	position: relative;
}

// Make entire row clickable even when the document title is short
.doctitle {
	display: block;
}

.result-totals {
	background: white;
	padding: 8px 8px 0 15px;
	flex: none;
}

</style>
