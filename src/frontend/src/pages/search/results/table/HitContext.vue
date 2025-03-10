<template>
	<!-- mind the whitespace, we don't want ANY whitespace between elements. -->
	<component v-if="html" :is="tag" :style="{fontWeight: bold ? 'bold' : undefined}"
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
	></component
	><component v-else :is="tag" :style="{fontWeight: bold ? 'bold' : undefined}"
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
	></component>
</template>

<script lang="ts">
import Vue from 'vue';
import { HitContext } from '@/types/apptypes';

export default Vue.extend({
	props: {
		data: Object as () => HitContext,
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
		/** ID of the annotation whose values to render */
		annotation: {
			required: true,
			type: String,
		}
	},
	computed: {
		doPunct(): boolean { return this.punct; }, // avoid conflict with props.data in template
		renderInfo(): Array<{text: string, punct: string, punctBefore?: string, style?: object, title?: string, relationKeys?: string[]}> {
			const tokens = this.before ? this.data.before : this.after ? this.data.after : this.data.match;

			return tokens.map(token => {

				let style = undefined; // undefined means word is not highlighted or hoverable
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

				return ({
					// Ex. "A" for a capture group "A:[]", or parallel field name, or relation name
					relationKeys: token.captureAndRelation?.map(c => c.key),
					text: token.annotations[this.annotation],
					punct: token.punct,
					punctBefore: token.punctBefore,
					title: this.highlight ? token.captureAndRelation?.map(c => c.display).join(' · ') : undefined,
					style
				})
			});
		}
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