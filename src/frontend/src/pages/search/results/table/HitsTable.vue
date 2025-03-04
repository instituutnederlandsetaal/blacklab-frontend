<template>
	<table class="hits-table">
		<thead>
			<tr>
				<TableHeader v-for="col in cols.hitColumns" :key="col.key" :col="col" @changeSort="changeSort" :disabled="disabled" />
				<!-- glosses todo -->
				<!-- <th v-for="(fieldName, i) in shownGlossCols" :key="i"><a class='sort gloss_field_heading' :title="`User gloss field: ${fieldName}`">{{ fieldName }}</a></th> -->
			</tr>
		</thead>
		<template v-for="(row, i) in rows.rows">
			<HitRow v-if="row.type === 'hit'"
				:row="row"
				:cols="cols"
				:info="info"
				:disabled="disabled"
				:disableDetails="disableDetails"
			/>

			<DocRow v-else-if="row.type === 'doc'"
				:row="row"
				:cols="cols"
				:info="info"
			/>
		</template>
	</table>
</template>

<script lang="ts">
import Vue from 'vue';

import HitRow from '@/pages/search/results/table/HitRow.vue'
import DocRow from '@/pages/search/results/table/DocRow.vue';
import { ColumnDefs, DisplaySettingsForRendering, Rows } from '@/utils/hit-highlighting';

import TableHeader from './TableHeader.vue';

/**
 * TODO maybe move transformation of blacklab results -> hit row into this component?
 * Might be difficult as we can render this in three places which all have slightly different data.
 */
export default Vue.extend({
	components: {
		DocRow,
		HitRow,
		TableHeader,
	},
	props: {
		cols: Object as () => ColumnDefs,
		rows: Object as () => Rows,
		info: Object as () => DisplaySettingsForRendering,

		disabled: Boolean,
		disableDetails: Boolean
	},
	data: () => ({
		openRows: {} as Record<string, boolean>,
		hoverMatchInfos: null as null|{docPid: string, matchInfos: string[]}
	}),
	methods: {
		changeSort(sort: string) {
			this.$emit('changeSort', sort)
		},
	},
})

</script>

<style lang="scss">

table.hits-table {
	th, td {
		&:first-child { padding-left: 6px; }
		&:last-child { padding-right: 6px; }
	}

	border-collapse: separate;
	table-layout: auto;
}


</style>