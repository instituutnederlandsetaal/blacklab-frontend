<template>
	<tr class="concordance-details" :class="{ 'foreign-hit': row.isForeign }">
		<td colspan="100">
			<div class="concordance-details-wrapper">
				<p v-if="snippetLoading" :class="{ 'text-danger': !!error }"><Spinner inline /> {{ $t('results.table.loading') }}</p>
				<p v-else-if="error" class="text-danger">
					<span class="fa fa-exclamation-triangle"></span><br />
					<span style="white-space: pre" v-html="error"></span>
				</p>
				<template v-else-if="snippet">
					<!-- context is the larger surrounding context of the hit. We don't always have one (when rendering docs we only have the immediate hit) -->
					<template v-if="hasRelations">
						<label v-if="sentenceAvailable">
							<input type="checkbox" v-model="sentenceShown" class="show-sentence-checkbox" />
							<Spinner v-if="sentenceLoading" inline style="margin-right: 0.5em" />{{ $t('results.table.showFullSentence') }}
						</label>

						<!-- NOTE: always render the tree.
						 Relations can also be embedded in the direct result, when searching for a dependency relation.
						 We always want to show those, even if the full sentence isn't yet available.
						 So don't v-if the tree!
						 -->
						<DepTree
							v-if="typeof row.hit.start === 'number'"
							:context="sentenceShown && sentence ? snippetParts(sentence, undefined, info.getMatchInfoHighlightStyle) : row.context"
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

						<template v-for="context in snippetContexts" :key="context.key">
							<a v-if="context.key === 'after' && row.href" :href="row.href" :title="$t('results.table.goToHitInDocument').toString()" target="_blank"><sup class="fa fa-link"></sup></a>
							<HitContext
								:tag="context.tag"
								:dir="row.dir"
								:data="snippet"
								:html="info.html"
								:annotation="info.mainAnnotation.id"
								:bold="context.bold"
								:before="context.before"
								:after="context.after"
								:hoverMatchInfos="hoverMatchInfos"
								@hover="emit('hover', $event)"
								@unhover="emit('unhover')"
							/>
						</template>
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

import { useCorpus } from '@/app/state/useCorpusContext';
import { useCustomizations, type ResultHitAddon } from '@/customization-api/internal/internal-api';
import type { IRowProps } from '@/pages/search/results/table/IRow';
import type { HitContext as ContextOfHit, TokenHighlight } from '@/types/apptypes';
import type * as BLTypes from '@/types/blacklabtypes';

import type { HitRowData } from './table-layout';
import { snippetParts } from './table-layout';

import { useBlackLabApi } from '@/shared/api';
import { debugLog } from '@/shared/debug/debug';
import { useRequestResource } from '@/shared/utils/loadable/loadable-request-resource';

import DepTree from '@/pages/search/results/table/DepTree.vue';
import HitContext from '@/pages/search/results/table/HitContext.vue';
import Spinner from '@/shared/ui/Spinner.vue';

// TODO disconnect from the store?

const blacklab = useBlackLabApi();
const corpus = useCorpus();
const customizations = useCustomizations();

const props = defineProps<IRowProps<HitRowData>>();
const emit = defineEmits<{
	hover: [relationKeys: string[]];
	unhover: [];
}>();

type SnippetContext = {
	key: 'before' | 'match' | 'after';
	tag: 'span' | 'strong';
	bold: boolean;
	before: boolean;
	after: boolean;
};
const snippetContexts: SnippetContext[] = [
	{ key: 'before', tag: 'span', bold: false, before: true, after: false },
	{ key: 'match', tag: 'strong', bold: true, before: false, after: false },
	{ key: 'after', tag: 'span', bold: false, before: false, after: true },
];

// whether full sentence is shown (instead of just n words before and after the hit)
// For this to be available, the sentenceElement must be set (in the ui store)
const sentenceShown = ref(false);

const hasRelations = computed(() => corpus.value.hasRelations);
type PositionedRow = HitRowData & { hit: HitRowData['hit'] & Pick<BLTypes.BLHit, 'start' | 'end'> };
const hasPositions = (row: HitRowData): row is PositionedRow => typeof row.hit.start === 'number' && typeof row.hit.end === 'number';
/** Exact surrounding sentence can only be loaded if we the start location of the current hit, and when the boundery element has been set. */
const sentenceAvailable = computed(() => hasRelations.value && !!customizations.searchFormSentenceElement() && hasPositions(props.row));

type SnippetInput = {
	row: PositionedRow;
	info: IRowProps<HitRowData>['info'];
	corpusId: string;
	concordanceSize: number;
	addonConstructors: ReturnType<typeof customizations.resultHitAddons>;
};
type SentenceInput = { row: PositionedRow; corpusId: string; sentenceElement: string };

