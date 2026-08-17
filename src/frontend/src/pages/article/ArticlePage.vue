<template>
	<!-- TODO: i18n -->
	<div class="container article" v-if="inputs">
		<div ref="article-pagination" title="Hold to drag" class="article-pagination" :style="paginationDraggable.style.value">
			<template v-if="validPaginationInfo.isLoaded() && validPaginationInfo.value.pageSize != null">
				<div class="pagination-container">
					<label>Page</label>
					<div class="pagination-wrapper">
						<Pagination showTotal :page="validPaginationInfo.value.page" :maxPage="validPaginationInfo.value.maxPage" :editable="false" :showOffsets="false" @change="handlePageNavigation" />
					</div>
				</div>
				<hr v-if="!hitToHighlight.isEmpty()" />
			</template>

			<div v-if="hitToHighlight.isLoaded()" class="pagination-container">
				<label>Hit</label>
				<div class="pagination-wrapper">
					<Pagination
						showTotal
						:page="hitToHighlight.value.hitIndexToHighlight"
						:page-active="hitToHighlight.value.isHitVisible"
						:maxPage="hitToHighlight.value.totalHits - 1"
						:editable="false"
						:showOffsets="false"
						@change="hits.isLoaded() ? handleHitNavigation(hits.value[$event][0]) : void 0"
						@active="scrollCurrentHitIntoView"
					/>
				</div>
			</div>
			<template v-else-if="hitToHighlight.isLoading()">
				<Spinner size="20" />
				<label>Loading hits...</label>
			</template>
			<template v-else-if="hitToHighlight.isError()">
				<label>Error loading hits</label>
			</template>
		</div>

		<ul id="articleTabs" class="nav nav-tabs cf-panel-tab-header cf-panel-lg">
			<li :class="{ active: activeArticleTab === 'content' }"><a href="#content" @click.prevent="activeArticleTab = 'content'">Content</a></li>
			<li :class="{ active: activeArticleTab === 'metadata' }"><a href="#metadata" @click.prevent="activeArticleTab = 'metadata'">Metadata</a></li>
			<li v-if="statisticsEnabled" :class="{ active: activeArticleTab === 'statistics' }"><a href="#statistics" @click.prevent="activeArticleTab = 'statistics'">Statistics</a></li>
		</ul>
		<div class="tab-content cf-panel-tab-body cf-panel-lg" style="padding-top: 35px">
			<div id="content" class="tab-pane" :class="{ active: activeArticleTab === 'content' }">
				<h2 v-if="isParallel" style="word-break: break-all">{{ $tAnnotatedFieldDisplayName(viewField) }}</h2>
				<HtmlRenderer :content="contentsHtml" @ready="scrollCurrentHitIntoView">
					<template #error="{ error }">
						<div class="alert alert-danger">Could not load document contents. {{ error.message }}</div>
						<Collapsible id="content_error" button-class="btn btn-default" label="Show full diagnostics">
							<div class="well" style="overflow: auto; max-height: 300px; white-space: pre-line">
								{{ errorDiagnostics(error) }}
							</div>
						</Collapsible>
					</template>
				</HtmlRenderer>
			</div>

			<div id="metadata" class="tab-pane" :class="{ active: activeArticleTab === 'metadata' }">
				<HtmlRenderer :content="metadataHtml">
					<template #error="{ error }">
						<div class="alert alert-danger">Could not load document metadata. {{ error.message }}</div>
						<Collapsible id="metadata_error" button-class="btn btn-default" label="Show full diagnostics">
							<div class="well" style="overflow: auto; max-height: 300px; white-space: pre-line">
								{{ errorDiagnostics(error) }}
							</div>
						</Collapsible>
					</template>
					<template #empty>
						<table v-if="metadata.isLoaded()" class="table-striped">
							<tbody>
								<tr v-if="!hits.isEmpty()">
									<td>Hits in document:</td>
									<td>
										<Spinner v-if="hits.isLoading()" inline sm />
										<template v-else-if="hits.isLoaded()">{{ hits.value.length }}</template>
									</td>
								</tr>

								<template v-for="g in metadataFieldsToShow">
									<tr>
										<td colspan="2">
											<b>
												{{ $tMetaGroupName(g) }}<debug> [{{ g.id }}]</debug>:
											</b>
										</td>
									</tr>
									<tr v-for="f in g.entries">
										<td style="padding-left: 0.5em">
											{{ $tMetaDisplayName(f) }}<debug> [{{ f.id }}]</debug>
										</td>
										<td>
											<template v-if="getMetadataFieldValues(metadata.value.json.docInfo, f.id)?.length">{{ getMetadataFieldValues(metadata.value.json.docInfo, f.id)?.join(', ') }}</template>
											<em v-else class="text-muted">{{ $t('results.groupBy.groupNameWithoutValue') }}</em>
										</td>
									</tr>
								</template>
								<tr>
									<td>Document length (tokens)</td>
									<td id="docLengthTokens">{{ metadata.value.json.docInfo.tokenCounts?.find(tc => tc.fieldName === inputs!.viewField)?.tokenCount }}</td>
								</tr>
							</tbody>
						</table>
					</template>
				</HtmlRenderer>
			</div>

			<div id="statistics" class="tab-pane" :class="{ active: activeArticleTab === 'statistics' }" v-if="statisticsEnabled && activeArticleTab === 'statistics'">
				<h4 v-if="!statisticsEnabled" class="text-muted text-center">
					<!-- TODO i18n -->
					<em>No statistics have been configured for this corpus.</em>
				</h4>
				<Spinner v-else-if="statistics.isLoading()" center size="60px" />
				<div v-else-if="statistics.isError()" class="text-center">
					<h3 class="text-danger">
						<em>{{ statistics.error.message }}</em>
					</h3>
					<br />
					<!-- TODO retry mechanic -->
					<!-- <button type="button" class="btn btn-lg btn-default" @click="error = null; load()">Retry</button> -->
				</div>

				<ArticlePageStatistics v-else-if="statistics.isLoaded()" :snippet="statistics.value[0]" :document="statistics.value[1].json" :is-paginated="cfPageConfig.pageSize != null" />
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useDraggable, useLocalStorage, useWindowSize } from '@vueuse/core';
import { computed, defineAsyncComponent, onUnmounted, ref, useTemplateRef, watch, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useCfPageConfig, useCorpus } from '@/app/state/useCorpusContext';
import { useCustomizations } from '@/customization-api/internal/internal-api';
import * as ArticleStore from '@/features/article/model/article-state';
import createTooltips, { type TooltipContext } from '@/modules/expandable-tooltips';
import { usePageBootstrap } from '@/navigation/page-bootstrap';
import { getMetadataFieldValues } from '@/types/blacklabtypes';
import { getAnnotatedFieldFromRouteQuery, getNumberFromRouteQuery, getRouteParamString, getStringFromRouteQuery, updateRouteQuery } from '@/url/route-query';

