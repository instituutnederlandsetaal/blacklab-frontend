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
				<Pagination slot="pagination"
					:page="pagination.shownPage"
					:page2="pagination.shownPage2"
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
				:showTitles="showTitles.value"
				:disabled="!!request"
				:query="results?.summary.searchParam"
				:sort="sort"

				@changeSort="sort = (sort === $event ? `-${sort}` : $event)"
				@viewgroup="changeViewGroup"
			/>

			<div class="result-buttons-layout" style="border-top: 1px solid #ccc; padding-top: 15px;">
				<Pagination
					style="display: block;"

					:page="pagination.shownPage"
					:page2="pagination.shownPage2"
					:maxPage="pagination.maxShownPage"
					:disabled="!!request"
					
					@change="page = $event"
				/>
				<div style="flex-grow: 1;"></div>

				<button v-if="isHits"
					type="button"
					class="btn btn-primary btn-sm show-titles"

					@click="showTitles.value = !showTitles.value"
				>
					{{showTitles.value ? $t('results.table.hide') : $t('results.table.show')}} {{ $t('results.table.titles') }}
				</button>

				<Sort
					v-model="sort"
					:hits="isHits"
					:docs="isDocs"
					:groups="isGroups"
					:parallelCorpus="isParallelCorpus"

					:corpus="corpus"
					:annotations="sortAnnotations"
					:annotationGroupLabels="sortAnnotationLabels"
					:metadata="sortMetadata"
					:metadataGroupLabels="sortMetadataLabels"

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
		<div v-else-if="error != null" class="no-results-found">
			<span class="fa fa-exclamation-triangle text-danger"></span><br>
			<div style="text-align: initial;">{{error}}</div>
			<button type="button" class="btn btn-default" :title="$t('results.resultsView.tryAgainTitle').toString()" @click="markDirty();">{{ $t('results.resultsView.tryAgain') }}</button>
		</div>
		<div v-else-if="!valid" class="no-results-found">
			{{ $t('results.resultsView.inactiveView') }}
		</div>
		<div v-else-if="results" class="no-results-found">{{ $t('results.resultsView.noResultsFound') }}</div>
		<!-- Allow the user to clear grouping or pagination if something's wrong. -->
		<div v-if="!request && !(resultComponentData && cols && renderDisplaySettings)">
			<GroupBy v-if="groupBy.length"
				:type="id"
				:results="results"
				:disabled="!!request"
			/>
			<Pagination v-if="pagination.shownPage != 0"
				style="display: block;"

				:page="pagination.shownPage"
				:page2="pagination.shownPage2"
				:maxPage="pagination.maxShownPage"
				:disabled="!!request"

				@change="page = $event"
			/>

		</div>
	</div>
</template>

<script lang="ts">
import Vue, { markRaw, onDeactivated } from 'vue';

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
import { NormalizedIndex } from '@/types/apptypes';
import { humanizeGroupByOrSortBy, humanizeSerializedGroupBy, parseGroupBy, parseSortBy, serializeSortByOrGroupBy } from '@/utils/grouping';
import { TranslateResult } from 'vue-i18n';
import { ColumnDefs, DisplaySettingsCommon, DisplaySettingsForColumns, DisplaySettingsForRendering, DisplaySettingsForRows, makeColumns, makeRows, Rows } from '@/pages/search/results/table/table-layout';
import { isHitParams } from '@/utils';


