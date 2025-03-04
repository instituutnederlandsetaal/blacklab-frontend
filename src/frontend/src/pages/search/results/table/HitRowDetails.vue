<template>
	<tr v-if="open" class="concordance-details">
		<td :colspan="colspan">
			<div class="concordance-details-wrapper">
				<p v-if="snippetRequest" :class="{'text-danger': !!error}">
					<Spinner inline/> {{$t('results.table.loading')}}
				</p>
				<p v-else-if="error" class="text-danger">
					<span class="fa fa-exclamation-triangle"></span> <span v-html="error"></span>
				</p>
				<template v-else-if="snippet"> <!-- context is the larger surrounding context of the hit. We don't always have one (when rendering docs we only have the immediate hit) -->
					<template v-if="hasRelations && !row.isForeign">
						<label v-if="sentenceAvailable">
							<input type="checkbox" v-model="sentenceShown" class="show-sentence-checkbox" />
							<Spinner v-if="sentenceRequest" inline style="margin-right: 0.5em"/>{{$t('results.table.showFullSentence')}}
						</label>

						<!-- Will not render anything if no relation info is available in the passed hit/sentence. -->
						<DepTree
							:data="row"
							:fullSentence="sentenceShown ? sentence : undefined"
							:mainAnnotation="info.mainAnnotation"
							:otherAnnotations="info.depTreeAnnotations"
						/>
					</template>
					<p :dir="row.dir">
						<template v-for="addon in addons">
							<component v-if="addon.component"
								:is="addon.component"
								:key="addon.name + '_vue'"
								:class="`addon addon-${addon.name} ${(addon.props && addon.props.class) || ''}`"
								v-bind="addon.props"
								v-on="addon.listeners"
							>
								<div v-if="addon.content" v-html="addon.content"></div>
							</component>

							<component v-else
								:is="addon.element || 'div'"
								:key="addon.name + '_html'"
								:class="`addon addon-${addon.name} ${(addon.props && addon.props.class) || ''}`"
								v-bind="addon.props"
								v-on="addon.listeners"
								v-html="addon.content"
							/>
						</template>

						<HitContext tag="span" :dir="row.dir" :data="snippet" :html="info.html" :annotation="info.mainAnnotation.id" :before="true" :after="false"
							:hoverMatchInfos="hoverMatchInfos" @hover="$emit('hover', $event)" @unhover="$emit('unhover')" />
						<HitContext tag="strong" :dir="row.dir" :data="snippet" :html="info.html" :annotation="info.mainAnnotation.id" bold
							:hoverMatchInfos="hoverMatchInfos" @hover="$emit('hover', $event)" @unhover="$emit('unhover')" />
						<a v-if="row.href" :href="row.href" :title="$t('results.table.goToHitInDocument').toString()" target="_blank"><sup class="fa fa-link" style="margin-left: -5px;"></sup></a>
						<HitContext tag="span" :dir="row.dir" :data="snippet" :html="info.html" :annotation="info.mainAnnotation.id" :after="true"  :before="false"
							:hoverMatchInfos="hoverMatchInfos" @hover="$emit('hover', $event)" @unhover="$emit('unhover')" />
					</p>
					<table v-if="info.detailedAnnotations?.length" class="concordance-details-table">
						<thead>
							<tr>
								<th>{{$t('results.table.property')}}</th>
								<th :colspan="row.hit.match.punct.length" :style="`text-align: ${row.dir === 'rtl' ? 'right' : 'left'}`">{{$t('results.table.value')}}</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="(annot, index) in info.detailedAnnotations" :key="annot.id">
								<th>{{$tAnnotDisplayName(annot)}}</th>
								<HitContext v-for="(token, ti) in snippet.match" tag="td" :data="{match: [token]}" :html="info.html" :dir="row.dir" :key="annot.id + ti" :punct="false" :highlight="false" :annotation="annot.id"
									:hoverMatchInfos="hoverMatchInfos" @hover="$emit('hover', $event)" @unhover="$emit('unhover')" />
							</tr>
						</tbody>
					</table>
				</template>
				<template v-else-if="!info.detailedAnnotations?.length">
					<p>{{$t('results.table.noContext')}}</p>
				</template>
			</div>
		</td>
	</tr>
