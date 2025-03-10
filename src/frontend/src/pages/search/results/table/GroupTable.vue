<template>
	<table class="group-table">
		<thead>
			<tr>
				<TableHeader v-for="(col, i) in cols.groupColumns" :key="col.key" :col="col" @changeSort="changeSort" :disabled="disabled" >
					<v-popover v-if="i === 0" offset="5" style="display:inline-block;">
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
				<!-- glosses todo -->
				<!-- <th v-for="(fieldName, i) in shownGlossCols" :key="i"><a class='sort gloss_field_heading' :title="`User gloss field: ${fieldName}`">{{ fieldName }}</a></th> -->
			</tr>
		</thead>
		<tbody>
			<template v-for="row in rows.rows">
				<template v-if="row.type === 'group'">
					<GroupRow
						:key="row.id"
						:row="row"
						:cols="cols"
						:info="info"
						:maxima="rows.maxima"
						@click.native="$set(open, row.id, !open[row.id])"
					/>
					<GroupRowDetails :key="`${row.id}-concordances`" v-show="open[row.id]"
						:row="row"
						:cols="cols"
						:info="info"

						:open="open[row.id]"
						:disabled="disabled"
						:type="type"
						:query="query"

						@openFullConcordances="$emit('openFullConcordances', row.id, row.displayname)"
						@close="$set(open, row.id, false)"
					/>
				</template>
			</template>
		</tbody>
	</table>
</template>

<script lang="ts">
import Vue from 'vue';

import { BLSearchParameters } from '@/types/blacklabtypes';
import GroupRow from '@/pages/search/results/table/GroupRow.vue';
import GroupRowDetails from '@/pages/search/results/table/GroupRowDetails.vue';
import { definitions, ColumnDefs, DisplaySettingsForRendering, Rows } from '@/pages/search/results/table/table-layout';
import TableHeader from '@/pages/search/results/table/TableHeader.vue';

export default Vue.extend({
	components: {
		GroupRow, GroupRowDetails, TableHeader
	},
	props: {
		cols: Object as () => ColumnDefs,
		rows: Object as () => Rows,
		info: Object as () => DisplaySettingsForRendering,

		disabled: Boolean,

		/// UGH, required to get group contents as this is not exposed in the results directly.
		type: String as () => 'hits'|'docs',
		query: Object as () => BLSearchParameters,
	},
	data: () => ({
		definitions,
		open: {} as Record<string, boolean>,
	}),
	methods: {
		changeSort(sortProp: string) {
			this.$emit('changeSort', sortProp);
		}
	},
	watch: {
		query() {
			this.open = {};
		}
	}
})
</script>

<style lang="scss">
</style>