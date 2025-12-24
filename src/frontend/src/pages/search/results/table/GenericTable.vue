<template>
	<table class="results-table">
		<thead>
			<tr>
				<TableHeader v-for="(col, i) in header"
					:key="col.key"
					:col="col" :disabled="disabled"
					@changeSort="$emit('changeSort', $event)"
					:sort="sort"
				>
					<v-popover v-if="i === 0 && col.field === 'group'" offset="5" style="display:inline-block;">
						<a role="button" title="Column meanings"><span class="fa fa-lg fa-question-circle"></span></a>
						<template slot="popover">
							<table class="table table-condensed" style="table-layout:auto; max-width:calc(100vw - 75px);width:500px;">
								<tbody>
									<tr v-for="(row, i) in definitions" :key="i">
										<td v-for="(cell, j) in row" :key="j">{{cell}}</td>
									</tr>
								</tbody>
							</table>
						</template>
					</v-popover>
				</TableHeader>
			</tr>
		</thead>
		<tbody :class="{ 'has-foreign-hit': hasForeignHit(rows), 'has-url-range': hasUrlRange }">
			<template v-for="(row, index) in rows.rows">
				<template v-if="row.type === 'doc' && !showTitles"></template>
				<template v-else>
				<component :is="row.type === 'doc' ? 'DocRow' : row.type === 'hit' ? 'HitRow' : 'GroupRow'"
					:class="{
						rounded: true,
						open: openRows[row.hit_id || index],
						interactable: isOpenable(row),
						topborder: index > 0 && 'first_of_hit' in row && row.first_of_hit,
						bottomborder: 'last_of_hit' in row && row.last_of_hit && (index < rows.rows.length - 1),
						'in-url-range': isInUrlRange(index)
					}"
					:row="row"
					:info="info"
					:cols="cols"
					:maxima="rows.maxima"
					:open="!!openRows[row.hit_id || index]"
					:disabled="disabled"
					:type="type"
					:query="query"
					:hoverMatchInfos="row.hit_id === hoverMatchInfosId ? hoverMatchInfos : undefined"
					@hover="hoverMatchInfos = $event; hoverMatchInfosId = row.hit_id"
					@unhover="hoverMatchInfos = undefined"
					@click.native="toggleRow(index)"
					v-on="$listeners"
				/>
				<component v-if="!disableDetails" v-show="openRows[row.hit_id || index]":is="row.type === 'doc' ? 'DocRowDetails' : row.type === 'hit' ? 'HitRowDetails' : 'GroupRowDetails'"
					:class="{
						details: true,
						rounded: true,
						open: openRows[row.hit_id || index],
					}"
					:row="row"
					:info="info"
					:cols="cols"
					:maxima="rows.maxima"
					:open="!!openRows[row.hit_id || index]"
					:disabled="disabled"
					:type="type"
					:query="query"
					:hoverMatchInfos="row.hit_id === hoverMatchInfosId ? hoverMatchInfos : undefined"
					@hover="hoverMatchInfos = $event; hoverMatchInfosId = row.hit_id"
					@unhover="hoverMatchInfos = undefined"
					@close="toggleRow(index)"
					@openFullConcordances="openFullConcordances(row)"
					v-on="$listeners"
				/>
			</template>
			</template>
		</tbody>
	</table>
</template>

<script lang="ts">
import Vue from 'vue';

import '@/pages/search/results/table/TableHeader.vue';
import { definitions, ColumnDefs, DisplaySettingsForRendering, Rows, ColumnDef, HitRowData, GroupRowData, DocRowData } from '@/pages/search/results/table/table-layout';
import { BLSearchParameters } from '@/types/blacklabtypes';


// ensure we have these components loaded
import '@/pages/search/results/table/DocRow.vue';
import '@/pages/search/results/table/DocRowDetails.vue';
import '@/pages/search/results/table/HitRow.vue';
import '@/pages/search/results/table/HitRowDetails.vue';
import '@/pages/search/results/table/GroupRow.vue';
import '@/pages/search/results/table/GroupRowDetails.vue';

