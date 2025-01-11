<template>
	<!-- TODO: i18n -->
	<div class="container article">


		<template v-for="(value, key) in {...$data, subs: undefined}">
			<details>
				<summary>{{ key }}</summary>
				<pre>{{ JSON.stringify(value, undefined, 2) }}</pre>
			</details>
		</template>
		{{ {statisticsEnabled} }}
		<!-- {{ JSON.stringify({...$data, subs: undefined}, undefined, 2) }} -->


		<div class="article-pagination" title="Hold to drag" ref="pagination">
			<template v-if="isLoaded(validPaginationInfo)">
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
				<hr v-if="!isEmpty(hitToHighlight)"/>
			</template>

			<div v-if="isLoaded(hitToHighlight)" class="pagination-container">
				<label>Hit</label>
				<div class="pagination-wrapper">
					<Pagination
						:page="hitToHighlight.value.hitIndexToHighlight"
						:maxPage="hitToHighlight.value.totalHits"
						:editable="false"
						:showOffsets="false"
						@change="handleHitNavigation"/>
				</div>
			</div>
			<template v-else-if="isLoading(hitToHighlight)">
				<Spinner size="20"/>
				<label>Loading hits...</label>
			</template>
			<template v-else-if="isError(hitToHighlight)">
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
				<Spinner v-if="isLoading(contents)" />
				<div v-else-if="isError(contents)">
					<a class="btn btn-primary" role="button" data-toggle="collapse" href="#content_error" aria-expanded="false" aria-controls="content_error">
						Click here to see errors
					</a><br>
					<div class="collapse" id="content_error">
						<div class="well" style="overflow: auto; max-height: 300px; white-space: pre-line;">
							{{ contents.error.message }}
						</div>
					</div>
				</div>
				<div ref="contents"></div>
			</div>


			<div id="metadata" class="tab-pane">
				<Spinner v-if="isLoading(metadata)" />
				<div v-if="isError(metadata)">
					<a class="btn btn-primary" role="button" data-toggle="collapse" href="#metadata_error" aria-expanded="false" aria-controls="metadata_error">
						Click here to see errors
					</a><br>
					<div class="collapse" id="metadata_error">
						<div class="well" style="overflow: auto; max-height: 300px; white-space: pre-line;">
							{{ metadata.error.message }}
						</div>
					</div>
				</div>
				<template v-else-if="isLoaded(metadata)">
					<h2 v-if="metadata.value.docFields.titleField" style="word-break:break-all;">
						{{ metadata.value.docInfo[metadata.value.docFields.titleField] }}
						<template v-if="isParallel">{{ viewField ? $tAnnotatedFieldDisplayName(viewField) : 'Error: missing viewfield.' }}</template>
					</h2>

					<table class="table-striped">
						<tbody>
							<tr v-if="!isEmpty(hits)"><td>Hits in document:</td><td>
								<Spinner v-if="isLoading(hits)" inline sm/>
								<template v-else-if="isLoaded(hits)">{{hits.value.length}}</template>
							</td></tr>

							<template v-for="g in metadataFieldsToShow">
								<tr><td colspan="2"><b>{{ $tMetaGroupName(g) }} <debug>[{{g}}]</debug>:</b></td></tr>
								<tr v-for="f in g.entries">
									<td style="padding-left: 0.5em">{{ $tMetaDisplayName(f) }}<debug> [{{ f.id }}]</debug></td>
									<td>{{ metadata.value.docInfo[f.id] }}</td>
								</tr>
							</template>
							<tr><td>Document length (tokens)</td><td id="docLengthTokens">{{ metadata.value.docInfo.tokenCounts?.find(tc => tc.fieldName === inputs.viewField)?.tokenCount }}</td></tr>
						</tbody>
					</table>
				</template>
			</div>

			<div id="statistics" class="tab-pane" v-if="statisticsEnabled">
				<Spinner v-if="isLoading(snippetAndDocument)" />
				<ArticlePageStatistics v-else-if="isLoaded(snippetAndDocument)" :snippet="snippetAndDocument.value[0]"/>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import Vue, { ref } from 'vue';

import * as ArticleStore from '@/store/article';
import * as QueryStore from '@/store/query';
import * as CorpusStore from '@/store/corpus';
import * as UIStore from '@/store/ui';

import {blacklab, Canceler, frontend} from '@/api';

