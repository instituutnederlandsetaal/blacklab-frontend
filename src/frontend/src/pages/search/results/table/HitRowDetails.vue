<template>
	<tr class="concordance-details" v-if="open">
		<td :colspan="colspan">
			<div class="concordance-details-wrapper">
				<p v-if="loading" :class="{'text-danger': !!error}">
					<Spinner inline/> {{$t('results.table.loading')}}
				</p>
				<p v-else-if="error" class="text-danger">
					<span class="fa fa-exclamation-triangle"></span> <span v-html="error"></span>
				</p>
				<template v-else-if="context"> <!-- context is the larger surrounding context of the hit. We don't always have one (when rendering docs we only have the immediate hit) -->
					<template v-if="hasRelations && !isParallel">
						<label v-if="sentenceAvailable">
							<input type="checkbox" v-model="sentenceShown" class="show-sentence-checkbox" />
							<Spinner v-if="sentenceLoading" inline style="margin-right: 0.5em"/>{{$t('results.table.showFullSentence')}}
						</label>

						<!-- Will not render anything if no relation info is available in the passed hit/sentence. -->
						<DepTree
							:data="data"
							:fullSentence="sentenceShown ? sentence : undefined"
							:mainAnnotation="mainAnnotation"
							:otherAnnotations="depTreeAnnotations"
						/>
					</template>
					<p :dir="dir">
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

						<HitContextComponent tag="span" :dir="dir" :data="context" :html="html" :annotation="mainAnnotation.id" :before="dir === 'ltr'" :after="dir === 'rtl'"
							:hoverMatchInfos="hoverMatchInfos"
							@hover="$emit('hover', $event)" @unhover="$emit('unhover', $event)" />
						<HitContextComponent tag="strong" :dir="dir" :data="context" :html="html" :annotation="mainAnnotation.id" bold
							:hoverMatchInfos="hoverMatchInfos"
							@hover="$emit('hover', $event)" @unhover="$emit('unhover', $event)" />
						<a v-if="data.href" :href="data.href" title="Go to hit in document" target="_blank"><sup class="fa fa-link" style="margin-left: -5px;"></sup></a>
						<HitContextComponent tag="span" :dir="dir" :data="context" :html="html" :annotation="mainAnnotation.id" :after="dir === 'ltr'"  :before="dir === 'rtl'"
							:hoverMatchInfos="hoverMatchInfos"
							@hover="$emit('hover', $event)" @unhover="$emit('unhover', $event)" />
					</p>
					<table v-if="detailedAnnotations?.length" class="concordance-details-table">
						<thead>
							<tr>
								<th>{{$t('results.table.property')}}</th>
								<th :colspan="data.hit.match.punct.length" :style="`text-align: ${dir === 'rtl' ? 'right' : 'left'}`">{{$t('results.table.value')}}</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="(annot, index) in detailedAnnotations" :key="annot.id">
								<th>{{$tAnnotDisplayName(annot)}}</th>
								<HitContextComponent v-for="(token, ti) in context.match" tag="td" :data="{match: [token]}" :html="html" :dir="dir" :key="annot.id + ti" :punct="false" :highlight="false" :annotation="annot.id"
									:hoverMatchInfos="hoverMatchInfos"
								@hover="$emit('hover', $event)" @unhover="$emit('unhover', $event)" />
							</tr>
						</tbody>
					</table>
				</template>
				<template v-else-if="!detailedAnnotations?.length">
					<p>{{$t('results.table.noContext')}}</p>
				</template>

			</div>
		</td>
	</tr>
</template>

<script lang="ts">
import Vue from 'vue';

import * as BLTypes from '@/types/blacklabtypes';

import { HitContext, NormalizedAnnotation, TokenHighlight } from '@/types/apptypes';
import HitContextComponent from '@/pages/search/results/table/HitContext.vue';
import { snippetParts } from '@/utils/hit-highlighting';
import { HitRowData } from '@/pages/search/results/table/HitRow.vue';
import DepTree from '@/pages/search/results/table/DepTree.vue';
import Spinner from '@/components/Spinner.vue';

import * as UIStore from '@/store/search/ui';
import * as CorpusStore from '@/store/search/corpus';
import * as Api from '@/api';
import { debugLog } from '@/utils/debug';

