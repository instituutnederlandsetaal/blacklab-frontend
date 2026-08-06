<template>
	<tr class="concordance-details" :class="{ 'foreign-hit': row.isForeign }">
		<td colspan="100">
			<div class="concordance-details-wrapper">
				<p v-if="snippetRequest" :class="{ 'text-danger': !!error }"><Spinner inline /> {{ $t('results.table.loading') }}</p>
				<p v-else-if="error" class="text-danger">
					<span class="fa fa-exclamation-triangle"></span><br />
					<span style="white-space: pre" v-html="error"></span>
				</p>
				<template v-else-if="snippet">
					<!-- context is the larger surrounding context of the hit. We don't always have one (when rendering docs we only have the immediate hit) -->
					<template v-if="hasRelations">
						<label v-if="sentenceAvailable">
							<input type="checkbox" v-model="sentenceShown" class="show-sentence-checkbox" />
							<Spinner v-if="sentenceRequest" inline style="margin-right: 0.5em" />{{ $t('results.table.showFullSentence') }}
						</label>

						<!-- NOTE: always render the tree.
						 Relations can also be embedded in the direct result, when searching for a dependency relation.
						 We always want to show those, even if the full sentence isn't yet available.
						 So don't v-if the tree!
						 -->
						<DepTree
							v-if="typeof row.hit.start === 'number'"
							:context="sentenceShown && sentence ? snippetParts(sentence) : row.context"
							:hit-start="row.hit.start"
							:match-infos="sentenceShown && sentence ? sentence.matchInfos : row.hit.matchInfos"
							:primary-annotation="info.mainAnnotation"
							:secondary-annotations="info.dependencyAnnotations"
							:dir="row.dir"
							:preferred-relation-class="info.dependencyRelationClass"
						/>
					</template>
					<p :dir="row.dir">
						<template v-for="addon in addons">
							<component
								v-if="addon.component"
								:is="addon.component"
								:key="addon.name + '_vue'"
								:class="`addon addon-${addon.name} ${(addon.props && addon.props.class) || ''}`"
								v-bind="addon.props"
								v-on="addon.listeners"
							>
								<div v-if="addon.content" v-html="addon.content"></div>
							</component>

							<component
								v-else
								:is="addon.element || 'div'"
								:key="addon.name + '_html'"
								:class="`addon addon-${addon.name} ${(addon.props && addon.props.class) || ''}`"
								v-bind="addon.props"
								v-on="addon.listeners"
								v-html="addon.content"
							/>
						</template>

						<HitContext
							tag="span"
							:dir="row.dir"
							:data="snippet"
							:html="info.html"
							:annotation="info.mainAnnotation.id"
							:before="true"
							:after="false"
							:hoverMatchInfos="hoverMatchInfos"
							@hover="$emit('hover', $event)"
							@unhover="$emit('unhover')"
						/>
						<HitContext
							tag="strong"
							:dir="row.dir"
							:data="snippet"
							:html="info.html"
							:annotation="info.mainAnnotation.id"
							bold
							:hoverMatchInfos="hoverMatchInfos"
							@hover="$emit('hover', $event)"
							@unhover="$emit('unhover')"
						/>
						<a v-if="row.href" :href="row.href" :title="$t('results.table.goToHitInDocument').toString()" target="_blank"><sup class="fa fa-link"></sup></a>
						<HitContext
							tag="span"
							:dir="row.dir"
							:data="snippet"
							:html="info.html"
							:annotation="info.mainAnnotation.id"
							:after="true"
							:before="false"
							:hoverMatchInfos="hoverMatchInfos"
							@hover="$emit('hover', $event)"
							@unhover="$emit('unhover')"
						/>
					</p>
					<table v-if="info.detailedAnnotations?.length" class="concordance-details-table">
						<thead>
							<tr>
								<th>{{ $t('results.table.property') }}</th>
								<th :colspan="row.hit.match.punct.length" :style="`text-align: ${row.dir === 'rtl' ? 'right' : 'left'}`">{{ $t('results.table.value') }}</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="annot in info.detailedAnnotations" :key="annot.id">
								<th>{{ $tAnnotDisplayName(annot) }}</th>
								<HitContext
									v-for="(token, ti) in snippet.match"
									tag="td"
									:data="{ match: [token] }"
									:html="info.html"
									:dir="row.dir"
									:key="annot.id + ti"
									:punct="false"
									:highlight="false"
									:annotation="annot.id"
									:hoverMatchInfos="hoverMatchInfos"
									@hover="$emit('hover', $event)"
									@unhover="$emit('unhover')"
								/>
							</tr>
						</tbody>
					</table>
				</template>
				<template v-else-if="!info.detailedAnnotations?.length">
					<p>{{ $t('results.table.noContext') }}</p>
				</template>
			</div>
		</td>
	</tr>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import * as UIStore from '@/app/state/ui-state';
