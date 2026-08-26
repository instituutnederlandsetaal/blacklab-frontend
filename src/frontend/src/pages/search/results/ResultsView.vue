<template>
	<div class="results-container" :disabled="request" :style="{ minHeight: request ? '100px' : undefined }">
		<Spinner v-if="request" overlay size="75" />

		<template v-if="resultComponentData && cols && renderDisplaySettings">
			<div class="crumbs-totals">
				<BreadCrumbs :crumbs="breadCrumbs" :disabled="!!request" />
				<Totals class="result-totals" :initialResults="loadedResults" :type="id" :indexId="indexId" :annotatedFieldId="sourceAnnotatedFieldId" @update="paginationResults = $event" />
			</div>

			<GroupBy v-if="!viewGroup" :type="id" :results="results" :disabled="!!request" />

			<div class="result-buttons-layout">
				<Pagination slot="pagination" :page="pagination.shownPage" :page2="pagination.shownPage2" :maxPage="pagination.maxShownPage" :disabled="!!request" @change="page = $event" />

				<div class="btn-group" v-if="isGroups" style="flex: none">
					<button
						v-for="option in cols.groupModeOptions"
						type="button"
						:class="['btn btn-default btn-sm', { active: renderDisplaySettings.groupDisplayMode === option }]"
						:key="option"
						@click="groupDisplayMode = option"
					>
						{{ option }}
					</button>
				</div>
				<button v-if="viewGroup" class="btn btn-sm btn-primary" @click="leaveViewgroup">
					<span class="fa fa-angle-double-left"></span> {{ $t('results.resultsView.navigation.backToGroupedResults') }}
				</button>

				<div style="flex-grow: 1"></div>
				<div v-if="concordanceAnnotationOptions.length > 1 && id === 'hits'">
					<label>{{ $t('results.resultsView.selectAnnotation') }}: </label>
					<div class="btn-group">
						<button
							v-for="a in concordanceAnnotationOptions"
							type="button"
							class="btn btn-default btn-sm"
							:class="{ active: a.id === concordanceAnnotationId }"
							@click="concordanceAnnotationId = a.id"
						>
							{{ $tAnnotDisplayName(a) }}
						</button>
					</div>
				</div>
			</div>

			<GenericTable
				:type="id"
				:class="isHits ? 'hits-table' : isDocs ? 'docs-table' : isGroups ? 'groups-table' : ''"
				:cols="resultComponentData.cols"
				:rows="resultComponentData.rows"
				:info="renderDisplaySettings"
				:header="isHits ? cols.hitColumns : isDocs ? cols.docColumns : cols.groupColumns"
				:showTitles="showTitles.value"
				:disabled="!!request"
				:query="resultComponentData.query"
				:sort="resultComponentData.sort"
				@changeSort="sort = sort === $event ? `-${sort}` : $event"
				@viewgroup="changeViewGroup"
			/>

			<div class="result-buttons-layout" style="border-top: 1px solid #ccc; padding-top: 15px">
				<Pagination style="display: block" :page="pagination.shownPage" :page2="pagination.shownPage2" :maxPage="pagination.maxShownPage" :disabled="!!request" @change="page = $event" />
				<div style="flex-grow: 1"></div>

				<button v-if="isHits" type="button" class="btn btn-primary btn-sm show-titles" @click="showTitles.value = !showTitles.value">
					{{ showTitles.value ? $t('results.table.hide') : $t('results.table.show') }} {{ $t('results.table.titles') }}
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

				<Export v-if="exportEnabled" :results="results" :type="id" :disabled="!!request" :annotations="exportAnnotations" :metadata="exportMetadata" />
			</div>
		</template>
		<div v-else-if="error != null" class="no-results-found">
			<span class="fa fa-exclamation-triangle text-danger"></span><br />
			<div style="text-align: initial">{{ error }}</div>
			<button type="button" class="btn btn-default" :title="$t('results.resultsView.tryAgainTitle').toString()" @click="markDirty()">{{ $t('results.resultsView.tryAgain') }}</button>
		</div>
		<div v-else-if="!valid" class="no-results-found">
			{{ $t('results.resultsView.inactiveView') }}
		</div>
		<div v-else-if="results" class="no-results-found">{{ $t('results.resultsView.noResultsFound') }}</div>
		<!-- Allow the user to clear grouping or pagination if something's wrong. -->
		<div v-if="!request && !(resultComponentData && cols && renderDisplaySettings)">
			<GroupBy v-if="groupBy.length" :type="id" :results="results" :disabled="!!request" />
			<Pagination
				v-if="pagination.shownPage != 0"
				style="display: block"
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
import { markRaw } from 'vue';
import type { PropType } from 'vue';
import { defineComponent } from 'vue';
import type { TranslateResult } from 'vue-i18n';