import '@/pages/search/results/table/GenericTable.vue';
import { corpusCustomizations } from '@/utils/customization';
import { localStorageSynced } from '@/utils/localstore';

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

		/** When no longer viewing contents of a group, restore the result range and sorting (i.e. user's position in the results). */
		restoreOnViewGroupLeave: null as null|{
			first: number;
			number: number;
			sort: string|null;
		},
		showTitles: localStorageSynced('cf/results/showTitles', true),

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

			// If we're querying a parallel corpus, and no sort was chosen yet,
			// sort by alignments (so aligned hits appear first).
			const viewModule = ResultsStore.getOrCreateModule('hits');
			if (this.id === 'hits' && (this.groupBy.length === 0 || this.viewGroup) && CorpusStore.get.isParallelCorpus() && viewModule.getState().sort === null) {
				viewModule.actions.sort('alignments');
			}

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
							const newGroupBy = serializeSortByOrGroupBy(okayGroups);
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

			this.results = markRaw(data);
			this.paginationResults = markRaw(data);
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
			if (this.restoreOnViewGroupLeave) {
				this.store.actions.range({
					first: this.restoreOnViewGroupLeave.first,
					number: this.restoreOnViewGroupLeave.number
				});
				this.sort = this.restoreOnViewGroupLeave.sort;
			} else {
				this.store.actions.range({ first: 0, number: GlobalStore.getState().pageSize });
				this.sort = null;
			}
			this.restoreOnViewGroupLeave = null;
		},
		changeViewGroup(groupId: string, groupDisplay: string) {
			if (this.request) return;
			const viewState = this.store.getState();
			this.restoreOnViewGroupLeave = {
				first: viewState.first,
				number: viewState.number,
				sort: this.sort
			};
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
			get(): number { return 0; /** page is not always a singular clean number */ },
			set(v: number) { this.store.actions.range({first: v * this.pageSize, number: this.pageSize});  }
		},
		sort: {
			get(): string|null { return this.store.getState().sort; },
			set(v: string|null) { if (!this.request) this.store.actions.sort(v); }
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
		sortAnnotationLabels(): boolean { return UIStore.getState().dropdowns.sortBy.annotationGroupLabelsVisible; },
		sortMetadata(): string[] { return UIStore.getState().results.shared.sortMetadataIds; },
		sortMetadataLabels(): boolean { return UIStore.getState().dropdowns.sortBy.metadataGroupLabelsVisible; },
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

		/** When these change, the form has been resubmitted, so we need to initiate a scroll event */
		querySettings() { return QueryStore.getState(); },

		pageSize(): number { return GlobalStore.getState().pageSize; },
		/**
		 * Pagination state for the current view.
		 * 
		 * Three cases for the shown range [first, first+number):
		 * 1. Exact page: first % pageSize == 0 && number == pageSize
		 *    -> Single page active, no range highlighting needed
		 * 2. Span fits in 1 page: floor(first/pageSize) == floor((first+number-1)/pageSize)
		 *    -> Single page active (the page containing the span)
		 * 3. Span crosses pages: startPage != endPage
		 *    -> Multiple pages active, highlight the range
		 */
		pagination(): {
			/** The primary page to show as current (first page of the shown range) */
			shownPage: number,
			shownPage2?: number,
			/** Maximum page number available */
			maxShownPage: number,
		} {
			// Take care to use this.results for page size, but this.paginationResults for total number of results.
			// This is because pagination results are requested with a window size of 0!
			if (!this.results || !this.paginationResults) {
				return {
					shownPage: 0,
					maxShownPage: 0,
				};
			}

			const pageSize = GlobalStore.getState().pageSize;
			const { first, number } = this.store.getState();
			const last = first + number - 1;

			// Calculate which pages the shown span overlaps
			const startPage = Math.floor(first / pageSize);
			const endPage = Math.floor(last / pageSize);

			// Check if this is an exact page (aligned to page boundaries)
			const isExactPage = (first % pageSize === 0) && (number === pageSize);

			const totalResults =
				BLTypes.isGroups(this.paginationResults) ? this.paginationResults.summary.numberOfGroups :
				BLTypes.isHitResults(this.paginationResults) ? this.paginationResults.summary.numberOfHitsRetrieved :
				this.paginationResults.summary.numberOfDocsRetrieved;

			// Calculate max page (subtract one if exactly divisible to avoid empty last page)
			const maxPage = Math.max(0, Math.floor((totalResults - 1) / pageSize));

			// Determine range highlighting:
			// - If exact page: no range highlighting needed (null values)
			// - If span fits in 1 page (startPage == endPage but not exact): still show as single active page
			// - If span crosses pages: highlight the range
			const showRange = !isExactPage && startPage !== endPage;

			return {
				shownPage: startPage,
				shownPage2: showRange ? endPage : undefined,
				maxShownPage: Math.max(maxPage, startPage),
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
			onClick?: () => void
		}> {
			// Labels and titles might look confusing
			// but, the label is what the uses is currently looking at
			// the title is what they will look at if they click the link
			// e.g. hits -> grouped by -> specific group -> sample
			// if clicking hits -> go to hits
			// if clicking grouped by -> go to grouped results
			// if clicking specific group -> go to specific group

			const r: {
				label: TranslateResult,
				title: TranslateResult,
				onClick?: () => void,
				deactivate: (() => void)|undefined,
				toggle?: () => void,
			}[] = [];

			r.push({
				label: this.id === 'hits' ? this.$t('results.resultsView.navigation.hits') : this.$t('results.resultsView.navigation.documents'),
				title: this.$t('results.resultsView.navigation.backToUngroupedResults').toString(),
				deactivate: undefined,
			});
			if (this.groupBy.length > 0) {
				r.push({
					label: this.$t('results.resultsView.navigation.groupedBy', {group: humanizeSerializedGroupBy(this, this.groupBy, CorpusStore.get.allAnnotationsMap(), CorpusStore.get.allMetadataFieldsMap()).join(', ')}),
					title: this.$t('results.resultsView.navigation.backToGroupedResults'),
					deactivate: () => { this.groupBy = []; }
				});
			}
			if (this.viewGroup != null) {
				r.push({
					label: this.$t('results.resultsView.navigation.viewingGroup', {group: this.viewGroupName}),
					title: '',
					deactivate: () => this.leaveViewgroup(),
				});
			}
			const {sampleMode, sampleSize} = GlobalStore.getState();
			if (sampleSize != null) {
				r.push({
					label: this.$t('results.resultsView.navigation.randomSample', {sample: `${sampleSize}${sampleMode === 'percentage' ? '%' : ''}`}),
					title: '',
					deactivate: () => { GlobalStore.actions.sampleSize(null); }
				})
			}
			if (this.sort) {
				r.push({
					label: this.$t('results.resultsView.navigation.sortedBy', {sort: humanizeGroupByOrSortBy(this, parseSortBy(this.sort), CorpusStore.get.allAnnotationsMap(), CorpusStore.get.allMetadataFieldsMap())}),
					title: '',
					deactivate: () => this.sort = null,
					toggle: () => {
						this.sort = this.sort?.startsWith('-') ? this.sort!.substring(1) : '-' + this.sort!;
					}
				})
			}

			// Clicking a breadcrumb deactivates all breadcrumbs after it.
			// So we set up the onClick handlers here.
			// If a breadcrumb has a toggle() function, and it's the last one, call the toggle instead (onClick takes precedence).
			for (let i = 0; i < r.length; i++) {
				const entry = r[i];
				const isLast = (i === r.length - 1);
				
				if (!isLast) {
					entry.onClick = () => {
						for (let j = r.length -1; j > i; j--) {
							r[j].deactivate?.();
						}
					}
				} else if (entry.toggle) {
					entry.onClick = entry.toggle;
				}
			}

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
			if (!this.results || !this.cols || !this.rows?.rows.length || !this.renderDisplaySettings) return undefined;
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
				targetFields: summaryOtherFields.map(name => CorpusStore.get.parallelAnnotatedFieldsMap()[name]),
				first: this.results?.summary.windowFirstResult ?? 0,
				number: this.results?.summary.actualWindowSize ?? 0,
				pageSize: this.pageSize
			}
		},
		rowDisplaySettings(): DisplaySettingsForRows {
			return {
				...this.commonDisplaySettings,
				getSummary: UIStore.getState().results.shared.getDocumentSummary,
				sourceField: QueryStore.get.sourceField()!, // if no field, there would be no results...
				getCustomHitInfo: corpusCustomizations.results.customHitInfo,
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
				annotationGroups: CorpusStore.get.annotationGroups(),
				hasCustomHitInfoColumn: corpusCustomizations.results.hasCustomHitInfoColumn,
			}
		},
		renderDisplaySettings(): DisplaySettingsForRendering {
			const allAnnotationsMap = CorpusStore.get.allAnnotationsMap();
			return {
				...this.rowDisplaySettings,
				...this.columnDisplaySettings,
				// Don't show details table in expanded rows when showing groups or hits in docs.
				detailedAnnotations: this.isHits ? UIStore.getState().results.shared.detailedAnnotationIds?.map(id => allAnnotationsMap[id]) ?? CorpusStore.get.allAnnotations().filter(a => !a.isInternal && a.hasForwardIndex) : [],
				depTreeAnnotations: Object.fromEntries(Object.entries(UIStore.getState().results.shared.dependencies).map(([key, id]) => [
					key,
					Array.isArray(id) ? id.map(i => allAnnotationsMap[i]) : id ? allAnnotationsMap[id] : null
				])) as any, 
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
