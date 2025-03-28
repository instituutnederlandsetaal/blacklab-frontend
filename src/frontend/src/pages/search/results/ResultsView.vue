<template>
	<div class="results-container" :disabled="request" :style="{minHeight: request ? '100px' : undefined}">
		<Spinner v-if="request" overlay size="75"/>


		<template v-if="resultComponentData && cols && renderDisplaySettings">
			<div class="crumbs-totals">
				<BreadCrumbs :crumbs="breadCrumbs" :disabled="!!request" />
				<Totals class="result-totals" :initialResults="results" :type="id" :indexId="indexId" @update="paginationResults = $event" />
			</div>

			<GroupBy v-if="!viewGroup"
				:type="id"
				:results="results"
				:disabled="!!request"
			/>


			<div class="result-buttons-layout">
				<Pagination slot="pagination" v-if="20 <= (rows?.rows.length ?? 0)"
					:page="pagination.shownPage"
					:maxPage="pagination.maxShownPage"
					:disabled="!!request"

					@change="page = $event"
				/>

				<div class="btn-group" v-if="isGroups" style="flex: none;">
					<button v-for="option in cols.groupModeOptions"
						type="button"
						:class="['btn btn-default btn-sm', {'active': renderDisplaySettings.groupDisplayMode === option}]"
						:key="option"
						@click="groupDisplayMode = option"
					>{{option}}</button>
				</div>
				<button v-if="viewGroup" class="btn btn-sm btn-primary" @click="leaveViewgroup">
					<span class="fa fa-angle-double-left"></span> {{ $t('results.resultsView.navigation.backToGroupedResults') }}
				</button>

				<div style="flex-grow: 1;"></div>
				<div v-if="concordanceAnnotationOptions.length > 1 && id === 'hits'">
					<label>{{$t('results.resultsView.selectAnnotation')}}: </label>
					<div class="btn-group" >
						<button v-for="a in concordanceAnnotationOptions" type="button"
							class="btn btn-default btn-sm"
							:class="{active: a.id === concordanceAnnotationId}"
							@click="concordanceAnnotationId = a.id">{{ $tAnnotDisplayName(a) }}</button>
					</div>
				</div>
			</div>

			<GenericTable
				:type="id"
				:class="isHits ? 'hits-table' : isDocs ? 'docs-table' : isGroups ? 'groups-table' : ''"
				:cols="cols"
				:rows="rows"
				:info="renderDisplaySettings"
				:header="isHits ? cols.hitColumns : isDocs ? cols.docColumns : cols.groupColumns"
				:showTitles="showTitles"
				:disabled="!!request"
				:query="results?.summary.searchParam"

				@changeSort="sort = (sort === $event ? `-${sort}` : $event)"
				@viewgroup="changeViewGroup"
			/>

			<div class="result-buttons-layout" style="border-top: 1px solid #ccc; padding-top: 15px;">
				<Pagination
					style="display: block;"

					:page="pagination.shownPage"
					:maxPage="pagination.maxShownPage"
					:disabled="!!request"

					@change="page = $event"
				/>
				<div style="flex-grow: 1;"></div>

				<button v-if="isHits"
					type="button"
					class="btn btn-primary btn-sm show-titles"

					@click="showTitles = !showTitles"
				>
					{{showTitles ? $t('results.table.hide') : $t('results.table.show')}} {{ $t('results.table.titles') }}
				</button>

				<Sort
					v-model="sort"
					:hits="isHits"
					:docs="isDocs"
					:groups="isGroups"
					:parallelCorpus="isParallelCorpus"

					:corpus="corpus"
					:annotations="sortAnnotations"
					:metadata="sortMetadata"

					:disabled="!!request"
				/>

				<Export v-if="exportEnabled"
					:results="results"
					:type="id"
					:disabled="!!request"
					:annotations="exportAnnotations"
					:metadata="exportMetadata"
				/>
			</div>
		</template>
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
import Vue, { markRaw } from 'vue';

import jsonStableStringify from 'json-stable-stringify';

import * as Api from '@/api';

