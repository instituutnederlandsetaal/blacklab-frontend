<template>
	<tr class="concordance rounded">
		<td v-if="isParallel && data.annotatedField" class='doc-version'><a @click.stop="" :href="data.href" title="Go to hit in document" target="_blank">{{ $tAnnotatedFieldDisplayName(data.annotatedField) }}</a></td>
		<HitContextComponent tag="td" class="text-right"  :dir="dir" :data="data.context" :html="html" :annotation="mainAnnotation.id" :before="dir === 'ltr'" :after="dir === 'rtl'"
			:hoverMatchInfos="hoverMatchInfos"
			@hover="$emit('hover', $event)" @unhover="$emit('unhover', $event)" />
		<HitContextComponent tag="td" class="text-center" :dir="dir" :data="data.context" :html="html" :annotation="mainAnnotation.id" bold
			:hoverMatchInfos="hoverMatchInfos"
			@hover="$emit('hover', $event)" @unhover="$emit('unhover', $event)"/>
		<HitContextComponent tag="td" class="text-left"   :dir="dir" :data="data.context" :html="html" :annotation="mainAnnotation.id" :after="dir === 'ltr'"  :before="dir === 'rtl'"
			:hoverMatchInfos="hoverMatchInfos"
			@hover="$emit('hover', $event)" @unhover="$emit('unhover', $event)"/>

		<HitContextComponent tag="td" :annotation="a.id" :data="data.context" :html="html" :dir="dir" :key="a.id" :highlight="false" v-for="a in otherAnnotations"
			:hoverMatchInfos="hoverMatchInfos"
			:punct="false"
			@hover="$emit('hover', $event)" @unhover="$emit('unhover', $event)"/>

		<td v-for="field in data.gloss_fields" :key="field.fieldName" style="overflow: visible;">
			<GlossField
				:fieldName="field.fieldName"
				:hit_first_word_id="data.hit_first_word_id"
				:hit_last_word_id="data.hit_last_word_id"
				:fieldDescription="field"
				:hitId="data.hit_id"
			/>
		</td>
		<td v-if="data.doc" v-for="meta in metadata" :key="meta.id">{{ data.doc.docInfo[meta.id]?.join(', ') || '' }}</td>
	</tr>
</template>

<script lang="ts">
import Vue from 'vue';

import * as BLTypes from '@/types/blacklabtypes';

import GlossField from '@/pages/search/form/concept/GlossField.vue';
import { GlossFieldDescription } from '@/store/search/form/glossStore';
import { HitContext, NormalizedAnnotatedField, NormalizedAnnotation, NormalizedMetadataField } from '@/types/apptypes';

import HitContextComponent from '@/pages/search/results/table/HitContext.vue';

export type HitRowData = {
	doc: BLTypes.BLDoc;
	hit: BLTypes.BLHit|BLTypes.BLHitSnippet;
	/** Is the data in this hit from the searched field or from the parallel/related/target field. False if source, true if target. */
	isForeign: boolean;
	context: HitContext;
	/** For parallel corpora. The url to view the hit in the document's version in the target field. */
	href: string;
	/** For parallel corpora. The field in which this version of the hit exists. */
	annotatedField?: NormalizedAnnotatedField;

	// TODO jesse
	gloss_fields: GlossFieldDescription[];
	hit_first_word_id: string; // Jesse
	hit_last_word_id: string // jesse
	hit_id: string; // jesse
}

/**
 * Can contain either a full hit or a partial hit (without capture/relations info)
 * Partials hits are returned when requesting /docs.
 */
export type HitRows = {
	type: 'hit';
	doc: BLTypes.BLDoc;
	rows: HitRowData[];
};

export default Vue.extend({
	components: {
		GlossField,
		HitContextComponent
	},
	props: {
		data: Object as () => HitRowData,
		mainAnnotation: Object as () => NormalizedAnnotation,
		otherAnnotations: Array as () => NormalizedAnnotation[]|undefined,
		metadata: Array as () => NormalizedMetadataField[]|undefined,
		dir: String as () => 'ltr'|'rtl',
		html: Boolean,
		/** Toggles whether we display the source annotated field of the hit. */
		isParallel: Boolean,

		// which match infos (capture/relation) should be highlighted because we're hovering over a token? (parallel corpora)
		hoverMatchInfos: {
			type: Array as () => string[],
			default: () => [],
		},
	},
});
</script>

<style lang="scss">

tr.foreign-hit {
	color: #666;
	font-style: italic;
}

tr.concordance.foreign-hit + tr.concordance:not(.foreign-hit) > td {
	padding-top: 0.6em;
}

tr.rounded > td.doc-version {
	padding-left: 1.5em;
}

tr.concordance {
	> td {
		transition: padding 0.1s;
	}

	&.open {
		> td {
			background: white;
			border-top: 2px solid #ddd;
			border-bottom: 1px solid #ddd;
			padding-top: 8px;
			padding-bottom: 8px;
			&:first-child {
				border-left: 2px solid #ddd;
				border-top-left-radius: 4px;
				border-bottom-left-radius: 0;
			}
			&:last-child {
				border-right: 2px solid #ddd;
				border-top-right-radius: 4px;
				border-bottom-right-radius: 0;
			}
		}
	}
	&-details {
		> td {
			background: white;
			border: 2px solid #ddd;
			border-top: none;
			border-radius: 0px 0px 4px 4px;
			padding: 15px 20px;

			> p {
				margin: 0 6px 10px;
			}
		}
	}
}

</style>