<template>
	<!-- mind the whitespace, we don't want ANY whitespace between elements. -->
	<component v-if="html" :is="tag" :style="{fontWeight: bold ? 'bold' : undefined}"
		><button v-if="before && canExpand" type="button" class="btn btn-inline btn-link" :aria-expanded="expanded.toString()" @click.stop="expanded = !expanded">{{ $t(toggleLabelKey) }}</button
		><template v-if="before">…</template
		><template v-for="{text, punct, punctBefore, style, title, relationKeys}, i in renderInfo"
			><span v-if="doPunct && punctBefore" v-html="punctBefore"></span
			><span v-if="style"
				v-html="text"
				:style="style"
				:title="title"
				@mouseover="$emit('hover', relationKeys)"
				@mouseout="$emit('unhover')"
				:class="{ hoverable: true, hover: !!(relationKeys && hoverMatchInfos) ? relationKeys.some(c => hoverMatchInfos.includes(c)) : false }"
			></span
			><span v-else v-html="text"></span
			><span v-if="doPunct" v-html="punct"></span
		></template
		><template v-if="after">…</template
		><button v-if="!before && canExpand" type="button" class="btn btn-inline btn-link" :aria-expanded="expanded.toString()" @click.stop="expanded = !expanded">{{ $t(toggleLabelKey) }}</button
	></component
	><component v-else :is="tag" :style="{fontWeight: bold ? 'bold' : undefined}"
		><button v-if="before && canExpand" type="button" class="btn btn-inline btn-link" :aria-expanded="expanded.toString()" @click.stop="expanded = !expanded">{{ $t(toggleLabelKey) }}</button
		><template v-if="before">…</template
		><template v-for="{text, punct, punctBefore, style, title, relationKeys}, i in renderInfo"
			><template v-if="doPunct && punctBefore">{{ punctBefore }}</template
			><span v-if="style"
				:style="style"
				:title="title"
				@mouseover="$emit('hover', relationKeys)"
				@mouseout="$emit('unhover')"
				:class="{ hoverable: true, hover: !!(relationKeys && hoverMatchInfos) ? relationKeys.some(c => hoverMatchInfos.includes(c)) : false }"
			>{{ text }}</span
			><template v-else>{{ text }}</template
			><template v-if="doPunct">{{ punct }}</template
		></template
		><template v-if="after">…</template
		><button v-if="!before && canExpand" type="button" class="btn btn-inline btn-link" :aria-expanded="expanded.toString()" @click.stop="expanded = !expanded">{{ $t(toggleLabelKey) }}</button
	></component>
</template>

<script lang="ts">
import Vue from 'vue';
import { HitContext, HitToken } from '@/types/apptypes';

const HIGHLIGHT_SEPARATOR = ' • '; // WAS: ' · '

type PartialHitContext = Pick<HitContext, 'match'> & Partial<Pick<HitContext, 'before' | 'after'>>;
type RenderToken = {
	relationKeys: string[];
	text: string;
	punct: string;
	punctBefore?: string;
	title?: string;
	style?: Record<string, string>;
};

export default Vue.extend({
	props: {
		data: Object as () => PartialHitContext,
		html: Boolean,
		tag: {
			default: 'div',
			required: false,
			type: String as () => keyof HTMLElementTagNameMap
		},
		bold: Boolean,
		highlight: {default: true},

		// which match infos (capture/relation) should be highlighted because we're hovering over a token? (parallel corpora)
		hoverMatchInfos: Array as () => string[],

		before: Boolean,
		after: Boolean,
		punct: {default: true},
		/** Maximum tokens shown in this context part before expanding. */
		maxTokens: {
			type: Number,
			default: 25,
		},
		/** ID of the annotation whose values to render */
		annotation: {
			required: true,
			type: String,
		}
	},
	data: () => ({ expanded: false }),
	computed: {
		doPunct(): boolean { return this.punct; }, // avoid conflict with props.data in template
		activeTokens(): HitToken[] {
			return this.before ? (this.data.before ?? []) : this.after ? (this.data.after ?? []) : this.data.match;
		},
		canExpand(): boolean { return this.activeTokens.length > this.maxTokens; },
		toggleLabelKey(): string {
			return this.expanded ? 'results.table.collapseTruncatedSnippetButtonLabel' : 'results.table.expandTruncatedSnippetButtonLabel';
		},
		renderInfo(): RenderToken[] {
			const tokens = this.activeTokens;
			const showLess = this.canExpand && !this.expanded;
			const limit = !showLess || this.before ? tokens.length : this.maxTokens;
			const start = showLess && this.before ? tokens.length - this.maxTokens : 0;
			const result: RenderToken[] = [];

			for (let i = start; i < limit; ++i) {
				const token = tokens[i];

				let style: RenderToken['style']; // undefined means word is not highlighted or hoverable
				if (this.highlight && token.captureAndRelation?.length) {
					if (token.captureAndRelation?.some(c => c.showHighlight)) {
						// Permanent highlight, used for e.g. dependency relations
						style = {
							background: `linear-gradient(90deg, ${token.captureAndRelation.filter(c => c.showHighlight).map((c, i) => `${c.highlight.color} ${i / token.captureAndRelation!.length * 100}%, ${c.highlight.color} ${(i + 1) / token.captureAndRelation!.length * 100}%`)})`,
							display: 'inline-block',
							color: 'black',
							'border-radius': '2px',
							padding: '0 2px',
							textShadow: `0 0 1.25px white,`.repeat(10).replace(/,$/, '')
						};
					} else {
						// Hoverable highlight, used for parallel corpora
						// (we set style to empty object, not undefined, so we will still generate a span for the word)
						style = {};
					}
				}

				const current: RenderToken = {
					// Ex. "A" for a capture group "A:[]", or parallel field name, or relation name
					relationKeys: token.captureAndRelation?.map(c => c.key) ?? [],
					text: token.annotations[this.annotation] ?? '',
					punct: token.punct,
					punctBefore: token.punctBefore,
					title: this.highlight ? token.captureAndRelation?.map(c => c.display).join(HIGHLIGHT_SEPARATOR) : undefined,
					style
				};
				const previous = result[result.length - 1];
				if (
					previous &&
					((!previous.style && !style) ||
						(previous.style &&
							style &&
							previous.style.background === style.background &&
							previous.title === current.title &&
							previous.relationKeys.length === current.relationKeys.length &&
							previous.relationKeys.every((key, i) => key === current.relationKeys[i]) &&
							// Punctuation between highlighted spans must remain outside the highlight.
							(!this.punct || (!previous.punct && !current.punctBefore))))
				) {
					previous.text += (this.punct ? previous.punct + (current.punctBefore ?? '') : '') + current.text;
					// Retain punctuation even when it is hidden.
					previous.punct = this.punct ? current.punct : previous.punct + (current.punctBefore ?? '') + current.punct;
				} else {
					result.push(current);
				}
			}
			return result;
		}
	},
	watch: {
		activeTokens() { this.expanded = false; },
	},
});
</script>

<style>

span.hoverable {
	display: inline-block;
	padding: 0 2px;
	border-radius: 2px;
}

span.hover {
	background-image: none!important;
	background-color: #337ab7!important;
	color: white!important;
	text-shadow: none!important;
}
</style>