export default Vue.component('GenericTable', {
	props: {
		cols: Object as () => ColumnDefs,
		header: Array as () => ColumnDef[],
		rows: Object as () => Rows,
		info: Object as () => DisplaySettingsForRendering,
		disabled: Boolean,
		disableDetails: Boolean,

		showTitles: { default: true },
		sort: String,

		/// UGH, required to get group contents as this is not exposed in the results directly.
		type: String as () => 'hits'|'docs',
		query: Object as () => BLSearchParameters,

		/**
		 * The starting index of the URL's result range (0-indexed absolute position in result set).
		 * Used to highlight rows that fall within a shared URL's range.
		 */
		urlRangeFirst: {
			type: Number as () => number|null,
			default: null
		},
		/**
		 * The number of results in the URL's range.
		 */
		urlRangeNumber: {
			type: Number as () => number|null,
			default: null
		},
		/**
		 * The first index of the current fetched window (0-indexed absolute position).
		 * This is needed to calculate which rows fall within the URL range.
		 */
		fetchWindowFirst: {
			type: Number as () => number,
			default: 0
		}
	},
	data: () => ({
		definitions,
		openRows: {} as Record<number|string, boolean>,

		hoverMatchInfos: undefined as undefined|string[],
		hoverMatchInfosId: undefined as undefined|string,
	}),
	computed: {
		/**
		 * Whether we have a URL range that differs from the current view.
		 */
		hasUrlRange(): boolean {
			return this.urlRangeFirst != null && this.urlRangeNumber != null;
		}
	},
	methods: {
		/**
		 * Check if a row at the given index (within the fetch window) is part of the URL's range.
		 * @param index - The 0-indexed position within the current fetch window
		 */
		isInUrlRange(index: number): boolean {
			if (!this.hasUrlRange) return false;
			const absoluteIndex = this.fetchWindowFirst + index;
			const urlLast = this.urlRangeFirst! + this.urlRangeNumber! - 1;
			return absoluteIndex >= this.urlRangeFirst! && absoluteIndex <= urlLast;
		},
		isOpenable(row: HitRowData|DocRowData|GroupRowData) {
			if (this.disabled || this.disableDetails) return false;
			if (row.type === 'group') return true;
			if (row.type === 'hit' && this.type === 'hits') return true;
			if (row.type === 'doc' && this.type === 'docs' && row.hits) return true;
			return false;
		},
		hasForeignHit(rows: Rows) {
			return rows.rows.some(row => row.type === 'hit' && row.isForeign);
		},
		toggleRow(index: number) {
			const row = this.rows.rows[index];
			if (!this.isOpenable(row)) return;
			const id = row.hit_id || index;
			const newState = !this.openRows[id];
			this.$set(this.openRows, id, newState);
		},
		openFullConcordances(row: HitRowData|DocRowData|GroupRowData) {
			if ('displayname' in row) {
				this.$emit('viewgroup', row.id, row.displayname);
			}
		}
	},
	watch: {
		query() { this.openRows = {}; }
	}
})
</script>

<style lang="scss">



table.results-table {
	table-layout: auto;
	// border-collapse: separate;
	border-collapse: collapse;

	thead th {
		// text-align: left;
		background-color: white;
		border-bottom: 1px solid #aaa;
		padding-bottom: 5px;
	}

	td {
		vertical-align: top;
		transition: padding 0.1s;
	}

	tr.interactable {
		cursor: pointer;

		&:hover,
		&:focus {
			background-color: #eee!important;
		}
		&:active {
			background-color: #ddd!important;
		}
	}

	tr.rounded {
		> th, > td {
			padding: 0 4px;

			&:first-child {
				border-top-left-radius: 3px;
				border-bottom-left-radius: 3px;
			}
			&:last-child {
				border-top-right-radius: 3px;
				border-bottom-right-radius: 3px;
			}
		}

		&.open:not(.details) > td, &.open > th {
			border-bottom-left-radius: 0;
			border-bottom-right-radius: 0;
		}
		&.open.details > td, &.open > th {
			border-top-left-radius: 0;
			border-top-right-radius: 0;
		}
	}
	tr.open {
		background: white;

		&:not(.grouprow):not(.grouprow-details) {
			> td {
				border-top: 2px solid #ddd;
				border-bottom: 1px solid #ddd;
				padding-top: 8px;
				padding-bottom: 8px;
				&:first-child { border-left: 2px solid #ddd; }
				&:last-child { border-right: 2px solid #ddd; }
			}
			&.details > td {
				border-top: none;
				border-bottom: 2px solid #ddd;
				padding: 15px 20px;
				> p { margin: 0 6px 10px; }
			}
		}
	}

	tr.topborder td {
		border-top: 1px solid #ddd;
		padding-top: 4px;
	}
	tr.bottomborder td {
		border-bottom: 1px solid #ddd;
		padding-bottom: 4px;
	}

	tr.foreign-hit {
		color: #666;
		font-style: italic;
	}

	// Highlight rows that are part of the shared URL's result range
	tr.in-url-range {
		background-color: rgba(#f0ad4e, 0.15);

		&:hover,
		&:focus {
			background-color: rgba(#f0ad4e, 0.25)!important;
		}
	}
}

</style>