</template>

<script lang="ts">
import Vue from 'vue';

import * as BLTypes from '@/types/blacklabtypes';

import { HitContext as ContextOfHit, TokenHighlight } from '@/types/apptypes';
import HitContext from '@/pages/search/results/table/HitContext.vue';
import { ColumnDefs, DisplaySettings, HitRowContext, snippetParts } from '@/utils/hit-highlighting';
import DepTree from '@/pages/search/results/table/DepTree.vue';
import Spinner from '@/components/Spinner.vue';

import * as UIStore from '@/store/search/ui';
import * as CorpusStore from '@/store/search/corpus';
import * as Api from '@/api';
import { debugLog } from '@/utils/debug';

/** TODO disconnect from the store? */
export default Vue.extend({
	components: {
		HitContext,
		DepTree,
		Spinner
	},
	props: {
		row: Object as () => HitRowContext,
		cols: Object as () => ColumnDefs,
		info: Object as () => DisplaySettings,


		// data: Object as () => HitRowData,

		// mainAnnotation: Object as () => NormalizedAnnotation,
		// detailedAnnotations: Array as () => NormalizedAnnotation[]|undefined,
		// /** What properties/annotations to show for tokens in the deptree, e.g. lemma, pos, etc. */
		// depTreeAnnotations: Object as () => Record<'lemma'|'upos'|'xpos'|'feats', NormalizedAnnotation|null>,

		// html: Boolean,
		colspan: Number,
		// dir: String as () => 'ltr'|'rtl',

		open: Boolean,

		// // which match infos (capture/relation) should be highlighted because we're hovering over a token? (parallel corpora)
		hoverMatchInfos: {
			type: Array as () => string[],
			default: () => [],
		},
		// isParallel: { default: false },
	},
	data: () => ({
		sentenceRequest: null as null|Promise<any>,
		sentence: null as null|BLTypes.BLHit,

		snippetRequest: null as null|Promise<void>,
		snippet: null as null|ContextOfHit,

		error: null as null|string,
		addons: [] as Array<ReturnType<UIStore.ModuleRootState['results']['hits']['addons'][number]>>,

		// whether full sentence is shown (instead of just n words before and after the hit)
		// For this to be available, the sentenceElement must be set (in the ui store)
		sentenceShown: false,
	}),
	computed: {
		hasRelations: CorpusStore.get.hasRelations,
		/** Exact surrounding sentence can only be loaded if we the start location of the current hit, and when the boundery element has been set. */
		sentenceAvailable(): boolean { return this.hasRelations && !!UIStore.getState().search.shared.within.sentenceElement && 'start' in this.row.hit; },

	},
	methods: {
		/**
		 * Separate from the snippet/context, as that can run over sentence boundaries, but this doesn't.
		 * We use it to render the dependency tree for the entire sentence.
		 */
		loadSentence() {
			// 'start' should always be true if this.sentenceAvailable is true, but typescript doesn't know this.
			if (!this.sentenceAvailable || this.sentenceRequest || !('start' in this.row.hit)) return;

			const context = UIStore.getState().search.shared.within.sentenceElement;
			if (!context) return; // unavailable.

			const formatError = UIStore.getState().global.errorMessage;

			const nonce = this.row.hit;
			this.sentenceRequest = Api.blacklab.getSnippet(
				INDEX_ID,
				this.row.doc.docPid,
				this.row.annotatedField?.id,
				this.row.hit.start,
				this.row.hit.end,
				context
			)
			// check if hit hasn't changed in the meantime (due to component reuse)
			.then(r => { if (nonce === this.row.hit) { this.sentence = r; this.sentenceRequest = null; }})
			.catch(e => { this.error = formatError(e, 'snippet'); })
		},
		loadSnippet() {
			// If we don't have a fat hit, we can't get any larger context (because we don't know the start/end of the hit)
			// Don't do anything else, we just won't render the larger context.
			// The small table will still be shown.
			if (this.snippetRequest || this.snippet || !('start' in this.row.hit)) return;

			ga('send', 'event', 'results', 'snippet/load', this.row.doc.docPid);

			const transformSnippets = UIStore.getState().results.shared.transformSnippets;
			const addons = UIStore.getState().results.hits.addons;
			const formatError = UIStore.getState().global.errorMessage;
			const concordanceSize = UIStore.getState().results.shared.concordanceSize;

			const nonce = this.row.hit;
			this.snippetRequest = Api.blacklab
			.getSnippet(INDEX_ID, this.row.doc.docPid, this.row.annotatedField?.id, this.row.hit.start, this.row.hit.end, concordanceSize)
			.then(s => {
				if (nonce !== this.row.hit) return; // hit has changed in the meantime.

				transformSnippets?.(s);

				// HACK! copy the colors from the existing hit. There's no easy way to get the entire Results object here to get the colors from there.
				// At least there's never be more highlights in the surrounding snippet than in the hit itself, so this works...
				const highlightColors = [...this.row.context.before, ...this.row.context.match, ...this.row.context.after]
				.reduce<Record<string, TokenHighlight>>((acc, t) => {
					t.captureAndRelation?.forEach(c => acc[c.highlight.key] = c.highlight);
					return acc;
				}, {});

				this.snippet = snippetParts(
					// @ts-ignore matchinfos not included in snippets. copy from the original hit.
					{matchInfos: this.row.hit.matchInfos,...s},
					this.info.mainAnnotation.id,
					highlightColors
				);

				// Run plugins defined for this corpus (e.g. a copy to clipboard button, or an audio player/text to speech button)
				this.addons = addons
					.map((a, i) => {
						try {
							return a({
								docId: this.row.doc.docPid,
								corpus: INDEX_ID,
								document: this.row.doc.docInfo,
								documentUrl: this.row.href || '',
								wordAnnotationId: this.info.mainAnnotation.id,
								dir: this.row.dir,
								citation: s
							});
						} catch (e) {
							console.error(e);
							return {
								name: 'error-' + i,
								content: `<pre class="text-danger">Error in addon: ${e}</pre>`
							}
						}
					})
					.filter(a => a != null);

				this.snippetRequest = null;
			})
			.catch((err: Api.ApiError) => {
				this.error = formatError(err, 'snippet');
				if (err.stack) debugLog(err.stack);
				ga('send', 'exception', { exDescription: err.message, exFatal: false });
			})
		}
	},
	watch: {
		open: {
			immediate: true,
			handler() { if (this.open) this.loadSnippet(); }
		},
		sentenceShown: {
			immediate: true,
			handler() { if (this.sentenceShown) this.loadSentence(); }
		},
		data() {
			// Clear any data that's no longer relevant.
			this.snippetRequest = this.snippet = this.sentenceRequest = this.sentence = this.error = null;
			this.addons = [];
			this.sentenceShown = false;
		}
	},
	created() {
		//console.log('HitRowDetails created');
	},
	destroyed() {
		//console.log('HitRowDetails destroyed');
	}
});
</script>

