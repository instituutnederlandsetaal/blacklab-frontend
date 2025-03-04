<template>
	<tbody :class="{interactable: !disableDetails && !disabled, 'has-foreign-hit': row.rows.some(r => r.isForeign)}">
		<!-- Show hits in other fields (parallel corpora) -->
		<template v-for="row in row.rows">
			<HitRowContext
				:class="{open, 'foreign-hit': row.isForeign}"
				:row="row"
				:cols="cols"
				:info="info"
				:html="info.html"
				:hoverMatchInfos="hoverMatchInfos"
				@hover="hoverMatchInfos = $event"
				@unhover="hoverMatchInfos = undefined"
				@click.native="open = disabled ? open : !open"
			/>
			<HitRowDetails v-if="!disableDetails"
				:class="{open}"
				:row="row"
				:cols="cols"
				:info="info"
				:colspan="cols.hitColumns.length"
				:open="open"
				:hoverMatchInfos="hoverMatchInfos"
				@hover="hoverMatchInfos = $event"
				@unhover="hoverMatchInfos = undefined"
			/>
		</template>
	</tbody>
</template>

<script lang="ts">
import Vue from 'vue';
import HitRowDetails from '@/pages/search/results/table/HitRowDetails.vue'
import HitRowContext from '@/pages/search/results/table/HitRowContext.vue'
import { ColumnDefs, DisplaySettingsForRendering, HitRowData } from '@/utils/hit-highlighting';

export default Vue.extend({
	components: {
		HitRowContext,
		HitRowDetails,
	},
	props: {
		row: Object as () => HitRowData,
		cols: Object as () => ColumnDefs,
		info: Object as () => DisplaySettingsForRendering,
		/** Prevent interaction with sorting, expanding/collapsing, etc. */
		disabled: Boolean,
		/** Do not render detail rows, even when not disabled. */
		disableDetails: Boolean,
	},
	data: () => ({
		open: false,
		hoverMatchInfos: undefined as undefined|string[],
	}),
	watch: {
		new_data() { this.open = false; }
	}
})

</script>

<style lang="scss">

tbody.has-foreign-hit > tr:first-child > td { padding-top: 0.5em; }
tbody.has-foreign-hit > tr:last-child > td { padding-bottom: 0.5em; }
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

tr.concordance {
	> td {
		transition: padding 0.1s;
	}

	&.open {
		> td {
			background: white;
			border-top: 2px solid #ddd;
			border-bottom: 1px solid #ddd;
			padding-top: 8px;
			padding-bottom: 8px;
			&:first-child {
				border-left: 2px solid #ddd;
				border-top-left-radius: 4px;
				border-bottom-left-radius: 0;
			}
			&:last-child {
				border-right: 2px solid #ddd;
				border-top-right-radius: 4px;
				border-bottom-right-radius: 0;
			}
		}
	}
	&-details {
		> td {
			background: white;

			border-top: none;
			border-bottom: 2px solid #ddd;
			border-radius: 0;
			&:first-child { border-left: 2px solid #ddd; border-bottom-left-radius: 4px; }
			&:last-child { border-right: 2px solid #ddd; border-bottom-right-radius: 4px; }

			padding: 15px 20px;
			> p {
				margin: 0 6px 10px;
			}
		}
	}
}

</style>