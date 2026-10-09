<template>
	<!-- mind the whitespace, we don't want ANY whitespace between elements. -->
	<component v-if="html" :is="tag" :style="{ fontWeight: bold ? 'bold' : undefined }"
		><template v-if="before && showEllipsis">…</template
		><template v-for="{ text, punctuation, punctBefore, style, title, relationKeys } in renderInfo"
			><span v-if="punct && punctBefore" v-html="punctBefore"></span
			><span
				v-if="style"
				v-html="text"
				:style="style"
				:title="title"
				@mouseover="emit('hover', relationKeys)"
				@mouseout="emit('unhover')"
				:class="{ hoverable: true, hover: relationKeys && hoverMatchInfos ? relationKeys.some(c => hoverMatchInfos.includes(c)) : false }"
			></span
			><span v-else v-html="text"></span><span v-if="punct" v-html="punctuation"></span></template
		><template v-if="after && showEllipsis">…</template></component
	><component v-else :is="tag" :style="{ fontWeight: bold ? 'bold' : undefined }"
		><template v-if="before && showEllipsis">…</template
		><template v-for="{ text, punctuation, punctBefore, style, title, relationKeys } in renderInfo"
			><template v-if="punct && punctBefore">{{ punctBefore }}</template
			><span
				v-if="style"
				:style="style"
				:title="title"
				@mouseover="emit('hover', relationKeys)"
				@mouseout="emit('unhover')"
				:class="{ hoverable: true, hover: !!(relationKeys && hoverMatchInfos) ? relationKeys.some(c => hoverMatchInfos.includes(c)) : false }"
				>{{ text }}</span
			><template v-else>{{ text }}</template
			><template v-if="punct">{{ punctuation }}</template></template
		><template v-if="after && showEllipsis">…</template></component
	>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';

import type { HitContext } from '@/types/apptypes';
import { defineProps, defineEmits, } from 'vue';

const HIGHLIGHT_SEPARATOR = ' • '; // WAS: ' · '

type PartialHitContext = Pick<HitContext, 'match'> & Partial<Pick<HitContext, 'before' | 'after'>>;

const {
	data,
	html = false,
	tag = 'div',
	bold = false,
	highlight = true,
	hoverMatchInfos = [],
	before = false,
	after = false,
	punct = true,
	annotation,
} = defineProps<{
	data: PartialHitContext;
	html?: boolean;
	tag?: keyof HTMLElementTagNameMap;
	bold?: boolean;
	highlight?: boolean;
	hoverMatchInfos?: string[];
	before?: boolean;
	after?: boolean;
	punct?: boolean;
	/** ID of the annotation whose values to render */
	annotation: string;
}>();
const emit = defineEmits<{
	hover: [relationKeys: string[]];
	unhover: [];
}>();
const renderInfo = computed(() => {
	const tokens = before ? (data.before ?? []) : after ? (data.after ?? []) : data.match;
	const result: {
		relationKeys: string[];
		text: string;
		punctuation: string;
		punctBefore: string | undefined;
		title: string | undefined;
		style: CSSProperties | undefined;
	}[] = [];

	for (const token of tokens) {
		let style: CSSProperties | undefined; // undefined means word is not highlighted or hoverable
		if (highlight && token.captureAndRelation?.length) {
			if (token.captureAndRelation.some(c => c.showHighlight)) {
				// Permanent highlight, used for e.g. dependency relations
				style = {
					background: `linear-gradient(90deg, ${token.captureAndRelation.filter(c => c.showHighlight).map((c, i) => `${c.highlight.color} ${(i / token.captureAndRelation!.length) * 100}%, ${c.highlight.color} ${((i + 1) / token.captureAndRelation!.length) * 100}%`)})`,
					display: 'inline-block',
					color: 'black',
					'border-radius': '2px',
					padding: '0 2px',
					textShadow: `0 0 1.25px white,`.repeat(10).replace(/,$/, ''),
				};
			} else {
				// Hoverable highlight, used for parallel corpora
				// (we set style to empty object, not undefined, so we will still generate a span for the word)
				style = {};
			}
		}

		const current = {
			// Ex. "A" for a capture group "A:[]", or parallel field name, or relation name
			relationKeys: token.captureAndRelation?.map(c => c.key) ?? [],
			text: token.annotations[annotation] ?? '',
			punctuation: token.punct,
			punctBefore: token.punctBefore,
			title: highlight ? token.captureAndRelation?.map(c => c.display).join(HIGHLIGHT_SEPARATOR) : undefined,
			style,
		};
		const previous = result.at(-1);
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
					(!punct || (!previous.punctuation && !current.punctBefore))))
		) {
			previous.text += (punct ? previous.punctuation + (current.punctBefore ?? '') : '') + current.text;
			// Retain hidden punctuation so showEllipsis still detects punctuation-only context.
			previous.punctuation = punct ? current.punctuation : previous.punctuation + (current.punctBefore ?? '') + current.punctuation;
		} else {
			result.push(current);
		}
	}
	return result;
});

// BlackLab represents absent trailing context with one empty punctuation token.
const showEllipsis = computed(() => renderInfo.value.some(token => token.text || token.punctuation || token.punctBefore));
</script>

<style>
span.hoverable {
	display: inline-block;
	padding: 0 2px;
	border-radius: 2px;
}

span.hover {
	background-image: none !important;
	background-color: #337ab7 !important;
	color: white !important;
	text-shadow: none !important;
}
</style>
