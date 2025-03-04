<template>
	<div>
		<div class="crumbs-totals">
			<slot name="breadcrumbs"/>
			<slot name="totals"/>
		</div>

		<slot name="groupBy"/>
		<slot name="pagination"/>
		<slot name="annotation-switcher"/>

		<DocsTable
			:cols="cols"
			:rows="rows"
			:info="info"

			:showHits="showDocumentHits"
			@changeSort="changeSort"
		/>

		<hr>
		<div class="text-right">
			<slot name="sort"/>
			<button v-if="hasHits"
				type="button"
				class="btn btn-primary btn-sm"

				@click="showDocumentHits = !showDocumentHits"
			>
				{{showDocumentHits ? $t('results.table.hideHits') : $t('results.table.showHits')}}
			</button>
			<slot name="export"/>
		</div>

	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import DocsTable from '@/pages/search/results/table/DocsTable.vue';
import { ColumnDefs, DisplaySettingsForRendering, Rows } from '@/utils/hit-highlighting';

export default Vue.extend({
	components: {
		DocsTable,
	},
	props: {
		cols: Object as () => ColumnDefs,
		rows: Object as () => Rows,
		info: Object as () => DisplaySettingsForRendering,

		// results: Object as () => BLDocResults,
		sort: String as () => string|null,
		disabled: Boolean
	},
	data: () => ({
		showDocumentHits: false
	}),
	computed: {
		hasHits(): boolean { return !!this.rows.rows.some(r => r.type === 'hit' || (r.type === 'doc' && r.hits)); }
	},
	methods: {
		changeSort(payload: string) {
			if (!this.disabled) {
				this.$emit('sort', payload === this.sort ? '-'+payload : payload);
			}
		},
	},
});
</script>

<style lang="scss">

.docs-table {
	table-layout: auto;
	border-collapse: separate;

	> thead > tr > th,
	> tbody > tr > td,
	> tbody > tr > th {
		&:first-child { padding-left: 6px; }
		&:last-child { padding-right: 6px; }
	}


	tr.docrow:not(.hit-details):hover {
		background: #eee;
	}
}

.doclink {
	// Make line clickable when links wraps onto next line.
	display: inline-block;
}

</style>