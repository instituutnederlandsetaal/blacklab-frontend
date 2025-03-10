<template>
	<table class="results-table">
		<thead>
			<tr>
				<TableHeader v-for="col in header" :key="col.key" :col="col" :disabled="disabled" @changeSort="$emit('changeSort', $event)"/>
			</tr>
		</thead>
		<tbody>
			<template v-for="(row, index) in rows.rows">
				<template v-if="row.type === 'doc' && !showTitles"></template>
				<template v-else>
				<component :is="row.type === 'doc' ? 'DocRow' : row.type === 'hit' ? 'HitRowContext' : 'GroupRow'"
					:class="{
						rounded: true,
						open: openRows[row.hit_id || index],
						interactable: !disabled && !disableDetails && (row.type === 'group' || ((row.type === 'hit') === (type === 'hits')) && ((row.type === 'doc') == (type === 'docs'))) ,
						topborder: index > 0 && row.first_of_hit,
						bottomborder: row.last_of_hit && (index < rows.rows.length - 1)
					}"
					:row="row"
					:maxima="rows.maxima"
					:open="!!openRows[row.hit_id || index]"
					:hoverMatchInfos="row.hit_id === hoverMatchInfosId ? hoverMatchInfos : undefined"
					@hover="hoverMatchInfos = $event; hoverMatchInfosId = row.hit_id"
					@unhover="hoverMatchInfos = undefined"
					v-bind="$props"
					v-on="$listeners"

					@click.native="toggleRow(index, $event)"
				/>
				<component v-if="!disableDetails" v-show="openRows[row.hit_id || index]":is="row.type === 'doc' ? 'DocRowDetails' : row.type === 'hit' ? 'HitRowDetails' : 'GroupRowDetails'"
					:class="{
						details: true,
						rounded: true,
						open: openRows[row.hit_id || index],
					}"
					:row="row"
					:maxima="rows.maxima"
					:open="!!openRows[row.hit_id || index]"
					:hoverMatchInfos="row.hit_id === hoverMatchInfosId ? hoverMatchInfos : undefined"
					@hover="hoverMatchInfos = $event; hoverMatchInfosId = index"
					@unhover="hoverMatchInfos = undefined"
					@close="toggleRow(index, $event)"
					@openFullConcordances="openFullConcordances(row)"
					v-bind="$props"
					v-on="$listeners"
				/>
			</template>
			</template>
		</tbody>
	</table>
</template>

<script lang="ts">
import Vue from 'vue';

import TableHeader from '@/pages/search/results/table/TableHeader.vue';
import { definitions, ColumnDefs, DisplaySettingsForRendering, Rows, ColumnDef, HitRowData, GroupRowData } from '@/pages/search/results/table/table-layout';
import { BLSearchParameters } from '@/types/blacklabtypes';


// ensure we have these components loaded
import '@/pages/search/results/table/DocRow.vue';
import '@/pages/search/results/table/DocRowDetails.vue';
import '@/pages/search/results/table/HitRowDetails.vue';
import '@/pages/search/results/table/HitRowContext.vue';
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

		/// UGH, required to get group contents as this is not exposed in the results directly.
		type: String as () => 'hits'|'docs',
		query: Object as () => BLSearchParameters,
	},
	data: () => ({
		definitions,
		openRows: {} as Record<number|string, boolean>,

		hoverMatchInfos: undefined as undefined|string[],
		hoverMatchInfosId: undefined as undefined|number,
	}),
	methods: {
		toggleRow(index: number, event: any) {
			if (this.disabled || this.disableDetails) return;
			const row = this.rows.rows[index];
			const id = (row as HitRowData).hit_id || index;
			const newState = !this.openRows[id];
			this.$set(this.openRows, id, newState);
		},
		openFullConcordances(row: GroupRowData) {
			this.$emit('openFullConcordances2', row.id, row.displayname);
		}
	},
	watch: {
		rows() { this.openRows = {}; }
	}
})
</script>

<style lang="scss">



table.results-table {
	table-layout: auto;
	// border-collapse: separate;
	border-collapse: collapse;

	> thead th {
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





	tr:not(.foreign-hit) + tr.foreign-hit:first-child > td { padding-top: 0.5em; }
	tr.has-foreign-hit:last-child > td { padding-bottom: 0.5em; }
	tbody + tbody.has-foreign-hit > tr:first-child > td {
		border-top: 1px solid #ddd;
	}

	tbody.has-foreign-hit > tr:not(.open) > td {
		border-radius: 0!important;
	}

	tr.foreign-hit {
		color: #666;
		font-style: italic;
	}

}

</style>