<style lang="scss">

// copy of bootstrap's breakpoints.
// we need to do this to limit the width of the table-contents.
// especially the dependency tree can get very wide, so we need to surround it with a scrollable container.
// we can't use a constant or 'vw' because bootstrap has different paddings on the main container for different widths.
$screen-sm: 768px;
$screen-md: 992px;
$screen-lg: 1200px;


.concordance-details-wrapper {
	overflow-x: auto;
	max-width: calc(100vw - 125px);
	@media(max-width: ($screen-md - 1px)) { max-width: calc(100vw - 95px); }
	// overflow-x will clip overflows at the top
	// which causes the link to the document to be clipped.
	// This is a bit of a hack, but at least it wille be visible in full.
	padding-top: 10px;
	margin-top: -10px;
}
.container:not(.container-fluid) .concordance-details-wrapper {
	// everything below sm is fluid, so no more breakpoints below that.
	max-width: calc(100vw - 95px);
	@media(min-width: $screen-sm) { max-width: calc($screen-sm - 125px); }
	@media(min-width: $screen-md) { max-width: calc($screen-md - 130px); }
	@media(min-width: $screen-lg) { max-width: calc($screen-lg - 130px); }
}


.concordance-details-table {
	table-layout: auto;
	td {
		padding: 0 0.25em;
	}
}


</style>