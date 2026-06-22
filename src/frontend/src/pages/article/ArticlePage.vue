<template>
	<!-- TODO: i18n -->
	<div class="container article" v-if="inputs">
		<UseDraggable>
			<div class="article-pagination" title="Hold to drag">
				<template v-if="validPaginationInfo.isLoaded()">
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
		</UseDraggable>

		<ul id="articleTabs" class="nav nav-tabs cf-panel-tab-header cf-panel-lg">
			<li :class="{ active: activeArticleTab === 'content' }"><a href="#content" @click.prevent="activeArticleTab = 'content'">Content</a></li>
			<li :class="{ active: activeArticleTab === 'metadata' }"><a href="#metadata" @click.prevent="activeArticleTab = 'metadata'">Metadata</a></li>
			<li v-if="statisticsEnabled" :class="{ active: activeArticleTab === 'statistics' }"><a href="#statistics" @click.prevent="activeArticleTab = 'statistics'">Statistics</a></li>
		</ul>
		<div class="tab-content cf-panel-tab-body cf-panel-lg" style="padding-top: 35px">
			<div id="content" class="tab-pane" :class="{ active: activeArticleTab === 'content' }">
				<h2 v-if="isParallel" style="word-break: break-all">{{ $tAnnotatedFieldDisplayName(viewField) }}</h2>
				<Spinner v-if="contents.isLoading()" />
				<div v-else-if="contents.isError()">
					<a class="btn btn-primary" role="button" data-toggle="collapse" href="#content_error" aria-expanded="false" aria-controls="content_error"> Click here to see errors </a><br />
					<div class="collapse" id="content_error">
						<div class="well" style="overflow: auto; max-height: 300px; white-space: pre-line">
							{{ contents.error.message }}
						</div>
					</div>
				</div>
				<InstancedHtml v-if="contents.isLoaded()" :value="contents.value.container" />
			</div>

			<div id="metadata" class="tab-pane" :class="{ active: activeArticleTab === 'metadata' }">
				<Spinner v-if="metadata.isLoading()" />
				<div v-if="metadata.isError()">
					<a class="btn btn-primary" role="button" data-toggle="collapse" href="#metadata_error" aria-expanded="false" aria-controls="metadata_error"> Click here to see errors </a><br />
					<div class="collapse" id="metadata_error">
						<div class="well" style="overflow: auto; max-height: 300px; white-space: pre-line">
							{{ metadata.error.message }}
						</div>
					</div>
				</div>
				<template v-if="metadata.isLoaded()">
					<h2 v-if="metadata.value.json.docFields.titleField" style="word-break: break-all">
						{{ metadata.value.json.docInfo[metadata.value.json.docFields.titleField]?.join(', ') || $t('results.groupBy.groupNameWithoutValue') }}
						<template v-if="isParallel">{{ viewField ? $tAnnotatedFieldDisplayName(viewField) : 'Error: missing viewfield.' }}</template>
					</h2>
					<InstancedHtml :value="metadata.value.html" />
				</template>

				<template v-else-if="metadata.isLoaded()">
					<table class="table-striped">
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
										<b
											>{{ $tMetaGroupName(g) }} <debug>[{{ g.id }}]</debug>:</b
										>
									</td>
								</tr>
								<tr v-for="f in g.entries">
									<td style="padding-left: 0.5em">
										{{ $tMetaDisplayName(f) }}<debug> [{{ f.id }}]</debug>
									</td>
									<td>
										<template v-if="metadata.value.json.docInfo[f.id]?.length">{{ metadata.value.json.docInfo[f.id].join(', ') }}</template>
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
import { UseDraggable } from '@vueuse/components';
import { computed, onUnmounted, ref, watch, watchEffect } from 'vue';
import { useRoute, useRouter, type LocationQueryRaw, type LocationQueryValue } from 'vue-router';

import * as UIStore from '@/app/state/ui-state';
import { useCfPageConfig } from '@/app/state/useCorpusContext';
import * as ArticleStore from '@/features/article/model/article-state';
import * as CorpusStore from '@/features/corpus/model/corpus-state';
import { useMarkPageBootstrapSettledWhen } from '@/navigation/page-bootstrap';
// TODO
// import initTooltips from '@/modules/expandable-tooltips';
// initTooltips({
// 	mode: 'attributes',
// 	contentAttribute: 'data-tooltip-content',
// 	previewAttribute: 'data-tooltip-preview'
// });
// initTooltips({
// 	mode: 'title',
// 	excludeAttributes: ['toggle', 'tooltip-content', 'tooltip-preview'],
// 	tooltippableSelector: '.word[data-toggle="tooltip"]'
// });
// issues with this page:
// data comes from all manner of places (store, url, etc)
// Need to fix url-parsing
import { fieldSubset } from '@/utils';

import { createArticleStreams } from './article';

import { useBlackLabApi, useFrontendApi } from '@/shared/api';
import { combineLoadableStreams, loadableFromStream } from '@/shared/utils/loadable/loadable-streams';