import { useCorpus } from '@/app/state/useCorpusContext';
import { type IRowProps, IRowDefaultProps } from '@/pages/search/results/table/IRow';
import type { HitContext as ContextOfHit, TokenHighlight } from '@/types/apptypes';
import type * as BLTypes from '@/types/blacklabtypes';

import type { HitRowData } from './table-layout';
import { snippetParts } from './table-layout';

import { useBlackLabApi } from '@/shared/api';
import type { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';
import { debugLog } from '@/shared/debug/debug';

import DepTree from '@/pages/search/results/table/DepTree.vue';
import HitContext from '@/pages/search/results/table/HitContext.vue';
import Spinner from '@/shared/ui/Spinner.vue';

// TODO disconnect from the store?

const blacklab = useBlackLabApi();
const corpus = useCorpus();

defineOptions({ name: 'HitRowDetails' });
const props = withDefaults(defineProps<IRowProps<HitRowData>>(), IRowDefaultProps);

const sentenceRequest = ref<CancelableRequest<BLTypes.BLHit> | null>(null);
const sentence = ref<BLTypes.BLHit | null>(null);

const snippetRequest = ref<CancelableRequest<BLTypes.BLHit> | null>(null);
const snippet = ref<ContextOfHit | null>(null);

const error = ref<string | null>(null);
const addons = ref<Array<ReturnType<UIStore.ModuleRootState['results']['hits']['addons'][number]>>>([]);

// whether full sentence is shown (instead of just n words before and after the hit)
// For this to be available, the sentenceElement must be set (in the ui store)
const sentenceShown = ref(false);

const hasRelations = computed(() => corpus.value.hasRelations);
/** Exact surrounding sentence can only be loaded if we the start location of the current hit, and when the boundery element has been set. */
const sentenceAvailable = computed(() => hasRelations.value && !!UIStore.getState().search.shared.within.sentenceElement && 'start' in props.row.hit);

/**
 * Separate from the snippet/context, as that can run over sentence boundaries, but this doesn't.
 * We use it to render the dependency tree for the entire sentence.
 */
function loadSentence() {
	// 'start' should always be true if this.sentenceAvailable is true, but typescript doesn't know this.
	if (!sentenceAvailable.value || sentenceRequest.value || !('start' in props.row.hit)) return;

	const context = UIStore.getState().search.shared.within.sentenceElement;
	if (!context) return; // unavailable.

	const formatError = UIStore.getState().global.errorMessage;

	// Need to track this, because results pay be paginated and this component may be reused across renders
	// We should probably use asyncComputed or something but that's for later.
	const nonce = props.row.hit;
	const request = blacklab.getSnippet(corpus.value.id!, props.row.doc.docPid, props.row.annotatedField?.id, props.row.hit.start!, props.row.hit.end!, context);
	sentenceRequest.value = request;
	request
		// check if hit hasn't changed in the meantime (due to component reuse)
		.then(r => {
			if (nonce === props.row.hit) sentence.value = r;
		})
		.catch(e => {
			if (nonce === props.row.hit) error.value = formatError(e, 'snippet');
		})
		.finally(() => {
			if (sentenceRequest.value === request) sentenceRequest.value = null;
		});
}

function loadSnippet() {
	// If we don't have a fat hit, we can't get any larger context (because we don't know the start/end of the hit)
	// Don't do anything else, we just won't render the larger context.
	// The small table will still be shown.
	if (snippetRequest.value || snippet.value || !('start' in props.row.hit)) return;

	const transformSnippets = UIStore.getState().results.shared.transformSnippets;
	const addonConstructors = UIStore.getState().results.hits.addons;
	const formatError = UIStore.getState().global.errorMessage;
	const concordanceSize = UIStore.getState().results.shared.concordanceSize;

	const nonce = props.row.hit;
	const request = blacklab.getSnippet(corpus.value.id!, props.row.doc.docPid, props.row.annotatedField?.id, props.row.hit.start!, props.row.hit.end!, concordanceSize);
	snippetRequest.value = request;
	request
		.then(s => {
			if (nonce !== props.row.hit) return; // hit has changed in the meantime.

			transformSnippets?.(s);

			// HACK! copy the colors from the existing hit. There's no easy way to get the entire Results object here to get the colors from there.
			// At least there's never be more highlights in the surrounding snippet than in the hit itself, so this works...
			const highlightColors = [...props.row.context.before, ...props.row.context.match, ...props.row.context.after].reduce<Record<string, TokenHighlight>>((acc, t) => {
				t.captureAndRelation?.forEach(c => (acc[c.highlight.key] = c.highlight));
				return acc;
			}, {});

			snippet.value = snippetParts(
				// @ts-ignore matchinfos not included in snippets. copy from the original hit.
				{ matchInfos: props.row.hit.matchInfos, ...s },
				highlightColors,
			);

			// Run plugins defined for this corpus (e.g. a copy to clipboard button, or an audio player/text to speech button)
			addons.value = addonConstructors
				.map((a, i) => {
					try {
						return a({
							docId: props.row.doc.docPid,
							corpus: corpus.value.id!,
							document: props.row.doc.docInfo,
							documentUrl: props.row.href || '',
							wordAnnotationId: props.info.mainAnnotation.id,
							dir: props.row.dir,
							citation: s,
						});
					} catch (e) {
						console.error(e);
						return {
							name: 'error-' + i,
							content: `<pre class="text-danger">Error in addon: ${e}</pre>`,
						};
					}
				})
				.filter(a => a != null);
		})
		.catch((err: ApiError) => {
			if (nonce !== props.row.hit) return; // hit has changed in the meantime.
			error.value = formatError(err, 'snippet');
			if (err.stack) debugLog('article', err.stack);
		})
		.finally(() => {
			if (snippetRequest.value === request) snippetRequest.value = null;
		});
}

watch(
	() => props.open,
	open => {
		if (open) loadSnippet();
	},
);
watch(sentenceShown, shown => {
	if (shown) loadSentence();
});
watch(
	() => props.row,
	() => {
		// Clear any data that's no longer relevant.
		snippetRequest.value?.cancel();
		sentenceRequest.value?.cancel();
		snippetRequest.value = snippet.value = sentenceRequest.value = sentence.value = error.value = null;
		addons.value = [];
		sentenceShown.value = false;
	},
);
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
	@media (max-width: ($screen-md - 1px)) {
		max-width: calc(100vw - 95px);
	}
	// overflow-x will clip overflows at the top
	// which causes the link to the document to be clipped.
	// This is a bit of a hack, but at least it wille be visible in full.
	padding-top: 10px;
	margin-top: -10px;
}
.container:not(.container-fluid) .concordance-details-wrapper {
	// everything below sm is fluid, so no more breakpoints below that.
	max-width: calc(100vw - 95px);
	@media (min-width: $screen-sm) {
		max-width: calc($screen-sm - 125px);
	}
	@media (min-width: $screen-md) {
		max-width: calc($screen-md - 130px);
	}
	@media (min-width: $screen-lg) {
		max-width: calc($screen-lg - 130px);
	}
}

.concordance-details-table {
	table-layout: auto;
	td {
		padding: 0 0.25em;
	}
}
</style>
