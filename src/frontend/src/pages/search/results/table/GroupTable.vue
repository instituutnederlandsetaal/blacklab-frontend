<template>
	<table class="group-table">
		<thead>
			<tr class="rounded">
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
		</thead>
		<tbody>
			<template v-for="row in data">
				<GroupRow :key="row.id"
					:data="row"
					:columns="columns"
					:maxima="maxima"
					@click.native="$set(open, row.id, !open[row.id])"
				/>
				<GroupRowDetails :key="`${row.id}-concordances`" v-show="open[row.id]"
					:type="type"

					:query="query"
					:mainAnnotation="mainAnnotation"
					:otherAnnotations="otherAnnotations"
					:metadata="metadata"

					:disabled="disabled"
					:dir="dir"
					:html="html"
					:data="row"
					:open="open[row.id]"

					@openFullConcordances="$emit('openFullConcordances', row.id, row.displayname)"
					@close="$set(open, row.id, false)"
				/>
			</template>
		</tbody>
	</table>

</template>

<script lang="ts">
import Vue from 'vue';

import { BLSearchParameters } from '@/types/blacklabtypes';
import { NormalizedAnnotation, NormalizedMetadataField } from '@/types/apptypes';

import {GroupRowData, definitions} from '@/pages/search/results/table/groupTable';
import GroupRow from '@/pages/search/results/table/GroupRow.vue';
import GroupRowDetails from '@/pages/search/results/table/GroupRowDetails.vue';

export {GroupRowData} from '@/pages/search/results/table/groupTable';

export default Vue.extend({
	components: {
		GroupRow, GroupRowDetails
	},
	props: {
		type: String as () => 'hits'|'docs',
		headers: Array as () => Array<{
			label: string,
			key: string,
			title: string,
			sortProp?: string,
			isBar?: boolean
		}>,
		columns: Array as () => Array<keyof GroupRowData|[keyof GroupRowData, keyof GroupRowData]>,
		data: Array as () => GroupRowData[],
		maxima: Object as () => Record<keyof GroupRowData, number>,

		mainAnnotation: Object as () => NormalizedAnnotation,
		/** Required to render group contents if they're hits, optional */
		otherAnnotations: Array as () => NormalizedAnnotation[]|undefined,
		/** Required to render group contnets if they're metadata. optional. */
		metadata: Array as () => NormalizedMetadataField[]|undefined,

		/** Required to render group contents if they're hits. */
		query: Object as () => BLSearchParameters,
		disabled: Boolean,
		html: Boolean,
		dir: String as () => 'ltr'|'rtl',

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