// import ArticlePagePagination from '@/pages/article/ArticlePagePagination.vue';
// import ArticlePageParallel from '@/pages/article/ArticlePageParallel.vue';
import InstancedHtml from '@/components/InstancedHtml.vue';
import Pagination from '@/components/Pagination.vue';
import Spinner from '@/components/Spinner.vue';
import ArticlePageStatistics from '@/pages/article/ArticlePageStatistics.vue';

const blacklab = useBlackLabApi();
const articleStreams = createArticleStreams(blacklab, useFrontendApi());
const { contents$, hitToHighlight$, hits$, input$, metadata$, validPaginationParameters$, currentPageSnippet$, retrieveSnippetToggle$ } = articleStreams;
const route = useRoute();
const router = useRouter();
const cfPageConfig = useCfPageConfig();
const activeArticleTab = ref<'content' | 'metadata' | 'statistics'>('content');

const metadata = loadableFromStream(metadata$);
const contents = loadableFromStream(contents$);
const hits = loadableFromStream(hits$);
const hitToHighlight = loadableFromStream(hitToHighlight$);
const validPaginationInfo = loadableFromStream(validPaginationParameters$);
const statistics = loadableFromStream(combineLoadableStreams([currentPageSnippet$, metadata$] as const));

watchEffect(() => retrieveSnippetToggle$.next(activeArticleTab.value === 'statistics' && statisticsEnabled.value));

const inputs = computed(() => {
	const annotatedFields = CorpusStore.get.allAnnotatedFieldsMap();
	const viewField = getAnnotatedFieldFromQuery('field') ?? CorpusStore.get.mainAnnotatedField();
	const searchfield = getAnnotatedFieldFromQuery('searchfield', 'searchField', 'field') ?? CorpusStore.get.mainAnnotatedField();

	return {
		indexId: CorpusStore.get.indexId(),
		docId: getRouteParamString(route.params.docId),

		viewField: annotatedFields[viewField] ? viewField : CorpusStore.get.mainAnnotatedField(),
		searchfield: annotatedFields[searchfield] ? searchfield : CorpusStore.get.mainAnnotatedField(),

		wordstart: getNumberFromQuery('wordstart'),
		wordend: getNumberFromQuery('wordend'),
		pageSize: cfPageConfig.value.pageSize,
		findhit: getNumberFromQuery('findhit'),
		patt: getStringFromQuery('patt') ?? getStringFromQuery('query'),
		pattgapdata: getStringFromQuery('pattgapdata'),
	};
});

const metadataFieldsToShow = computed(() =>
	fieldSubset(UIStore.getState().results.shared.detailedMetadataIds || Object.keys(CorpusStore.get.allMetadataFieldsMap()), CorpusStore.get.metadataGroups(), CorpusStore.get.allMetadataFieldsMap()),
);

const statisticsEnabled = computed(() => ArticleStore.get.statisticsEnabled());
const isParallel = computed(() => CorpusStore.get.isParallelCorpus());
const viewField = computed(() => CorpusStore.get.allAnnotatedFieldsMap()[inputs.value?.viewField ?? '']);

watchEffect(() => {
	if (!statisticsEnabled.value && activeArticleTab.value === 'statistics') activeArticleTab.value = 'content';
});

useMarkPageBootstrapSettledWhen(computed(() => (contents.isLoaded() || contents.isError()) && (metadata.isLoaded() || metadata.isError())));

function stringifyWithHtml(v: any): string {
	return JSON.stringify(
		v,
		(key, value) => {
			if (value instanceof HTMLElement) return `<${value.tagName}/>`;
			return value;
		},
		2,
	);
}
function handlePageNavigation(page: number) {
	if (!validPaginationInfo.isLoaded()) return;
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

function getRouteParamString(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function firstQueryValue(value: LocationQueryValue | LocationQueryValue[]): string | null {
	const raw = Array.isArray(value) ? value[0] : value;
	return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function getStringFromQuery(...keys: string[]): string | null {
	for (const key of keys) {
		const value = firstQueryValue(route.query[key]);
		if (value != null) return value;
	}
	return null;
}

function getNumberFromQuery(key: string): number | null {
	const value = getStringFromQuery(key);
	if (value == null) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

function getAnnotatedFieldFromQuery(...keys: string[]): string | null {
	const value = getStringFromQuery(...keys);
	return value && CorpusStore.get.allAnnotatedFieldsMap()[value] ? value : null;
}

function updateArticleQuery(patch: Record<string, string | number | null | undefined>) {
	const query: LocationQueryRaw = {
		...route.query,
	};

	for (const [key, value] of Object.entries(patch)) {
		if (value == null) delete query[key];
		else query[key] = String(value);
	}

	return router.push({ name: route.name ?? undefined, params: route.params, query });
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

onUnmounted(() => {
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
	&:not([style]) {
		top: 10%;
		right: 10%;
	}
	position: fixed;
	z-index: 1000;
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
</style>