import * as RootStore from '@/store/search/';
import * as CorpusStore from '@/store/search/corpus';
import * as ResultsStore from '@/store/search/results/views';
import * as GlobalStore from '@/store/search/results/global';
import * as QueryStore from '@/store/search/query';
import * as UIStore from '@/store/search/ui';
import * as GlossModule from '@/store/search/form/glossStore' // Jesse

import Totals from '@/pages/search/results/ResultTotals.vue';
import GroupBy from '@/pages/search/results/groupby/GroupBy.vue';

import Sort from '@/pages/search/results/Sort.vue';
import BreadCrumbs from '@/pages/search/results/BreadCrumbs.vue';
import Export from '@/pages/search/results/Export.vue';

import Pagination from '@/components/Pagination.vue';
import Spinner from '@/components/Spinner.vue';

import debug, { debugLogCat } from '@/utils/debug';

import * as BLTypes from '@/types/blacklabtypes';
import { NormalizedAnnotatedFieldParallel, NormalizedIndex } from '@/types/apptypes';
import { humanizeGroupBy, parseGroupBy, serializeGroupBy } from '@/utils/grouping';
import { TranslateResult } from 'vue-i18n';
import { ColumnDefs, DisplaySettingsCommon, DisplaySettingsForColumns, DisplaySettingsForRendering, DisplaySettingsForRows, makeColumns, makeRows, Rows } from '@/pages/search/results/table/table-layout';
import { isHitParams } from '@/utils';


import '@/pages/search/results/table/GenericTable.vue';

