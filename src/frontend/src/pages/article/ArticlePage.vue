<template>
	<!-- TODO: i18n -->
	<div class="container article">
		<template v-for="(value, key) in {contents, metadata, hits, hitToHighlight, validPaginationInfo, snippetAndDocument}">
			<details>
				<summary>{{ key }}</summary>
				<pre>{{ stringifyWithHtml(value) }}</pre>
			</details>
		</template>
		{{ {statisticsEnabled} }}
		<!-- {{ JSON.stringify({...$data, subs: undefined}, undefined, 2) }} -->

		<div class="article-pagination" title="Hold to drag" ref="pagination">
			<template v-if="validPaginationInfo.isLoaded()">
				<div class="pagination-container">
					<label>Page</label>
					<div class="pagination-wrapper">
						<Pagination
							:page="validPaginationInfo.value.page"
							:maxPage="validPaginationInfo.value.maxPage"
							:editable="false"
							:showOffsets="false"
							@change="handlePageNavigation"
						/>
					</div>
				</div>
				<hr v-if="!hitToHighlight.isEmpty()"/>
			</template>

			<div v-if="hitToHighlight.isLoaded()" class="pagination-container">
				<label>Hit</label>
				<div class="pagination-wrapper">
					<Pagination
						:page="hitToHighlight.value.hitIndexToHighlight"
						:maxPage="hitToHighlight.value.totalHits-1"
						:editable="false"
						:showOffsets="false"
						@change="hits.isLoaded() ? handleHitNavigation(hits.value[$event][0]) : void 0"
					/>
				</div>
			</div>
			<template v-else-if="hitToHighlight.isLoading()">
				<Spinner size="20"/>
				<label>Loading hits...</label>
			</template>
			<template v-else-if="hitToHighlight.isError()">
				<label>Error loading hits</label>
			</template>
		</div>

		<ul id="articleTabs" class="nav nav-tabs cf-panel-tab-header cf-panel-lg">
			<li class="active"><a href="#content" data-toggle="tab">Content</a></li>
			<li><a href="#metadata" data-toggle="tab">Metadata</a></li>
			<li v-if="statisticsEnabled"><a href="#statistics" data-toggle="tab">Statistics</a></li>
		</ul>
		<div class="tab-content cf-panel-tab-body cf-panel-lg" style="padding-top: 35px;">
			<div id="content" class="tab-pane active">
				<Spinner v-if="contents.isLoading()" />
				<div v-else-if="contents.isError()">
					<a class="btn btn-primary" role="button" data-toggle="collapse" href="#content_error" aria-expanded="false" aria-controls="content_error">
						Click here to see errors
					</a><br>
					<div class="collapse" id="content_error">
						<div class="well" style="overflow: auto; max-height: 300px; white-space: pre-line;">
							{{ contents.error.message }}
						</div>
					</div>
				</div>
				<InstancedHtml v-if="contents.isLoaded()" :value="contents.value.container"/>
			</div>


			<div id="metadata" class="tab-pane">
				<Spinner v-if="metadata.isLoading()" />
				<div v-if="metadata.isError()">
					<a class="btn btn-primary" role="button" data-toggle="collapse" href="#metadata_error" aria-expanded="false" aria-controls="metadata_error">
						Click here to see errors
					</a><br>
					<div class="collapse" id="metadata_error">
						<div class="well" style="overflow: auto; max-height: 300px; white-space: pre-line;">
							{{ metadata.error.message }}
						</div>
					</div>
				</div>
				<template v-else-if="metadata.isLoaded()">
					<h2 v-if="metadata.value.docFields.titleField" style="word-break:break-all;">
						{{ metadata.value.docInfo[metadata.value.docFields.titleField]?.join(', ') || $t('results.groupBy.groupNameWithoutValue') }}
						<template v-if="isParallel">{{ viewField ? $tAnnotatedFieldDisplayName(viewField) : 'Error: missing viewfield.' }}</template>
					</h2>

					<table class="table-striped">
						<tbody>
							<tr v-if="!hits.isEmpty()"><td>Hits in document:</td><td>
								<Spinner v-if="hits.isLoading()" inline sm/>
								<template v-else-if="hits.isLoaded()">{{hits.value.length}}</template>
							</td></tr>

							<template v-for="g in metadataFieldsToShow">
								<tr><td colspan="2"><b>{{ $tMetaGroupName(g) }} <debug>[{{g.id}}]</debug>:</b></td></tr>
								<tr v-for="f in g.entries">
									<td style="padding-left: 0.5em">{{ $tMetaDisplayName(f) }}<debug> [{{ f.id }}]</debug></td>
									<td>
										<template v-if="metadata.value.docInfo[f.id]?.length">{{ metadata.value.docInfo[f.id].join(', ')}}</template>
										<em v-else class="text-muted">{{$t('results.groupBy.groupNameWithoutValue')}}</em>
									</td>
								</tr>
							</template>
							<tr><td>Document length (tokens)</td><td id="docLengthTokens">{{ metadata.value.docInfo.tokenCounts?.find(tc => tc.fieldName === inputs.viewField)?.tokenCount }}</td></tr>
						</tbody>
					</table>
				</template>
			</div>

			<div id="statistics" class="tab-pane" v-if="statisticsEnabled">
				<Spinner v-if="snippetAndDocument.isLoading()" />
				<ArticlePageStatistics v-else-if="snippetAndDocument.isLoaded()" :snippet="snippetAndDocument.value[0]"/>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as ArticleStore from '@/store/article';
