<template>

</template>

<script lang="ts">
import type { ColumnDefs, DisplaySettingsForRendering, Maxima } from '@/pages/search/results/table/table-layout';
import type { BLSearchParameters } from '@/types/blacklabtypes';
import type { PropType } from 'vue';
import { defineComponent } from 'vue';

/**
 * A base component for result rows in the results table.
 * It only serves a generic prop interface for the row data.
 * Defining all props here prevents Vue outputting attribute="[object object]" in the html if a row doesn't use a prop.
 */
export default defineComponent({
	props: {
		// Row defined in subclasses, e.g. HitRowData, DocRowData
		// Because it's hard to make generic type in props.
		info: { type: Object as PropType<DisplaySettingsForRendering>, required: true },
		cols: { type: Object as PropType<ColumnDefs>, required: true },

		maxima: { type: Object as PropType<Maxima>, required: true },

		open: Boolean,
		disabled: Boolean,
		type: { type: String as PropType<'hits'|'docs'>, required: true },
		query: { type: Object as PropType<BLSearchParameters>, required: true },

		/** which match infos (capture/relation) should be highlighted because we're hovering over a token? (parallel corpora) */
		hoverMatchInfos: {
			type: Array as PropType<string[]>,
			default: () => [],
		},
	}
})

</script>