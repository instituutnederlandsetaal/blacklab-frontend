<template>
	<div ref="root" class="results-container" :disabled="request" :style="{ minHeight: request ? '100px' : undefined }">
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

<script setup lang="ts">
import { computed, markRaw, ref, watch } from 'vue';

import * as RootStore from '@/app/state/root-store';
import { useCorpus } from '@/app/state/useCorpusContext';
import { useCustomizations } from '@/customization-api/internal/internal-api';
import * as QueryStore from '@/features/search/model/query-state';
import * as GlobalStore from '@/features/search/model/results/global-results-state';
import type { GroupDisplayMode } from '@/features/search/model/results/result-types';
import * as ResultsStore from '@/features/search/model/results/view-state';
import type { DisplaySettingsForRendering } from '@/pages/search/results/table/table-layout';
import { makeColumns, makeRows } from '@/pages/search/results/table/table-layout';
import type { NormalizedAnnotation } from '@/types/apptypes';
import * as BLTypes from '@/types/blacklabtypes';
import { humanizeGroupByOrSortBy, humanizeSerializedGroupBy, parseGroupBy, parseSortBy, serializeSortByOrGroupBy } from '@/utils/grouping';

import { useBlackLabApi } from '@/shared/api';
import type { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';
import { getSearchParameters, getTotalAvailableResults } from '@/shared/blacklab-helpers/normalize/result-helpers';
import { debugLog } from '@/shared/debug/debug';
import { useI18n } from '@/shared/i18n';
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

/**
 * In our case, always 'hits' or 'docs', we don't support adding another ResultsView tab with a different ID.
 * Since we use this ID to determine whether we're getting hits or docs from BlackLab, rendering and logic can depend on it as well.
 */
const { id, active, store } = defineProps<{
	id: 'hits' | 'docs';
	active: boolean;
	store: ResultsStore.ViewModule;
}>();

const customizations = useCustomizations();
const blacklab = useBlackLabApi();
const corpus = useCorpus();
const translate = useI18n();
const root = ref<HTMLElement | null>(null);
const isDirty = ref(true);
const request = ref<CancelableRequest<BLTypes.BLSearchResult> | null>(null);
const results = ref<BLTypes.BLSearchResult | null>(null);
const error = ref<string | null>(null);
const storedViewGroupName = ref<string | null>(null);
const paginationResults = ref<BLTypes.BLSearchResult | null>(null);
// Should we scroll when next results arrive - set when main form submitted
const scroll = ref(true);
// Should we clear the results when we begin the next request? - set when main form is submitted.
const clearResults = ref(false);
/** When no longer viewing contents of a group, restore the result range and sorting (i.e. user's position in the results). */
const restoreOnViewGroupLeave = ref<{ first: number; number: number; sort: string | null } | null>(null);
const showTitles = localStorageSynced('cf/results/showTitles', true);

const groupBy = computed({
	get: () => store.getState().groupBy,
	set: (value: string[]) => store.actions.groupBy(value),
});
const pageSize = computed(() => GlobalStore.getState().pageSize);
const page = computed({
	get: () => 0, // page is not always a singular clean number
	set: (value: number) => store.actions.range({ first: value * pageSize.value, number: pageSize.value }),
});
const sort = computed({
	get: () => store.getState().sort,
	set: (value: string | null) => {
		if (!request.value) store.actions.sort(value);
	},
});
const viewGroup = computed({
	get: () => store.getState().viewGroup,
	set: (value: string | null) => store.actions.viewGroup(value),
});
const groupDisplayMode = computed({
	get: () => store.getState().groupDisplayMode,
	set: (value: GroupDisplayMode | null) => store.actions.groupDisplayMode(value),
});
const sourceAnnotatedFieldId = computed(QueryStore.get.sourceField);
const concordanceAnnotationOptions = computed<NormalizedAnnotation[]>(() => customizations.resultConcordanceAnnotationIdOptions().map(id => corpus.value.allAnnotationsMap[id]));
const concordanceAnnotationId = computed({
	get: customizations.resultConcordanceAnnotationId,
	set: customizations.setResultConcordanceAnnotationId,
});
const sortAnnotations = computed(customizations.resultSortAnnotationIds);
const sortAnnotationLabels = computed(customizations.resultSortAnnotationLabelsVisible);
const sortMetadata = computed(customizations.resultSortMetadataIds);
const sortMetadataLabels = computed(customizations.resultSortMetadataLabelsVisible);
const exportAnnotations = computed(customizations.resultDetailedAnnotationIds);
const exportMetadata = computed(customizations.resultDetailedMetadataIds);
const exportEnabled = computed(customizations.resultExportEnabled);

// Refresh only when the request sent to BlackLab changes. The submitted form snapshot also contains
// presentation data (localized summaries and encoded form state), none of which changes the result set.
const refreshParameters = computed(() => stableStringify(RootStore.get.blacklabParameters()));
/** When these change, the form has been resubmitted, so we need to initiate a scroll event */
const querySettings = computed(QueryStore.getState);

const valid = computed(() => id !== 'hits' || BLTypes.isHitParams(RootStore.get.blacklabParameters()));
const loadedResults = computed(() => results.value!);
const indexId = computed(() => corpus.value.id!);
const isHits = computed(() => !!results.value && BLTypes.isHitResults(results.value));
const isDocs = computed(() => !!results.value && BLTypes.isDocResults(results.value));
const isGroups = computed(() => !!results.value && BLTypes.isGroups(results.value));
const isParallelCorpus = computed(() => corpus.value.isParallelCorpus);

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
const pagination = computed(() => {
	// Use results for page size, but paginationResults for the total because pagination results are requested with a window size of 0.
	if (!results.value || !paginationResults.value) return { shownPage: 0, maxShownPage: 0 };

	const { first, number } = store.getState();
	const startPage = Math.floor(first / pageSize.value);
	const endPage = Math.floor((first + number - 1) / pageSize.value);
	const isExactPage = first % pageSize.value === 0 && number === pageSize.value;
	const totalResults = getTotalAvailableResults(paginationResults.value);
	const maxPage = Math.max(0, Math.floor((totalResults - 1) / pageSize.value));

	return {
		shownPage: startPage,
		shownPage2: !isExactPage && startPage !== endPage ? endPage : undefined,
		maxShownPage: Math.max(maxPage, startPage),
	};
});

function scrollToResults() {
	if (!scroll.value || !root.value) return;
	scroll.value = false;
	window.scroll({ behavior: 'smooth', top: root.value.offsetTop - 150 });
}

function setSuccess(data: BLTypes.BLSearchResult) {
	debugLog('results', 'search results', data);
	clearResults.value = false;
	error.value = null;
	request.value = null;
	results.value = markRaw(data);
	paginationResults.value = markRaw(data);
}

function setError(data: ApiError, isGrouped?: boolean) {
	if (!data.isCancelledRequest) {
		debugLog('results', 'Request failed: ', data);
		error.value = customizations.formatError(data, isGrouped ? 'groups' : id);
		results.value = null;
		paginationResults.value = null;
		clearResults.value = false;
	}
	request.value = null;
}

function refresh() {
	isDirty.value = false;
	debugLog('results', 'this is when the search should be refreshed');

	if (request.value) {
		debugLog('results', 'cancelling previous search request');
		request.value.cancel();
		request.value = null;
	}

	if (!valid.value) {
		results.value = null;
		paginationResults.value = null;
		error.value = null;
		clearResults.value = false;
		return;
	}

	if (clearResults.value) {
		results.value = error.value = null;
		clearResults.value = false;
	}

	const nonce = refreshParameters.value;

	// If we're querying a parallel corpus, and no sort was chosen yet, sort by alignments (so aligned hits appear first).
	const viewModule = ResultsStore.getOrCreateModule('hits');
	if (id === 'hits' && (groupBy.value.length === 0 || viewGroup.value) && corpus.value.isParallelCorpus && viewModule.getState().sort == null) viewModule.actions.sort('alignments');

	const params = RootStore.get.blacklabParameters()!;
	const axiosParams = { headers: { 'Cache-Control': 'no-cache' } };
	debugLog('results', 'starting search', id, params);
	const nextRequest = id === 'hits' ? blacklab.getHits(indexId.value, params, axiosParams) : blacklab.getDocs(indexId.value, params, axiosParams);
	request.value = nextRequest;
	setTimeout(scrollToResults, 1500);

	nextRequest
		.then(
			data => {
				if (nonce === refreshParameters.value) setSuccess(data);
			},
			(data: ApiError) => {
				if (nonce !== refreshParameters.value) return;
				// Grouping on a capture group that no longer exists can only be detected after the request.
				if (data.title === 'UNKNOWN_MATCH_INFO' && groupBy.value.length > 0) {
					debugLog('results', 'grouping failed, clearing groupBy');
					const okayGroups = parseGroupBy(groupBy.value, results.value ?? undefined).filter(
						group => !((group.type === 'context' && group.context.type === 'label') || (group.type === 'metadata' && group.metadata.type === 'span-attribute')),
					);
					groupBy.value = serializeSortByOrGroupBy(okayGroups);
				}
				setError(data, !!params.group);
			},
		)
		.finally(scrollToResults);
}

function markDirty() {
	isDirty.value = true;
	if (request.value) {
		debugLog('results', 'cancelling search request');
		request.value.cancel();
		request.value = null;
	}
	if (active) refresh();
}

function leaveViewgroup() {
	viewGroup.value = null;
	if (restoreOnViewGroupLeave.value) {
		store.actions.range(restoreOnViewGroupLeave.value);
		sort.value = restoreOnViewGroupLeave.value.sort;
	} else {
		store.actions.range({ first: 0, number: GlobalStore.getState().pageSize });
		sort.value = null;
	}
	restoreOnViewGroupLeave.value = null;
}

function changeViewGroup(groupId: string, groupDisplay: string) {
	if (request.value) return;
	const { first, number } = store.getState();
	restoreOnViewGroupLeave.value = { first, number, sort: sort.value };
	viewGroup.value = groupId;
	storedViewGroupName.value = groupDisplay;
}

const viewGroupName = computed(() => {
	if (viewGroup.value == null) return '';
	return storedViewGroupName.value ?? viewGroup.value.substring(viewGroup.value.indexOf(':') + 1);
});

type BreadCrumb = {
	label: string;
	title: string;
	onClick?: () => void;
	deactivate?: () => void;
	toggle?: () => void;
};
const breadCrumbs = computed<BreadCrumb[]>(() => {
	const crumbs: BreadCrumb[] = [
		{
			label: id === 'hits' ? translate.$t('results.resultsView.navigation.hits') : translate.$t('results.resultsView.navigation.documents'),
			title: translate.$t('results.resultsView.navigation.backToUngroupedResults'),
		},
	];
	if (groupBy.value.length > 0) {
		crumbs.push({
			label: translate.$t('results.resultsView.navigation.groupedBy', {
				group: humanizeSerializedGroupBy(translate, groupBy.value, corpus.value.allAnnotationsMap, corpus.value.allMetadataFieldsMap).join(', '),
			}),
			title: translate.$t('results.resultsView.navigation.backToGroupedResults'),
			deactivate: () => (groupBy.value = []),
		});
	}
	if (viewGroup.value != null) {
		crumbs.push({
			label: translate.$t('results.resultsView.navigation.viewingGroup', { group: viewGroupName.value }),
			title: '',
			deactivate: leaveViewgroup,
		});
	}
	const { sampleMode, sampleSize } = GlobalStore.getState();
	if (sampleSize != null) {
		crumbs.push({
			label: translate.$t('results.resultsView.navigation.randomSample', { sample: `${sampleSize}${sampleMode === 'percentage' ? '%' : ''}` }),
			title: '',
			deactivate: () => GlobalStore.actions.sampleSize(null),
		});
	}
	if (sort.value) {
		crumbs.push({
			label: translate.$t('results.resultsView.navigation.sortedBy', {
				sort: humanizeGroupByOrSortBy(translate, parseSortBy(sort.value), corpus.value.allAnnotationsMap, corpus.value.allMetadataFieldsMap),
			}),
			title: '',
			deactivate: () => (sort.value = null),
			toggle: () => (sort.value = sort.value?.startsWith('-') ? sort.value.substring(1) : '-' + sort.value),
		});
	}

	// Clicking a breadcrumb deactivates all breadcrumbs after it. The final sortable breadcrumb toggles instead.
	for (let i = 0; i < crumbs.length; i++) {
		const entry = crumbs[i];
		if (i < crumbs.length - 1)
			entry.onClick = () =>
				crumbs
					.slice(i + 1)
					.reverse()
					.forEach(crumb => crumb.deactivate?.());
		else if (entry.toggle) entry.onClick = entry.toggle;
	}
	return crumbs;
});

const renderDisplaySettings = computed<DisplaySettingsForRendering>(() => {
	const currentResults = results.value;
	const currentCorpus = corpus.value;
	const parsedSort = sort.value ? parseSortBy(sort.value, currentResults ?? undefined) : null;
	const sortAnnotationId = parsedSort?.type === 'context' ? parsedSort.annotation : undefined;
	const sortMetadataId = parsedSort?.type === 'metadata' && parsedSort.metadata.type === 'document' ? parsedSort.metadata.field : undefined;
	const shownAnnotationIds = isHits.value ? customizations.resultShownAnnotationIds() : [];
	const annotationIdsToShow = sortAnnotationId && !shownAnnotationIds.includes(sortAnnotationId) ? shownAnnotationIds.concat(sortAnnotationId) : shownAnnotationIds;
	const shownMetadataIds = isHits.value ? customizations.resultShownMetadataIds('hits') : isDocs.value ? customizations.resultShownMetadataIds('docs') : [];
	const metadataIdsToShow = sortMetadataId && !shownMetadataIds.includes(sortMetadataId) ? shownMetadataIds.concat(sortMetadataId) : shownMetadataIds;
	const dependencySettings = customizations.resultDependencies();
	const dependencyAnnotationIds = [
		...new Set([dependencySettings.lemma, dependencySettings.upos, dependencySettings.xpos, ...(dependencySettings.feats ?? [])].filter((annotationId): annotationId is string => !!annotationId)),
	];
	const { first, number, requestedRange } = store.getState();
	const allAnnotationsMap = currentCorpus.allAnnotationsMap;

	return {
		indexId: currentCorpus.id!,
		mainAnnotation: allAnnotationsMap[concordanceAnnotationId.value],
		otherAnnotations: annotationIdsToShow.map(annotationId => allAnnotationsMap[annotationId]),
		detailedAnnotations: isHits.value
			? (customizations.resultDetailedAnnotationIds()?.map(annotationId => allAnnotationsMap[annotationId]) ??
				currentCorpus.allAnnotations.filter(annotation => !annotation.isInternal && annotation.hasForwardIndex))
			: [],
		dependencyAnnotations: dependencyAnnotationIds.map(annotationId => allAnnotationsMap[annotationId]).filter((annotation): annotation is NormalizedAnnotation => !!annotation),
		dependencyRelationClass: dependencySettings.relationClass,
		sortableAnnotations: customizations.resultSortAnnotationIds().map(annotationId => allAnnotationsMap[annotationId]),
		annotationGroups: currentCorpus.annotationGroups,
		metadata: metadataIdsToShow.map(metadataId => currentCorpus.allMetadataFieldsMap[metadataId]),
		sourceField: currentCorpus.allAnnotatedFieldsMap[QueryStore.get.sourceField()],
		targetFields: (currentResults?.summary.pattern?.otherFields ?? []).map(name => currentCorpus.parallelAnnotatedFieldsMap[name]),
		specialFields: currentCorpus.fieldInfo,
		getSummary: customizations.resultDocumentSummary,
		dir: currentCorpus.textDirection,
		html: customizations.resultConcordanceAsHtml(),
		i18n: translate,
		groupDisplayMode: groupDisplayMode.value || (currentResults && BLTypes.isHitGroups(currentResults) ? 'hits' : 'docs'),
		hasCustomHitInfoColumn: (searchResults, parallelCorpus) =>
			BLTypes.isHitResults(searchResults) || BLTypes.isHitGroups(searchResults) ? customizations.hitInfoColumnVisible(searchResults, parallelCorpus) : false,
		getCustomHitInfo: (hit, field, document) => customizations.hitInfoColumnContent(hit, field, document, translate),
		getMatchInfoHighlightStyle: customizations.matchInfoHighlightStyle,
		pageSize: pageSize.value,
		first,
		number,
		requestedRange,
	};
});

const cols = computed(() => results.value && makeColumns(results.value, renderDisplaySettings.value));
const rows = computed(() => results.value && makeRows(results.value, renderDisplaySettings.value));
const resultComponentData = computed(() => {
	if (!results.value || !cols.value || !rows.value?.rows.length) return undefined;
	return { cols: cols.value, rows: rows.value, query: getSearchParameters(results.value), sort: sort.value };
});

watch(
	querySettings,
	() => {
		scroll.value = true;
		clearResults.value = true;
	},
	{ deep: true },
);
watch(refreshParameters, () => (active ? refresh() : markDirty()));
watch(
	() => active,
	value => {
		if (value && isDirty.value) refresh();
	},
	{ immediate: true },
);
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