import * as QueryStore from '@/store/query';
import * as CorpusStore from '@/store/corpus';
import * as UIStore from '@/store/ui';


import * as AppTypes from '@/types/apptypes';

import ArticlePageStatistics from '@/pages/article/ArticlePageStatistics.vue';
// import ArticlePagePagination from '@/pages/article/ArticlePagePagination.vue';
// import ArticlePageParallel from '@/pages/article/ArticlePageParallel.vue';
import Pagination from '@/components/Pagination.vue';
import Spinner from '@/components/Spinner.vue';
import InstancedHtml from '@/components/InstancedHtml.vue';

import 'jquery-ui';
import 'jquery-ui/ui/widgets/draggable';

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


function _preventClicks(e: Event) {
	e.preventDefault();
	e.stopPropagation();
	return false;
}

import {input$, contents$, hitToHighlight$, hits$, metadata$, Input, validPaginationParameters$, snippetAndDocument$} from './article';
import { fieldSubset } from '@/utils';
import { L, LoadableFromStream } from '@/utils/loadable-streams';
import { Observable } from 'rxjs';

// Hmm... this could use some work. This is a little convoluted just to get a synchronous type
type HitToHighlightLoadable = typeof hitToHighlight$ extends Observable<infer U> ? U : never;
type HitToHighlight = L.Val<HitToHighlightLoadable>;

export default Vue.extend({
	components: {
		Spinner,
		ArticlePageStatistics,
		// ArticlePagePagination,
		// ArticlePageParallel,
		Pagination,
		InstancedHtml
	},
	data: () => ({
		metadata: new LoadableFromStream(metadata$),
		contents: new LoadableFromStream(contents$),
		hits: new LoadableFromStream(hits$),
		hitToHighlight: new LoadableFromStream(hitToHighlight$),
		validPaginationInfo: new LoadableFromStream(validPaginationParameters$),
		snippetAndDocument: new LoadableFromStream(snippetAndDocument$),
	}),
	computed: {
		inputs(): Input {
			return {
				indexId: CorpusStore.get.indexId()!,
				docId: ArticleStore.getState().docId,

				viewField: ArticleStore.getState().viewField,
				searchField: QueryStore.get.annotatedFieldName() || CorpusStore.get.mainAnnotatedField(),

				wordstart: ArticleStore.get.wordstart(),
				wordend: ArticleStore.get.wordend(),
				pageSize: ArticleStore.get.pageSize(),
				findhit: ArticleStore.get.findhit(),
				patt: QueryStore.get.patternString(),
				pattgapdata: QueryStore.getState().gap?.value,
			}
		},

		metadataFieldsToShow(): ReturnType<typeof fieldSubset<AppTypes.NormalizedMetadataField>> {
			return fieldSubset(UIStore.getState().results.shared.detailedMetadataIds || Object.keys(CorpusStore.get.allMetadataFieldsMap()), CorpusStore.get.metadataGroups(), CorpusStore.get.allMetadataFieldsMap())
		},

		statisticsEnabled: ArticleStore.get.statisticsEnabled,
		isParallel: CorpusStore.get.isParallelCorpus,

		viewField(): AppTypes.NormalizedAnnotatedField|undefined {
			return CorpusStore.get.allAnnotatedFieldsMap()[this.inputs.viewField!];
		},
	},
	methods: {
		stringifyWithHtml(v: any): string {
			return JSON.stringify(v, (key, value) => {
				if (value instanceof HTMLElement) return `<${value.tagName}/>`;
				return value;
			}, 2);
		},
		handlePageNavigation(page: number) {
			if (!this.validPaginationInfo.isLoaded()) return;
			ArticleStore.actions.page({
				wordstart: page * this.validPaginationInfo.value.pageSize,
				wordend: (page + 1) * this.validPaginationInfo.value.pageSize,
			});
		},
		handleHitNavigation(hitStart: number) {
			ArticleStore.actions.findhit(hitStart);
		},
	},
	watch: {
		inputs: {
			handler: function(v) { input$.next(v); },
			immediate: true,
		},
		'hitToHighlight.value': {
			immediate: true,
			handler(cur: HitToHighlight, prev?: HitToHighlight) {
				prev?.hl?.classList.remove('active');
				cur?.hl?.classList.add('active');
			}
		}
	},
	mounted() {
		if (this.$refs.pagination instanceof HTMLElement && this.$refs.pagination.nodeType === 1) { // sometimes it's a comment if our top v-if is false.
			//@ts-ignore
			$(this.$refs.pagination).draggable();
		}
	},
	destroyed() {
		this.metadata.dispose();
		this.contents.dispose();
		this.hits.dispose();
		this.hitToHighlight.dispose();
		this.validPaginationInfo.dispose();
		this.snippetAndDocument.dispose();
	},
});

</script>

<style lang="scss">
.article-pagination {
	&:not([style]) {
		top: 10%;
		right: 10%
	}
	position: fixed;
	z-index: 1000;
	border: 1px solid #ccc;
	background: white;
	box-shadow:  0px 3px 12px -2px rgba(0,0,0,0.6);
	border-radius: 3px;

	padding: 5px;

	> hr {
		margin: 5px 0;
	}

	>.pagination-container {
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

		>.pagination-wrapper {
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