import * as BLTypes from '@/types/blacklabtypes';
import * as AppTypes from '@/types/apptypes';

import ArticlePageStatistics from '@/pages/article/ArticlePageStatistics.vue';
// import ArticlePagePagination from '@/pages/article/ArticlePagePagination.vue';
// import ArticlePageParallel from '@/pages/article/ArticlePageParallel.vue';
import Pagination, {PaginationInfo} from '@/components/Pagination.vue';
import Spinner from '@/components/Spinner.vue';


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

import {inputsFromStore$, contents$, hitToHighlight$, correctionsForStore$, hits$, metadata$, Input, validPaginationParameters$, snippetAndDocument$} from './article';
import { fieldSubset } from '@/utils';
import { Observable, Subscription } from 'rxjs';
import { Empty, isEmpty, isError, isLoadable, isLoaded, isLoading, Loadable, loadableFromObservable, LoadableState, Loaded, LoadingError } from '@/utils/loadable-streams';

export default Vue.extend({
	components: {
		Spinner,
		ArticlePageStatistics,
		// ArticlePagePagination,
		// ArticlePageParallel,
		Pagination
	},
	data: () => {
		const subs: Subscription[] = [];
		return {
			subs,
			metadata: loadableFromObservable(metadata$, subs),
			contents: loadableFromObservable(contents$, subs),
			hits: loadableFromObservable(hits$, subs),
			hitToHighlight: loadableFromObservable(hitToHighlight$, subs),
			validPaginationInfo: loadableFromObservable(validPaginationParameters$, subs),
			snippetAndDocument: loadableFromObservable(snippetAndDocument$, subs)
		}
	},
	computed: {
		inputs(): Input {
			return {
				indexId: CorpusStore.getState().corpus?.id,
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
			return fieldSubset(UIStore.getState().results.shared.detailedMetadataIds || Object.keys(CorpusStore.get.allMetadataFieldsMap), CorpusStore.get.metadataGroups(), CorpusStore.get.allMetadataFieldsMap())
		},

		statisticsEnabled: ArticleStore.get.statisticsEnabled,
		isParallel: CorpusStore.get.isParallelCorpus,

		viewField(): AppTypes.NormalizedAnnotatedField|undefined {
			return CorpusStore.get.allAnnotatedFieldsMap()[this.inputs.viewField!];
		},

		contentAndContainer(): {content: HTMLElement|undefined, container: HTMLElement|undefined} {
			return {
				content: isLoaded(this.contents) ? this.contents.value.container : undefined,
				container: this.$refs.contents as HTMLElement
			}
		}
	},
	methods: {
		isLoading,isLoaded,isError,isEmpty,
		handlePageNavigation(page: number) {
			if (!isLoaded(this.validPaginationInfo)) return;
			ArticleStore.actions.page({
				wordstart: page * this.validPaginationInfo.value.pageSize,
				wordend: (page + 1) * this.validPaginationInfo.value.pageSize,
			});
		},
		handleHitNavigation(hitIndex: number) {
			ArticleStore.actions.findhit(hitIndex);
		},
	},
	watch: {
		inputs: {
			handler: function(v) { inputsFromStore$.next(v); },
			immediate: true,
			deep: true
		},
		contentAndContainer: {
			handler: function({content, container}: {content: HTMLElement|undefined, container: HTMLElement|undefined}) {
				if (container) {
					container.innerHTML = '';
					if (content) container.appendChild(content);
				}
			},
			immediate: true,
			deep: false
		},
	},
	mounted() {
		if (this.$refs.pagination instanceof HTMLElement && this.$refs.pagination.nodeType === 1) { // sometimes it's a comment if our top v-if is false.
			//@ts-ignore
			$(this.$refs.pagination).draggable();
		}
	},
	// updated() {
	// },
	// Corrections maybe don't matter?
	// created() {
	// 	this.subs.push(inputsFromStore$.subscribe(v => {
	// 		const cur = this.inputs;
	// 		if (v.wordstart || v.wordend) {
	// 			ArticleStore.actions.page({
	// 				wordstart: v.wordstart! ?? cur.wordstart!,
	// 				wordend: v.wordend! ?? cur.wordend!,
	// 			});
	// 		}
	// 		if (v.findhit) ArticleStore.actions.findhit(v.findhit);
	// 		if (v.)

	// 	}));
	// },
	destroyed() {
		this.subs.forEach(s => s.unsubscribe());
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
</style>
