<template>
	<table class="group-table">
		<thead>
			<tr class="rounded">
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

			<!-- <tr class="rounded">
				<th v-for="(header, i) in headers"
					:key="header.key"
					:title="header.title"
					:style="header.isBar ? 'width: 60%;' : ''"
				>
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

					<a v-if="header.sortProp"
						role="button"
						:class="{sort: true, disabled}"
						:title="`${header.title} ${$t('results.table.clickToSort')}`"
						@click="changeSort(header.sortProp)"
					>
						{{header.label}}
					</a>
					<template v-else>{{header.label}}</template>
				</th>
			</tr>
		</thead> -->
		<tbody>
			<template v-for="row in rows.rows">
				<template v-if="row.type === 'group'">
					<GroupRow
						:key="row.id"
						:data="row"
						:columns="cols"
						:maxima="rows.maxima"
						@click.native="$set(open, row.id, !open[row.id])"
					/>
					<GroupRowDetails :key="`${row.id}-concordances`" v-show="open[row.id]"
						:info="info"
						:new_data="row"
						:cols="cols"

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
import { definitions } from '@/pages/search/results/table/groupTable';
import GroupRow from '@/pages/search/results/table/GroupRow.vue';
import GroupRowDetails from '@/pages/search/results/table/GroupRowDetails.vue';
import { ColumnDefs, DisplaySettings, Rows } from '@/utils/hit-highlighting';
import TableHeader from '@/pages/search/results/table/TableHeader.vue';

export default Vue.extend({
	components: {
		GroupRow, GroupRowDetails, TableHeader
	},
	props: {
		cols: Object as () => ColumnDefs,
		rows: Object as () => Rows,
		info: Object as () => DisplaySettings,

		disabled: Boolean,

		/// UGH, required to get group contents as this is not exposed in the results directly.
		type: String as () => 'hits'|'docs',
		query: Object as () => BLSearchParameters,

		// type: String as () => 'hits'|'docs',
		// headers: Array as () => Array<{
		// 	label: string,
		// 	key: string,
		// 	title: string,
		// 	sortProp?: string,
		// 	isBar?: boolean
		// }>,
		// columns: Array as () => Array<keyof GroupRowData|[keyof GroupRowData, keyof GroupRowData]>,
		// data: Array as () => GroupRowData[],
		// maxima: Object as () => Record<keyof GroupRowData, number>,

		// mainAnnotation: Object as () => NormalizedAnnotation,
		// /** Required to render group contents if they're hits, optional */
		// otherAnnotations: Array as () => NormalizedAnnotation[]|undefined,
		// /** Required to render group contnets if they're metadata. optional. */
		// metadata: Array as () => NormalizedMetadataField[]|undefined,

		// /** Required to render group contents if they're hits. */
		// query: Object as () => BLSearchParameters,
		// disabled: Boolean,
		// html: Boolean,
		// dir: String as () => 'ltr'|'rtl',

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