import { createArticleStreams, type Input } from './article';

import { useBlackLabApi, useFrontendApi } from '@/shared/api';
import type { ApiError } from '@/shared/api/lib/api-types';
import { fieldSubset } from '@/shared/blacklab-helpers/field-groups';
import { combineLoadableStreams, loadableFromStream } from '@/shared/utils/loadable/loadable-stream';
import { clamp } from '@/shared/utils/number-utils';

import Collapsible from '@/shared/ui/Collapsible.vue';
import HtmlRenderer from '@/shared/ui/HtmlRenderer.vue';
import Pagination from '@/shared/ui/Pagination.vue';
import Spinner from '@/shared/ui/Spinner.vue';

const ArticlePageStatistics = defineAsyncComponent(() => import('@/pages/article/ArticlePageStatistics.vue'));

const blacklab = useBlackLabApi();
const pageBootstrap = usePageBootstrap();
const articleStreams = createArticleStreams(blacklab, useFrontendApi());
const { contents$, hitToHighlight$, hits$, input$, metadata$, validPaginationParameters$, currentPageSnippet$, retrieveSnippetToggle$ } = articleStreams;
const route = useRoute();
const router = useRouter();
const cfPageConfig = useCfPageConfig();
const corpus = useCorpus();
const customizations = useCustomizations();
const activeArticleTab = ref<'content' | 'metadata' | 'statistics'>('content');