const snippetResource = useRequestResource<SnippetInput, { snippet: ContextOfHit; addons: ResultHitAddon[] }>({
	mode: 'manual',
	async request({ row, info, corpusId, concordanceSize, addonConstructors }, run) {
		let citation: BLTypes.BLHit;
		try {
			citation = await run.wait(blacklab.getSnippet(corpusId, row.doc.docPid, row.annotatedField?.id, row.hit.start, row.hit.end, concordanceSize));
		} catch (error) {
			run.throwIfAborted();
			if (error instanceof Error && error.stack) debugLog('article', error.stack);
			throw error;
		}
		run.throwIfAborted();
		customizations.transformResultSnippet(citation);
		run.throwIfAborted();

		// HACK! copy the colors from the existing hit. There's no easy way to get the entire Results object here to get the colors from there.
		// At least there's never be more highlights in the surrounding snippet than in the hit itself, so this works...
		const highlightColors = [...row.context.before, ...row.context.match, ...row.context.after].reduce<Record<string, TokenHighlight>>((acc, t) => {
			t.captureAndRelation?.forEach(c => (acc[c.highlight.key] = c.highlight));
			return acc;
		}, {});
		run.throwIfAborted();
		const snippet = snippetParts(
			// @ts-ignore matchinfos not included in snippets. copy from the original hit.
			{ matchInfos: row.hit.matchInfos, ...citation },
			highlightColors,
			info.getMatchInfoHighlightStyle,
		);

		const addons: ResultHitAddon[] = [];
		for (const [i, makeAddon] of addonConstructors.entries()) {
			run.throwIfAborted();
			try {
				const addon = makeAddon({
					docId: row.doc.docPid,
					corpus: corpusId,
					document: row.doc.docInfo,
					documentUrl: row.href || '',
					wordAnnotationId: info.mainAnnotation.id,
					dir: row.dir,
					citation,
				});
				if (addon != null) addons.push(addon);
			} catch (error) {
				console.error(error);
				addons.push({ name: 'error-' + i, content: `<pre class="text-danger">Error in addon: ${error}</pre>` });
			}
		}
		run.throwIfAborted();
		return { snippet, addons };
	},
});
const sentenceResource = useRequestResource<SentenceInput, BLTypes.BLHit>({
	mode: 'manual',
	request: ({ row, corpusId, sentenceElement }) => blacklab.getSnippet(corpusId, row.doc.docPid, row.annotatedField?.id, row.hit.start, row.hit.end, sentenceElement),
});

const snippetLoading = computed(() => snippetResource.state.value.loading);
const sentenceLoading = computed(() => sentenceResource.state.value.loading);
const snippetSettled = computed(() => snippetResource.state.value.settled);
const sentenceSettled = computed(() => sentenceResource.state.value.settled);
const snippetResult = computed(() => {
	const settled = snippetSettled.value;
	return !snippetLoading.value && settled.isLoaded() ? settled.value : null;
});
const snippet = computed(() => snippetResult.value?.snippet ?? null);
const addons = computed(() => snippetResult.value?.addons ?? []);
const sentence = computed(() => {
	const settled = sentenceSettled.value;
	return !sentenceLoading.value && settled.isLoaded() ? settled.value : null;
});
const error = computed(() => {
	if (sentenceSettled.value.isError()) return customizations.formatError(sentenceSettled.value.error, 'snippet');
	if (snippetSettled.value.isError()) return customizations.formatError(snippetSettled.value.error, 'snippet');
	return null;
});

watch(
	() => props.row,
	() => {
		snippetResource.reset();
		sentenceResource.reset();
		sentenceShown.value = false;
	},
	{ flush: 'sync' },
);
watch(
	[() => props.row, () => props.open],
	([row, open]) => {
		const { loading, settled } = snippetResource.state.value;
		if (!open || !hasPositions(row) || loading || settled.isLoaded()) return;
		snippetResource.run({
			row,
			info: props.info,
			corpusId: corpus.value.id!,
			concordanceSize: customizations.resultConcordanceSize(),
			addonConstructors: customizations.resultHitAddons(),
		});
	},
	{ immediate: true },
);
watch(sentenceShown, shown => {
	const row = props.row;
	const { loading, settled } = sentenceResource.state.value;
	const sentenceElement = customizations.searchFormSentenceElement();
	if (!shown || !sentenceAvailable.value || !sentenceElement || !hasPositions(row) || loading || settled.isLoaded()) return;
	sentenceResource.run({ row, corpusId: corpus.value.id!, sentenceElement });
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
