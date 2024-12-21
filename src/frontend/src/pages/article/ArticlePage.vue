<template>
	<div class="container article">
		<ul id="articleTabs" class="nav nav-tabs cf-panel-tab-header cf-panel-lg">
			<li class="active"><a href="#content" data-toggle="tab">Content</a></li>
			<li><a href="#metadata" data-toggle="tab">Metadata</a></li>
			<li><a href="#statistics" data-toggle="tab">Statistics</a></li>
		</ul>
		<div class="tab-content cf-panel-tab-body cf-panel-lg" style="padding-top: 35px;">
			<div id="content" class="tab-pane active">
				<ArticlePagePagination/>
				<ArticlePageParallel/>

				<div v-if="article_content" v-html="article_content"></div>
				<div v-else-if="article_content_error">
					<a class="btn btn-primary" role="button" data-toggle="collapse" href="#content_error" aria-expanded="false" aria-controls="content_error">
						Click here to see errors
					</a><br>
					<div class="collapse" id="content_error">
						<div class="well" style="overflow: auto; max-height: 300px; white-space: pre-line;">
							{{ article_content_error }}
						</div>
					</div>
				</div>
			</div>

			<div id="metadata" class="tab-pane #if($article_content_restricted) active #end">
				<div v-if="metadata_content" v-html="metadata_content"></div>
				<div v-else-if="metadata_content_error">
					<a class="btn btn-primary" role="button" data-toggle="collapse" href="#metadata_error" aria-expanded="false" aria-controls="content_error">
						Click here to see errors
					</a><br>
					<div class="collapse" id="metadata_error">
						<div class="well" style="overflow: auto; max-height: 300px; white-space: pre-line;">
							{{ metadata_content_error }}
						</div>
					</div>
				</div>
			</div>

			<div id="statistics" class="tab-pane">
				<ArticlePageStatistics/>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as ArticleStore from '@/store/article';
import * as QueryStore from '@/store/query';
import * as CorpusStore from '@/store/corpus';
import {blacklab, Canceler, frontend} from '@/api';

import * as BLTypes from '@/types/blacklabtypes';
import * as AppTypes from '@/types/apptypes';

import ArticlePageStatistics from '@/pages/article/ArticlePageStatistics.vue';
import ArticlePagePagination from '@/pages/article/ArticlePagePagination.vue';
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


function _preventClicks(e: Event) {
	e.preventDefault();
	e.stopPropagation();
	return false;
}

export default Vue.extend({
	components: {
		ArticlePageStatistics,
		ArticlePagePagination,
		ArticlePageParallel
	},
	data: () => ({
		article_request: null as null|Promise<string>,
		article_cancel: null as null|Canceler,
		article_content: '',
		article_content_error: null as null|string,

		metadata_content: '',
		metadata_content_error: null as null|string,
		metadata_request: null as null|Promise<string>,
		metadata_cancel: null as null|Canceler,

		// TODO: put in store instead of from url
		wordstart: Number(new URLSearchParams(window.location.search).get('wordstart')) || undefined,
		wordend: Number(new URLSearchParams(window.location.search).get('wordend')) || undefined,
	}),
	computed: {
		docIdFromRoute(): string|undefined { return this.$route.params.docId },
	},
	watch: {
		docIdFromRoute: {
			handler (cur, prev) {
				if (cur === prev) return;
				if (this.article_cancel) this.article_cancel();
				if (this.metadata_cancel) this.metadata_cancel();
				this.article_cancel = null;
				this.metadata_cancel = null;
				this.article_request = null;
				this.metadata_request = null;
				this.article_content = '';
				this.article_content_error = null;
				this.metadata_content = '';
				this.metadata_content_error = null;

				if (!cur) return;

				const {promise: article_request, cancel: article_cancel} = frontend.getDocumentContents(INDEX_ID, cur, {
					patt: QueryStore.get.patternString() || undefined,
					pattgapdata: (QueryStore.get.patternString() && QueryStore.getState().gap?.value) || undefined,
					wordend: this.wordend,
					wordstart: this.wordstart,
					field: CorpusStore.get.mainAnnotatedField(),
					searchfield: QueryStore.get.annotatedFieldName(),
				})
				this.article_request = article_request;
				this.article_cancel = article_cancel;
				article_request.then(content => {
					this.article_content = content;
				}).catch(error => {
					this.article_content_error = error.message;
				}).finally(() => {
					this.article_request = null;
					this.article_cancel = null;
				});

				const {promise: metadata_request, cancel: metadata_cancel} = frontend.getDocumentMetadata(INDEX_ID, cur);
				this.metadata_request = metadata_request;
				this.metadata_cancel = metadata_cancel;
				metadata_request.then(content => {
					this.metadata_content = content;
				}).catch(error => {
					this.metadata_content_error = error.message;
				}).finally(() => {
					this.metadata_request = null;
					this.metadata_cancel = null;
				});
			},
			immediate: true
		},
	},
});

</script>

<style lang="scss">

</style>