export default Vue.extend({
	components: {
		Pagination,
		Totals,
		GroupBy,
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
		showTitles: true,

		debug
	}),
	methods: {
		markDirty() {
			this.isDirty = true;
			if (this.cancel) {
				debugLogCat('results', 'cancelling search request');
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
			debugLogCat('results', 'this is when the search should be refreshed');

			if (this.cancel) {
				debugLogCat('results', 'cancelling previous search request');
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
			const apiCall = this.id === 'hits' ? Api.blacklab.getHits<BLTypes.BLHitResults|BLTypes.BLHitGroupResults> : Api.blacklab.getDocs<BLTypes.BLDocResults|BLTypes.BLDocGroupResults>;
			debugLogCat('results', 'starting search', this.id, params);

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
							debugLogCat('results', 'grouping failed, clearing groupBy');
							const okayGroups = parseGroupBy(this.groupBy, this.results ?? undefined)
								.filter(g => !((g.type === 'context' && g.context.type === 'label') || (g.type === 'metadata' && g.metadata.type === 'span-attribute')));
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
			debugLogCat('results', 'search results', data);
			this.error = null;
			this.request = null;
			this.cancel = null;

			// Jesse (glosses): hier ook een keer de page hits in de gloss store updaten
			const get_hit_id = GlossModule.get.settings()?.get_hit_id;
			if (BLTypes.isHitResults(data) && get_hit_id) {
				GlossModule.actions.setCurrentPage(data.hits.map(get_hit_id));
			}

			this.results = data;
			this.paginationResults = data;
		},
		setError(data: Api.ApiError, isGrouped?: boolean) {
			if (data.title !== 'Request cancelled') { // TODO
				debugLogCat('results', 'Request failed: ', data);
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
		},
		changeViewGroup(groupId: string, groupDisplay: string) {
			this.restoreOnViewGroupLeave = {page: this.page, sort: this.sort};
			this.viewGroup = groupId;
			this._viewGroupName = groupDisplay;
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
		groupDisplayMode: {
			get(): string|null { return this.store.getState().groupDisplayMode; },
			set(v: string|null) { this.store.actions.groupDisplayMode(v); }
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
			return this.id !== 'hits' || isHitParams(RootStore.get.blacklabParameters());
		},
		// simple view variables
		indexId(): string { return INDEX_ID; },

		isHits(): boolean { return BLTypes.isHitResults(this.results); },
		isDocs(): boolean { return BLTypes.isDocResults(this.results); },
		isGroups(): boolean { return BLTypes.isGroups(this.results); },
		isParallelCorpus: CorpusStore.get.isParallelCorpus,

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
				const groupByLabel = parseGroupBy(this.groupBy, this.results ?? undefined).map(g => humanizeGroupBy(this, g, CorpusStore.get.allAnnotationsMap(), CorpusStore.get.allMetadataFieldsMap())).join(', ')
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
			if (!this.results || !this.cols || !this.rows || !this.renderDisplaySettings) return undefined;
			return {
				cols: this.cols,
				rows: this.rows,
				info: this.renderDisplaySettings,

				query: this.results.summary.searchParam,
				type: this.id,
				sort: this.sort,
				disabled: !!this.request
			};
		},

		commonDisplaySettings(): DisplaySettingsCommon {
			const summaryOtherFields = this.results?.summary.pattern?.otherFields ?? [];
			return {
				dir: CorpusStore.get.textDirection(),
				i18n: this,
				specialFields: CorpusStore.getState().corpus!.fieldInfo,
				targetFields: summaryOtherFields.map(name => CorpusStore.get.parallelAnnotatedFieldsMap()[name])
			}
		},
		rowDisplaySettings(): DisplaySettingsForRows {
			return {
				...this.commonDisplaySettings,
				getSummary: UIStore.getState().results.shared.getDocumentSummary,
				sourceField: QueryStore.get.sourceField()!, // if no field, there would be no results...
				getCustomHitInfo: UIStore.corpusCustomizations.results.customHitInfo,
			}
		},
		columnDisplaySettings(): DisplaySettingsForColumns {
			return {
				...this.commonDisplaySettings,
				groupDisplayMode: this.groupDisplayMode as any || (BLTypes.isHitGroups(this.results) ? 'hits' : 'docs'),
				mainAnnotation: CorpusStore.get.allAnnotationsMap()[this.concordanceAnnotationId],
				// If groups, don't show any metadata columns.
				metadata: 	this.isHits ? UIStore.getState().results.hits.shownMetadataIds.map(id => CorpusStore.get.allMetadataFieldsMap()[id]) :
							this.isDocs ? UIStore.getState().results.docs.shownMetadataIds.map(id => CorpusStore.get.allMetadataFieldsMap()[id]) : [],

				// If groups, don't show any annotation columns.
				otherAnnotations: this.isHits ? UIStore.getState().results.hits.shownAnnotationIds.map(id => CorpusStore.get.allAnnotationsMap()[id]) : [],
				sortableAnnotations: UIStore.getState().results.shared.sortAnnotationIds.map(id => CorpusStore.get.allAnnotationsMap()[id]),
				hasCustomHitInfoColumn: UIStore.corpusCustomizations.results.hasCustomHitInfoColumn,
			}
		},
		renderDisplaySettings(): DisplaySettingsForRendering {
			return {
				...this.rowDisplaySettings,
				...this.columnDisplaySettings,
				// Don't show details table in expanded rows when showing groups or hits in docs.
				detailedAnnotations: this.isHits ? UIStore.getState().results.shared.detailedAnnotationIds?.map(id => CorpusStore.get.allAnnotationsMap()[id]) ?? CorpusStore.get.allAnnotations().filter(a => !a.isInternal && a.hasForwardIndex) : [],
				depTreeAnnotations: Object.fromEntries(Object.entries(UIStore.getState().results.shared.dependencies).map(([key, id]) => [key, id && CorpusStore.get.allAnnotationsMap()[id]])) as any,
				defaultGroupName: this.$t('results.groupBy.groupNameWithoutValue').toString(),
				html: UIStore.getState().results.shared.concordanceAsHtml,
			}
		},

		cols(): ColumnDefs|null { return this.results && makeColumns(this.results, this.columnDisplaySettings); },
		rows(): Rows|null { return this.results && makeRows(this.results, this.rowDisplaySettings); },
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


.results-container {
	position: relative;
}

.result-totals {
	background: white;
	padding: 8px 8px 0 15px;
	flex: none;
}

.result-buttons-layout {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	margin: 10px 0;
	gap: 10px;
}



</style>
