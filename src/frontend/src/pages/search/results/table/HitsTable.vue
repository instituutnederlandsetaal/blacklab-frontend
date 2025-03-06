<template functional>
	<table class="hits-table">
		<thead>
			<tr>
				<component v-for="col in props.cols.hitColumns" :is="$options.components.TableHeader" :key="col.key" :col="col" v-on="$listeners" :disabled="props.disabled" />
				<!-- glosses todo -->
				<!-- <th v-for="(fieldName, i) in shownGlossCols" :key="i"><a class='sort gloss_field_heading' :title="`User gloss field: ${fieldName}`">{{ fieldName }}</a></th> -->
			</tr>
		</thead>

		<component v-for="(row, i) in props.rows.rows" :is="row.type === 'hit' ? $options.components.HitRow : $options.components.DocRow" :key="i + row.type"
			:row="row"
			:cols="props.cols"
			:info="props.info"
			:disabled="props.disabled"
			:disableDetails="props.disableDetails"
		/>
	</table>
</template>

<script lang="ts">
import Vue from 'vue';

import HitRow from '@/pages/search/results/table/HitRow.vue'
import DocRow from '@/pages/search/results/table/DocRow.vue';
import { ColumnDefs, DisplaySettingsForRendering, Rows } from '@/pages/search/results/table/table-layout';

import TableHeader from './TableHeader.vue';

/**
 * TODO maybe move transformation of blacklab results -> hit row into this component?
 * Might be difficult as we can render this in three places which all have slightly different data.
 */
export default Vue.extend({
	components: { HitRow, DocRow, TableHeader },

	props: {
		cols: Object as () => ColumnDefs,
		rows: Object as () => Rows,
		info: Object as () => DisplaySettingsForRendering,

		disabled: Boolean,
		disableDetails: Boolean,
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