const metadata = loadableFromStream(metadata$);
const metadataHtml = metadata.map(m => m.html);

const contents = loadableFromStream(contents$);
const contentsHtml = contents.map(c => c.html);

const hits = loadableFromStream(hits$);
const hitToHighlight = loadableFromStream(hitToHighlight$);
const validPaginationInfo = loadableFromStream(validPaginationParameters$);
const statistics = loadableFromStream(combineLoadableStreams([currentPageSnippet$, metadata$] as const));

watchEffect(() => retrieveSnippetToggle$.next(activeArticleTab.value === 'statistics' && statisticsEnabled.value));

const inputs = computed<Input>(() => ({
	indexId: corpus.value.id,
	docId: getRouteParamString(route.params.docId),

	viewField: getAnnotatedFieldFromRouteQuery(route, corpus.value.allAnnotatedFieldsMap, 'field') ?? corpus.value.mainAnnotatedField,
	// we canonically use 'searchfield' nowadays, but we used to use field/searchField, so keep those as fallbacks for backwards compatibility
	searchfield: getAnnotatedFieldFromRouteQuery(route, corpus.value.allAnnotatedFieldsMap, 'searchfield', 'searchField', 'field') ?? corpus.value.mainAnnotatedField,

	wordstart: getNumberFromRouteQuery(route, 'wordstart'),
	wordend: getNumberFromRouteQuery(route, 'wordend'),
	pageSize: cfPageConfig.value.pageSize,
	findhit: getNumberFromRouteQuery(route, 'findhit'),
	patt: getStringFromRouteQuery(route, 'patt', 'query'),
	pattgapdata: getStringFromRouteQuery(route, 'pattgapdata'),
}));

const metadataFieldsToShow = computed(() =>
	fieldSubset(customizations.resultDetailedMetadataIds() || Object.keys(corpus.value.allMetadataFieldsMap), corpus.value.metadataGroups, corpus.value.allMetadataFieldsMap),
);

const statisticsEnabled = computed(() => ArticleStore.get.statisticsEnabled());
const isParallel = computed(() => corpus.value.isParallelCorpus);
const viewField = computed(() => corpus.value.allAnnotatedFieldsMap[inputs.value?.viewField ?? '']);

watchEffect(() => {
	if (!statisticsEnabled.value && activeArticleTab.value === 'statistics') activeArticleTab.value = 'content';
});

watchEffect(() => {
	if (contents.isLoaded() || contents.isError()) {
		pageBootstrap.markSettled();
	}
});

function handlePageNavigation(page: number) {
	if (!validPaginationInfo.isLoaded() || validPaginationInfo.value.pageSize == null) return;
	void updateArticleQuery({
		wordstart: page * validPaginationInfo.value.pageSize,
		wordend: (page + 1) * validPaginationInfo.value.pageSize,
		findhit: undefined,
	});
}
function handleHitNavigation(hitStart: number) {
	void updateArticleQuery({
		wordstart: undefined,
		wordend: undefined,
		findhit: hitStart,
	});
}
function scrollCurrentHitIntoView() {
	const hit = hitToHighlight.isLoaded() ? hitToHighlight.value.hl : null;
	if (!hit) return;

	activeArticleTab.value = 'content';
	window.requestAnimationFrame(() => hit.scrollIntoView({ block: 'center', behavior: 'smooth' }));
}

/** Prefer server diagnostics while keeping a readable fallback for the template. */
function errorDiagnostics(error: ApiError) {
	return error.diagnostics || error.message;
}

/** Bind article navigation updates to this page's current router and route. */
function updateArticleQuery(patch: Record<string, string | number | null | undefined>) {
	return updateRouteQuery(router, route, patch);
}