import * as RootStore from '@/app/state/root-store';
import { useCorpus } from '@/app/state/useCorpusContext';
import { useCustomizations } from '@/customization-api/internal/internal-api';
import * as QueryStore from '@/features/search/model/query-state';
import * as GlobalStore from '@/features/search/model/results/global-results-state';
import type { GroupDisplayMode } from '@/features/search/model/results/result-types';
import * as ResultsStore from '@/features/search/model/results/view-state';
import type { ColumnDefs, DisplaySettingsCommon, DisplaySettingsForColumns, DisplaySettingsForRendering, DisplaySettingsForRows, Rows } from '@/pages/search/results/table/table-layout';
import { makeColumns, makeRows } from '@/pages/search/results/table/table-layout';
import type { NormalizedAnnotation } from '@/types/apptypes';
import * as BLTypes from '@/types/blacklabtypes';
import { humanizeGroupByOrSortBy, humanizeSerializedGroupBy, parseGroupBy, parseSortBy, serializeSortByOrGroupBy } from '@/utils/grouping';

import { useBlackLabApi } from '@/shared/api';
import type { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';
import { getTotalAvailableResults, getSearchParameters } from '@/shared/blacklab-helpers/normalize/result-helpers';
import debug, { debugLog } from '@/shared/debug/debug';
import { localStorageSynced } from '@/shared/utils/localstore';
import { stableStringify } from '@/shared/utils/stable-stringify';

import BreadCrumbs from '@/pages/search/results/BreadCrumbs.vue';
import Export from '@/pages/search/results/Export.vue';
import GroupBy from '@/pages/search/results/groupby/GroupBy.vue';
import Totals from '@/pages/search/results/ResultTotals.vue';
import Sort from '@/pages/search/results/Sort.vue';
import GenericTable from '@/pages/search/results/table/GenericTable.vue';
import Pagination from '@/shared/ui/Pagination.vue';
import Spinner from '@/shared/ui/Spinner.vue';

export default defineComponent({
	components: {
		Pagination,
		Totals,
		GroupBy,
		Sort,
		BreadCrumbs,
		Export,
		Spinner,
		GenericTable,
	},
	props: {
		/**
		 * In our case, always 'hits' or 'docs', we don't support adding another ResultsView tab with a different ID.
		 * Since we use this ID to determine whether we're getting hits or docs from blacklab, and some rendering or logic may depend on it being 'hits' or 'docs' as well.
		 */
		id: { type: String as PropType<'hits' | 'docs'>, required: true },
		active: { type: Boolean, required: true },

		store: { type: Object as PropType<ResultsStore.ViewModule>, required: true },
	},
	data: () => ({
		customizations: useCustomizations(),
		isDirty: true, // since we don't have any results yet
		request: null as null | CancelableRequest<BLTypes.BLSearchResult>,
		results: null as null | BLTypes.BLSearchResult,
		error: null as null | string,

		storedViewGroupName: null as string | null,

		paginationResults: null as null | BLTypes.BLSearchResult,

		// Should we scroll when next results arrive - set when main form submitted
		scroll: true,
		// Should we clear the results when we begin the next request? - set when main form is submitted.
		clearResults: false,

		/** When no longer viewing contents of a group, restore the result range and sorting (i.e. user's position in the results). */
		restoreOnViewGroupLeave: null as null | {
			first: number;
			number: number;
			sort: string | null;
		},
		showTitles: localStorageSynced('cf/results/showTitles', true),

		debug,
		blacklab: useBlackLabApi(),
		corpus: useCorpus(),
	}),
	methods: {
		markDirty() {
			this.isDirty = true;
			if (this.request) {
				debugLog('results', 'cancelling search request');
				this.request.cancel();
				this.request = null;
			}
			if (this.active) {
				this.refresh();
			}
		},
		refresh() {
			this.isDirty = false;
			debugLog('results', 'this is when the search should be refreshed');

			if (this.request) {
				debugLog('results', 'cancelling previous search request');
				this.request.cancel();
				this.request = null;
			}

			if (!this.valid) {
				this.results = null;
				this.paginationResults = null;
				this.error = null;
				this.clearResults = false;
				return;
			}

			if (this.clearResults) {
				this.results = this.error = null;
				this.clearResults = false;
			}

			const nonce = this.refreshParameters;

			// If we're querying a parallel corpus, and no sort was chosen yet,
			// sort by alignments (so aligned hits appear first).
			const viewModule = ResultsStore.getOrCreateModule('hits');
			if (this.id === 'hits' && (this.groupBy.length === 0 || this.viewGroup) && this.corpus.isParallelCorpus && viewModule.getState().sort == null) {
				viewModule.actions.sort('alignments');
			}

			const params = RootStore.get.blacklabParameters()!;
			const axiosParams = { headers: { 'Cache-Control': 'no-cache' } };
			debugLog('results', 'starting search', this.id, params);
			const r = this.id === 'hits' ? this.blacklab.getHits(this.indexId, params, axiosParams) : this.blacklab.getDocs(this.indexId, params, axiosParams);
			this.request = r;

			setTimeout(() => this.scrollToResults(), 1500);

			r.then(
				r => {
					if (nonce === this.refreshParameters) this.setSuccess(r);
				},
				e => {
					if (nonce === this.refreshParameters) {
						// This happens when grouping on a capture group that no longer exists.
						// We can only detect it after trying to do so unfortunately.
						// (Blacklab does not return the group info when calling the parse query endpoint, so we can't check beforehand.)
						// We simply remove the offending grouping clause and try again.
						if (e.title === 'UNKNOWN_MATCH_INFO' && this.groupBy.length > 0) {
							// remove the group on label.
							debugLog('results', 'grouping failed, clearing groupBy');
							const okayGroups = parseGroupBy(this.groupBy, this.results ?? undefined).filter(
								g => !((g.type === 'context' && g.context.type === 'label') || (g.type === 'metadata' && g.metadata.type === 'span-attribute')),
							);
							const newGroupBy = serializeSortByOrGroupBy(okayGroups);
							this.groupBy = newGroupBy;
						}
						this.setError(e, !!params.group);
					}
				},
			).finally(() => this.scrollToResults());
		},
		setSuccess(data: BLTypes.BLSearchResult) {
			debugLog('results', 'search results', data);
			this.clearResults = false;
			this.error = null;
			this.request = null;
			this.results = markRaw(data);
			this.paginationResults = markRaw(data);
		},
		setError(data: ApiError, isGrouped?: boolean) {
			if (!data.isCancelledRequest) {
				debugLog('results', 'Request failed: ', data);
				this.error = this.customizations.formatError(data, isGrouped ? 'groups' : (this.id as 'hits' | 'docs'));
				this.results = null;
				this.paginationResults = null;
				this.clearResults = false;
			}
			this.request = null;
		},

		scrollToResults() {
			if (this.scroll) {
				this.scroll = false;
				window.scroll({
					behavior: 'smooth',
					top: (this.$el as HTMLElement).offsetTop - 150,
				});
			}
		},
		leaveViewgroup() {
			this.viewGroup = null;
			if (this.restoreOnViewGroupLeave) {
				this.store.actions.range({
					first: this.restoreOnViewGroupLeave.first,
					number: this.restoreOnViewGroupLeave.number,
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
				sort: this.sort,
			};
			this.viewGroup = groupId;
			this.storedViewGroupName = groupDisplay;
		},
	},
	computed: {
		groupBy: {
			get(): string[] {
				return this.store.getState().groupBy;
			},
			set(v: string[]) {
				this.store.actions.groupBy(v);
			},
		},
		page: {
			get(): number {
				return 0; /** page is not always a singular clean number */
			},
			set(v: number) {
				this.store.actions.range({ first: v * this.pageSize, number: this.pageSize });
			},
		},
		sort: {
			get(): string | null {
				return this.store.getState().sort;
			},
			set(v: string | null) {
				if (!this.request) this.store.actions.sort(v);
			},
		},
		viewGroup: {
			get(): string | null {
				return this.store.getState().viewGroup;
			},
			set(v: string | null) {
				this.store.actions.viewGroup(v);
			},
		},
		groupDisplayMode: {
			get(): GroupDisplayMode | null {
				return this.store.getState().groupDisplayMode;
			},
			set(v: GroupDisplayMode | null) {
				this.store.actions.groupDisplayMode(v);
			},
		},
		sourceAnnotatedFieldId(): string {
			return QueryStore.get.sourceField();
		},
		concordanceAnnotationOptions(): NormalizedAnnotation[] {
			return this.customizations.resultConcordanceAnnotationIdOptions().map(id => this.corpus.allAnnotationsMap[id]);
		},
		concordanceAnnotationId: {
			get(): string {
				return this.customizations.resultConcordanceAnnotationId();
			},
			set(v: string) {
				this.customizations.setResultConcordanceAnnotationId(v);
			},
		},

		sortAnnotations(): string[] {
			return this.customizations.resultSortAnnotationIds();
		},
		sortAnnotationLabels(): boolean {
			return this.customizations.resultSortAnnotationLabelsVisible();
		},
		sortMetadata(): string[] {
			return this.customizations.resultSortMetadataIds();
		},
		sortMetadataLabels(): boolean {
			return this.customizations.resultSortMetadataLabelsVisible();
		},
		exportAnnotations(): string[] | null {
			return this.customizations.resultDetailedAnnotationIds();
		},
		exportMetadata(): string[] | null {
			return this.customizations.resultDetailedMetadataIds();
		},

		exportEnabled(): boolean {
			return this.customizations.resultExportEnabled();
		},

		refreshParameters(): string {
			// Refresh only when the request sent to BlackLab changes. The submitted
			// form snapshot also contains presentation data (localized summaries and
			// encoded form state), none of which changes the result set.
			return stableStringify(RootStore.get.blacklabParameters());
		},

		/** When these change, the form has been resubmitted, so we need to initiate a scroll event */
		querySettings() {
			return QueryStore.getState();
		},

		pageSize(): number {
			return GlobalStore.getState().pageSize;
		},
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
			shownPage: number;
			shownPage2?: number;
			/** Maximum page number available */
			maxShownPage: number;
		} {
			// Take care to use this.results for page size, but this.paginationResults for total number of results.
			// This is because pagination results are requested with a window size of 0!
			if (!this.results || !this.paginationResults) {
				return {
					shownPage: 0,
					maxShownPage: 0,
				};
			}

			const pageSize = this.pageSize;
			const { first, number } = this.store.getState();
			const last = first + number - 1;

			// Calculate which pages the shown span overlaps
			const startPage = Math.floor(first / pageSize);
			const endPage = Math.floor(last / pageSize);

			// Check if this is an exact page (aligned to page boundaries)
			const isExactPage = first % pageSize === 0 && number === pageSize;

			const totalResults = getTotalAvailableResults(this.paginationResults);

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
			return this.id !== 'hits' || BLTypes.isHitParams(RootStore.get.blacklabParameters());
		},
		loadedResults(): BLTypes.BLSearchResult {
			return this.results!;
		},
		// simple view variables
		indexId(): string {
			return this.corpus.id!;
		},
		isHits(): boolean {
			return !!this.results && BLTypes.isHitResults(this.results);
		},
		isDocs(): boolean {
			return !!this.results && BLTypes.isDocResults(this.results);
		},
		isGroups(): boolean {
			return !!this.results && BLTypes.isGroups(this.results);
		},
		isParallelCorpus() {
			return this.corpus.isParallelCorpus;
		},

		viewGroupName(): string {
			if (this.viewGroup == null) {
				return '';
			}
			return this.storedViewGroupName ?? this.viewGroup.substring(this.viewGroup.indexOf(':') + 1) ?? this.$t('results.groupBy.groupNameWithoutValue').toString();
		},

		breadCrumbs(): Array<{
			label: TranslateResult;
			title: TranslateResult;
			onClick?: () => void;
		}> {
			// Labels and titles might look confusing
			// but, the label is what the uses is currently looking at
			// the title is what they will look at if they click the link
			// e.g. hits -> grouped by -> specific group -> sample
			// if clicking hits -> go to hits
			// if clicking grouped by -> go to grouped results
			// if clicking specific group -> go to specific group

			const r: {
				label: TranslateResult;
				title: TranslateResult;
				onClick?: () => void;
				deactivate: (() => void) | undefined;
				toggle?: () => void;
			}[] = [];

			r.push({
				label: this.id === 'hits' ? this.$t('results.resultsView.navigation.hits') : this.$t('results.resultsView.navigation.documents'),
				title: this.$t('results.resultsView.navigation.backToUngroupedResults').toString(),
				deactivate: undefined,
			});
			if (this.groupBy.length > 0) {
				r.push({
					label: this.$t('results.resultsView.navigation.groupedBy', {
						group: humanizeSerializedGroupBy(this, this.groupBy, this.corpus.allAnnotationsMap, this.corpus.allMetadataFieldsMap).join(', '),
					}),
					title: this.$t('results.resultsView.navigation.backToGroupedResults'),
					deactivate: () => {
						this.groupBy = [];
					},
				});
			}
			if (this.viewGroup != null) {
				r.push({
					label: this.$t('results.resultsView.navigation.viewingGroup', { group: this.viewGroupName }),
					title: '',
					deactivate: () => this.leaveViewgroup(),
				});
			}
			const { sampleMode, sampleSize } = GlobalStore.getState();
			if (sampleSize != null) {
				r.push({
					label: this.$t('results.resultsView.navigation.randomSample', { sample: `${sampleSize}${sampleMode === 'percentage' ? '%' : ''}` }),
					title: '',
					deactivate: () => {
						GlobalStore.actions.sampleSize(null);
					},
				});
			}
			if (this.sort) {
				r.push({
					label: this.$t('results.resultsView.navigation.sortedBy', {
						sort: humanizeGroupByOrSortBy(this, parseSortBy(this.sort), this.corpus.allAnnotationsMap, this.corpus.allMetadataFieldsMap),
					}),
					title: '',
					deactivate: () => (this.sort = null),
					toggle: () => {
						this.sort = this.sort?.startsWith('-') ? this.sort!.substring(1) : '-' + this.sort!;
					},
				});
			}

			// Clicking a breadcrumb deactivates all breadcrumbs after it.
			// So we set up the onClick handlers here.
			// If a breadcrumb has a toggle() function, and it's the last one, call the toggle instead (onClick takes precedence).
			for (let i = 0; i < r.length; i++) {
				const entry = r[i];
				const isLast = i === r.length - 1;

				if (!isLast) {
					entry.onClick = () => {
						for (let j = r.length - 1; j > i; j--) {
							r[j].deactivate?.();
						}
					};
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

		resultComponentData(): { cols: ColumnDefs; rows: Rows; info: DisplaySettingsForRendering; query: BLTypes.BLSearchParameters; type: string; sort: string | null; disabled: boolean } | undefined {
			if (!this.results || !this.cols || !this.rows?.rows.length || !this.renderDisplaySettings) return undefined;
			return {
				cols: this.cols,
				rows: this.rows,
				info: this.renderDisplaySettings,

				query: getSearchParameters(this.results),
				type: this.id,
				sort: this.sort,
				disabled: !!this.request,
			};
		},

		commonDisplaySettings(): DisplaySettingsCommon {
			const summary = this.results?.summary;
			const summaryOtherFields = summary?.pattern?.otherFields ?? [];
			const { first, number, requestedRange } = this.store.getState();
			return {
				dir: this.corpus.textDirection,
				i18n: this,
				specialFields: this.corpus.fieldInfo,
				targetFields: summaryOtherFields.map(name => this.corpus.parallelAnnotatedFieldsMap[name]),
				first,
				number,
				requestedRange,
				pageSize: this.pageSize,
			};
		},
		rowDisplaySettings(): DisplaySettingsForRows {
			return {
				...this.commonDisplaySettings,
				indexId: this.corpus.id!,
				getSummary: this.customizations.resultDocumentSummary,
				sourceField: this.corpus.allAnnotatedFieldsMap[QueryStore.get.sourceField()], // if no field, there would be no results...
				getCustomHitInfo: (hit, field, document) => this.customizations.hitInfoColumnContent(hit, field, document, this),
				getMatchInfoHighlightStyle: this.customizations.matchInfoHighlightStyle,
			};
		},
		columnDisplaySettings(): DisplaySettingsForColumns {
			// Parse sort to extract annotation or metadata field being sorted on
			const parsedSort = this.sort ? parseSortBy(this.sort, this.results ?? undefined) : null;
			const sortAnnotationId = parsedSort?.type === 'context' ? parsedSort.annotation : undefined;
			const sortMetadataId = parsedSort?.type === 'metadata' && parsedSort.metadata.type === 'document' ? parsedSort.metadata.field : undefined;

			// Get shown columns and append sort column if not already shown
			const shownAnnotationIds = this.isHits ? this.customizations.resultShownAnnotationIds() : [];
			const annotationIdsToShow = sortAnnotationId && !shownAnnotationIds.includes(sortAnnotationId) ? shownAnnotationIds.concat(sortAnnotationId) : shownAnnotationIds;

			const shownMetadataIds = this.isHits ? this.customizations.resultShownMetadataIds('hits') : this.isDocs ? this.customizations.resultShownMetadataIds('docs') : [];
			const metadataIdsToShow = sortMetadataId && !shownMetadataIds.includes(sortMetadataId) ? shownMetadataIds.concat(sortMetadataId) : shownMetadataIds;

			return {
				...this.commonDisplaySettings,
				groupDisplayMode: (this.groupDisplayMode as any) || (!!this.results && BLTypes.isHitGroups(this.results) ? 'hits' : 'docs'),
				mainAnnotation: this.corpus.allAnnotationsMap[this.concordanceAnnotationId],
				// If groups, don't show any metadata columns. Automatically append sort column if not already shown.
				metadata: metadataIdsToShow.map(id => this.corpus.allMetadataFieldsMap[id]),
				// If groups, don't show any annotation columns. Automatically append sort column if not already shown.
				otherAnnotations: annotationIdsToShow.map(id => this.corpus.allAnnotationsMap[id]),
				sortableAnnotations: this.customizations.resultSortAnnotationIds().map(id => this.corpus.allAnnotationsMap[id]),
				annotationGroups: this.corpus.annotationGroups,
				hasCustomHitInfoColumn: (results, isParallelCorpus) =>
					BLTypes.isHitResults(results) || BLTypes.isHitGroups(results) ? this.customizations.hitInfoColumnVisible(results, isParallelCorpus) : false,
			};
		},
		renderDisplaySettings(): DisplaySettingsForRendering {
			const allAnnotationsMap = this.corpus.allAnnotationsMap;
			const dependencySettings = this.customizations.resultDependencies();
			const dependencyAnnotationIds = [
				...new Set([dependencySettings.lemma, dependencySettings.upos, dependencySettings.xpos, ...(dependencySettings.feats ?? [])].filter((id): id is string => !!id)),
			];
			return {
				...this.rowDisplaySettings,
				...this.columnDisplaySettings,
				// Don't show details table in expanded rows when showing groups or hits in docs.
				detailedAnnotations: this.isHits
					? (this.customizations.resultDetailedAnnotationIds()?.map(id => allAnnotationsMap[id]) ?? this.corpus.allAnnotations.filter(a => !a.isInternal && a.hasForwardIndex))
					: [],
				dependencyAnnotations: dependencyAnnotationIds.map(id => allAnnotationsMap[id]).filter((annotation): annotation is NormalizedAnnotation => !!annotation),
				dependencyRelationClass: dependencySettings.relationClass,
				html: this.customizations.resultConcordanceAsHtml(),
			};
		},

		cols(): ColumnDefs | null {
			return this.results && makeColumns(this.results, this.columnDisplaySettings);
		},
		rows(): Rows | null {
			return this.results && makeRows(this.results, this.rowDisplaySettings);
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
			immediate: true,
		},
	},
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
