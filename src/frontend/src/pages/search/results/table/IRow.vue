<template>

</template>

<script lang="ts">
import { ColumnDefs, DisplaySettingsForRendering, Maxima } from '@/pages/search/results/table/table-layout';
import { BLSearchParameters } from '@/types/blacklabtypes';
import Vue from 'vue';

/**
 * A base component for result rows in the results table.
 * It only serves a generic prop interface for the row data.
 * Defining all props here prevents Vue outputting attribute="[object object]" in the html if a row doesn't use a prop.
 */
export default Vue.extend({
	props: {
		// Row defined in subclasses, e.g. HitRowData, DocRowData
		// Because it's hard to make generic type in props.
		info: Object as () => DisplaySettingsForRendering,
		cols: Object as () => ColumnDefs,

		maxima: Object as () => Maxima,

		open: Boolean,
		disabled: Boolean,
		type: String as () => 'hits'|'docs',
		query: Object as () => BLSearchParameters,

		/** which match infos (capture/relation) should be highlighted because we're hovering over a token? (parallel corpora) */
		hoverMatchInfos: {
			type: Array as () => string[],
			default: () => [],
		},
	}
})

</script>