/** TODO disconnect from the store? */
export default Vue.extend({
	components: {
		HitContextComponent,
		DepTree,
		Spinner
	},
	props: {
		data: Object as () => HitRowData,

		mainAnnotation: Object as () => NormalizedAnnotation,
		detailedAnnotations: Array as () => NormalizedAnnotation[]|undefined,
		/** What properties/annotations to show for tokens in the deptree, e.g. lemma, pos, etc. */
		depTreeAnnotations: Object as () => Record<'lemma'|'upos'|'xpos'|'feats', NormalizedAnnotation|null>,

		html: Boolean,
		colspan: Number,
		dir: String as () => 'ltr'|'rtl',

		open: Boolean,

		// which match infos (capture/relation) should be highlighted because we're hovering over a token? (parallel corpora)
		hoverMatchInfos: {
			type: Array as () => string[],
			default: () => [],
		},
		isParallel: { default: false },
	},
	data: () => ({
		loading: false,
		error: null as null|string,
		context: null as null|HitContext,
		addons: [] as Array<ReturnType<UIStore.ModuleRootState['results']['hits']['addons'][number]>>,

		// whether full sentence is shown (instead of just n words before and after the hit)
		// For this to be available, the sentenceElement must be set (in the ui store)
		sentenceShown: false,
		sentenceLoading: false,
		sentence: null as null|BLTypes.BLHit,
	}),
	computed: {
		hasRelations: CorpusStore.get.hasRelations,
		/** Exact surrounding sentence can only be loaded if we the start location of the current hit, and when the boundery element has been set. */
		sentenceAvailable(): boolean { return this.hasRelations && !!UIStore.getState().search.shared.within.sentenceElement && 'start' in this.data.hit; },

	},
	methods: {
		/**
		 * Separate from the snippet/context, as that can run over sentence boundaries, but this doesn't.
		 * We use it to render the dependency tree for the entire sentence.
		 */
		loadSentence() {
			if (!this.sentenceAvailable || this.sentence || this.sentenceLoading) return;
			if (!('start' in this.data.hit)) // should always be true if this.sentenceAvailable is true, but typescript doesn't know this.
				return;

			const context = UIStore.getState().search.shared.within.sentenceElement;
			if (!context) return; // unavailable.

			const formatError = UIStore.getState().global.errorMessage;

			this.sentenceLoading = true;
			Api.blacklab.getSnippet(
				INDEX_ID,
				this.data.doc.docPid,
				this.data.annotatedField?.id,
				this.data.hit.start,
				this.data.hit.end,
				context
			)
			.then(r => this.sentence = r)
			.catch(e => this.error = formatError(e, 'snippet'))
			.finally(() => this.sentenceLoading = false);
		},
		loadContext() {
			// If we don't have a fat hit, we can't get any larger context (because we don't know the start/end of the hit)
			// Don't do anything else, we just won't render the larger context.
			// The small table will still be shown.
			if (this.loading || this.context || !('start' in this.data.hit)) return;

			ga('send', 'event', 'results', 'snippet/load', this.data.doc.docPid);
			this.loading = true;

			const transformSnippets = UIStore.getState().results.shared.transformSnippets;
			const addons = UIStore.getState().results.hits.addons;
			const formatError = UIStore.getState().global.errorMessage;
			const concordanceSize = UIStore.getState().results.shared.concordanceSize;

			Api.blacklab
			.getSnippet(INDEX_ID, this.data.doc.docPid, this.data.annotatedField?.id, this.data.hit.start, this.data.hit.end, concordanceSize)
			.then(s => {
				transformSnippets?.(s);

				// HACK! copy the colors from the existing hit. There's no easy way to get the entire Results object here to get the colors from there.
				// At least there's never be more highlights in the surrounding snippet than in the hit itself, so this works...
				const highlightColors = [...this.data.context.before, ...this.data.context.match, ...this.data.context.after]
				.reduce<Record<string, TokenHighlight>>((acc, t) => {
					t.captureAndRelation?.forEach(c => acc[c.highlight.key] = c.highlight);
					return acc;
				}, {});

				this.context = snippetParts(
					// @ts-ignore matchinfos not included in snippets. copy from the original hit.
					{matchInfos: this.data.hit.matchInfos,...s},
					this.mainAnnotation.id,
					this.dir,
					highlightColors
				);

				// Run plugins defined for this corpus (e.g. a copy to clipboard button, or an audio player/text to speech button)
				this.addons = addons
					.map((a, i) => {
						try {
							return a({
								docId: this.data.doc.docPid,
								corpus: INDEX_ID,
								document: this.data.doc.docInfo,
								documentUrl: this.data.href || '',
								wordAnnotationId: this.mainAnnotation.id,
								dir: this.dir,
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
			})
			.catch((err: Api.ApiError) => {
				this.error = formatError(err, 'snippet');
				if (err.stack) debugLog(err.stack);
				ga('send', 'exception', { exDescription: err.message, exFatal: false });
			})
			.finally(() => this.loading = false);
		}
	},
	watch: {
		open: {
			immediate: true,
			handler() { if (this.open) this.loadContext(); }
		},
		sentenceShown: {
			immediate: true,
			handler() { if (this.sentenceShown) this.loadSentence(); }
		}
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