watch(
	inputs,
	v => {
		if (v) input$.next(v);
	},
	{ immediate: true, deep: true },
);
watch(
	() => hitToHighlight.value,
	(cur, prev) => {
		prev?.hl?.classList.remove('active');
		cur?.hl?.classList.add('active');
	},
	{ immediate: true },
);

const tooltipContext = ref<TooltipContext | null>(null);
watch(
	() => contents.value,
	c => {
		if (tooltipContext.value) {
			tooltipContext.value();
			tooltipContext.value = null;
		}
		if (c?.html) {
			tooltipContext.value = createTooltips({
				mode: 'attributes',
				contentAttribute: 'data-tooltip-content',
				previewAttribute: 'data-tooltip-preview',
			});
			createTooltips(
				{
					mode: 'title',
					excludeAttributes: ['toggle', 'tooltip-content', 'tooltip-preview'],
					tooltippableSelector: '.word[data-toggle="tooltip"]',
				},
				tooltipContext.value,
			);
		}
	},
	{ immediate: true },
);

const draggablePosition = useLocalStorage('article-page-pagination-screen-position', {
	x: Math.max(0, window.innerWidth * 0.9 - 150),
	y: window.innerHeight * 0.1,
});
const paginationDraggable = useDraggable(useTemplateRef('article-pagination'), {
	initialValue: useLocalStorage('article-page-pagination-screen-position', {
		x: Math.max(0, window.innerWidth * 0.9 - 150),
		y: window.innerHeight * 0.1,
	}),
});
const viewport = useWindowSize();
watchEffect(() => {
	paginationDraggable.x.value = draggablePosition.value.x = clamp(paginationDraggable.x.value, 0, viewport.width.value - 150);
	paginationDraggable.y.value = draggablePosition.value.y = clamp(paginationDraggable.y.value, 50, viewport.height.value - 50);
});

onUnmounted(() => {
	tooltipContext.value?.();
	metadata.stop();
	contents.stop();
	hits.stop();
	hitToHighlight.stop();
	validPaginationInfo.stop();
	statistics.stop();
});
</script>

<style lang="scss">
.article-pagination {
	position: fixed;
	z-index: 100;
	border: 1px solid #ccc;
	background: white;
	box-shadow: 0px 3px 12px -2px rgba(0, 0, 0, 0.6);
	border-radius: 3px;

	padding: 5px;

	> hr {
		margin: 5px 0;
	}

	> .pagination-container {
		display: flex;
		flex-direction: row;
		align-items: baseline;

		> label {
			margin: 0;
			flex: 0 auto;
			width: 5em;
			min-width: 5em;
			max-width: 5em;
		}

		> .pagination-wrapper {
			display: flex;
			justify-content: center;
			align-items: baseline;
			flex-wrap: nowrap;
			flex: 1 auto;
		}
	}
}

#articleTabs {
	position: sticky;
	top: 50px;
	z-index: 1;
}

.hl {
	--bg-color: #337ab7;

	font-weight: bold;
	background-color: hsl(from var(--bg-color) h min(s * 1.2, 100) 92.5);
	color: black;
	border-radius: 3px;
	padding: 0 2px;
	font-size: 105%;

	&.active {
		/*text-decoration: underline;*/

		text-shadow:
			-1px -1px 0 white,
			1px -1px 0 white,
			-1px 1px 0 white,
			1px 1px 0 white;
		color: black;
		background-color: var(--bg-color);
		box-shadow: 0 0 10px var(--bg-color);
	}
}

.word,
.tooltip-hover {
	// Defined in main.css in the main webapp
	font-family: 'Helvetica Neue', 'Helvetica', 'Arial,sans-serif', 'Inl vmnw wnt';
}
.tooltip-open {
	text-decoration: underline;
}
.tooltip-hover {
	box-shadow: 0px 1px 7px -1px rgba(0, 0, 0, 0.2);
}

.p,
.paragraph {
	display: block;
	margin: 0 0 10px;
}

// Metadata table
#metadata td,
#metadata th {
	vertical-align: top;
}

#content-title:empty {
	display: none !important;
}
</style>
