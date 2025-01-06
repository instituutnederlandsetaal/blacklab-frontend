<template>
	<div class="container article">
		<ul id="articleTabs" class="nav nav-tabs cf-panel-tab-header cf-panel-lg">
			<li class="active"><a href="#content" data-toggle="tab">Content</a></li>
			<li><a href="#metadata" data-toggle="tab">Metadata</a></li>
			<li v-if="statisticsEnabled"><a href="#statistics" data-toggle="tab">Statistics</a></li>
		</ul>
		<div class="tab-content cf-panel-tab-body cf-panel-lg" style="padding-top: 35px;">
			<div id="content" class="tab-pane active">
				<!-- <ArticlePagePagination/> -->
				<ArticlePageParallel/>

				<Spinner v-if="isLoading(contents)" />

				<div v-if="isLoaded(contents)" v-html="contents.value"></div>
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
							<!-- TODO: i18n -->
							<tr v-if="!isEmpty(hits)"><td>Hits in document:</td><td>
								<Spinner v-if="isLoading(hits)" inline sm/>
								<template v-else-if="isLoaded(hits)">{{hits.value.length}}</template>
							</td></tr>

							<template v-for="g in metadataFieldsToShow">
								<tr><td colspan="2"><b>{{ $tMetaGroupName(g) }} <debug>[{{g}}]</debug>:</b></td></tr>
								<tr v-for="f in g.entries">
									<td style="padding-left: 0.5em">{{ $tMetaDisplayName(f) }}<debug> [{{ f.id }}]</debug></td>
									<td>{{ metadata.value!.docInfo[f.id] }}</td>
								</tr>
							</template>
							<!-- TODO: i18n -->
							<tr><td>Document length (tokens)</td><td id="docLengthTokens">{{ metadata.value!.docInfo.tokenCounts!.find(tc => tc.fieldName === inputs.viewField)?.tokenCount }}</td></tr>
						</tbody>
					</table>
				</template>
			</div>

			<div id="statistics" class="tab-pane" v-if="statisticsEnabled">
				<ArticlePageStatistics/>
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
import ArticlePageParallel from '@/pages/article/ArticlePageParallel.vue';

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

import {Empty, isEmpty, Loadable, Loading, metadata$, contents$, input$, hits$, Input, isLoading, isLoaded, isError} from './article';
import { fieldSubset } from '@/utils';
import { Subscription } from 'rxjs';

export default Vue.extend({
	components: {
		ArticlePageStatistics,
		ArticlePagePagination,
		ArticlePageParallel
	},
	data: () => ({
		metadata: Empty() as Loadable<BLTypes.BLDocument>,
		contents: Empty() as Loadable<String>,
		hits: Empty() as Loadable<[number, number][]>,

		subscriptions: [] as Subscription[]
	}),
	computed: {
		metadataFieldsToShow(): ReturnType<typeof fieldSubset<AppTypes.NormalizedMetadataField>> {
			return fieldSubset(UIStore.getState().results.shared.detailedMetadataIds || Object.keys(CorpusStore.get.allMetadataFieldsMap), CorpusStore.get.metadataGroups(), CorpusStore.get.allMetadataFieldsMap())
		},

		statisticsEnabled: ArticleStore.get.statisticsEnabled,
		isParallel: CorpusStore.get.isParallelCorpus,

		viewField(): AppTypes.NormalizedAnnotatedField|undefined {
			return CorpusStore.get.allAnnotatedFieldsMap()[this.inputs.viewField!];
		},
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
		}
	},
	methods: {
		isLoading,
		isLoaded,
		isError,
		isEmpty
	},
	watch: {
		inputs: {
			handler: function(v) { input$.next(v); },
			immediate: true,
			deep: true
		},
	},
	created() {
		this.subscriptions.push(
			metadata$.subscribe({next: v => this.metadata = v}),
			contents$.subscribe({next: v => this.contents = v}),
			hits$.subscribe({next: v => this.hits = v}),
		);
	},
	destroyed() {
		this.subscriptions.forEach(s => s.unsubscribe());
	},
});

</script>

<style lang="scss">

</style>
