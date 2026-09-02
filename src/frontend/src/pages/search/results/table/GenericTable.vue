<template>
	<div ref="root" class="results-table-scroll">
		<table class="results-table">
			<thead>
				<tr>
					<TableHeader v-for="(col, i) in header" :key="col.key" :col="col" :disabled="disabled" @changeSort="emit('changeSort', $event)" :sort="sort">
						<v-dropdown v-if="i === 0 && col.field === 'group'" :distance="5" style="display: inline-block">
							<a role="button" :title="columnMeaningsLabel">
								<span class="fa fa-lg fa-question-circle" aria-hidden="true"></span>
								<span class="sr-only">{{ columnMeaningsLabel }}</span>
							</a>
							<template #popper>
								<table class="table table-condensed" style="table-layout: auto; max-width: calc(100vw - 75px); width: 500px">
									<tbody>
										<tr v-for="(row, i) in columnDefinitions" :key="i">
											<td v-for="(cell, j) in row" :key="j">{{ cell }}</td>
										</tr>
									</tbody>
								</table>
							</template>
						</v-dropdown>
					</TableHeader>
				</tr>
			</thead>
			<tbody :class="{ 'has-foreign-hit': rows.rows.some(row => row.type === 'hit' && row.isForeign) }">
				<template v-for="(row, index) in rows.rows" :key="index">
					<template v-if="row.type === 'doc' && !showTitles"></template>
					<template v-else>
						<component
							:is="row.type === 'doc' ? DocRow : row.type === 'hit' ? HitRow : GroupRow"
							:class="{
								rounded: true,
								open: openRows[row.hit_id || index],
								interactable: isOpenable(row),
								topborder: index > 0 && 'first_of_hit' in row && row.first_of_hit,
								bottomborder: 'last_of_hit' in row && row.last_of_hit && index < rows.rows.length - 1,
								muted: row.muted,
							}"
							v-bind="commonRowProps(row, index)"
							@hover="publishHover(row, $event)"
							@unhover="publishHover(row)"
							@click="toggleRow(index)"
							@toggle="toggleRow(index)"
						/>
						<component
							v-if="!disableDetails"
							v-show="openRows[row.hit_id || index]"
							:id="detailsId(index)"
							:is="row.type === 'doc' ? DocRowDetails : row.type === 'hit' ? HitRowDetails : GroupRowDetails"
							:class="{
								details: true,
								rounded: true,
								open: openRows[row.hit_id || index],
								muted: row.muted,
							}"
							v-bind="commonRowProps(row, index)"
							@hover="publishHover(row, $event)"
							@unhover="publishHover(row)"
							@close="toggleRow(index, true)"
							@openFullConcordances="openFullConcordances(row)"
						/>
					</template>
				</template>
			</tbody>
		</table>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';

import type { IRowProps } from '@/pages/search/results/table/IRow';
import type { ColumnDef, ColumnDefs, DisplaySettingsForRendering, DocRowData, GroupRowData, HitRowData, Rows } from '@/pages/search/results/table/table-layout';
import { definitions as genericDefinitions } from '@/pages/search/results/table/table-layout';
import type { BLCollocationsParameters, BLSearchParameters } from '@/types/blacklabtypes';

import DocRow from '@/pages/search/results/table/DocRow.vue';
import DocRowDetails from '@/pages/search/results/table/DocRowDetails.vue';
import GroupRow from '@/pages/search/results/table/GroupRow.vue';
import GroupRowDetails from '@/pages/search/results/table/GroupRowDetails.vue';
import HitRow from '@/pages/search/results/table/HitRow.vue';
import HitRowDetails from '@/pages/search/results/table/HitRowDetails.vue';
import TableHeader from '@/pages/search/results/table/TableHeader.vue';

const emit = defineEmits<{
	viewgroup: [id: string, displayname: string];
	changeSort: [sortProp: string];
}>();
const props = withDefaults(
	defineProps<{
		cols: ColumnDefs;
		header: ColumnDef[];
		rows: Rows;
		info: DisplaySettingsForRendering;
		disabled?: boolean;
		disableDetails?: boolean;

		showTitles?: boolean;
		sort?: string | null;

		type: 'hits' | 'docs';
		operation?: 'hits' | 'docs' | 'collocations';
		query?: BLSearchParameters | BLCollocationsParameters;
	}>(),
	{
		showTitles: true,
	},
);

const tableId = useId();
const root = ref<HTMLElement | null>(null);
const openRows = ref<Record<number | string, boolean>>({});
const hoverMatchInfos = ref<undefined | string[]>(undefined);
const hoverMatchInfosId = ref<undefined | string>(undefined);
const columnMeaningsLabel = computed(() => (props.operation === 'collocations' ? props.info.i18n.$t('collocations.results.columnMeanings').toString() : 'Column meanings'));
const columnDefinitions = computed(() => {
	if (props.operation !== 'collocations') return genericDefinitions;
	const scorer = props.info.collocationScorer;
	const scorerLabel =
		scorer === 'coll-dice'
			? props.info.i18n.$t('collocations.scorers.dice').toString()
			: scorer === 'coll-salience'
				? props.info.i18n.$t('collocations.scorers.salience').toString()
				: scorer || props.info.i18n.$t('collocations.scorer').toString();
	return [
		[props.info.i18n.$t('collocations.results.collocate').toString(), props.info.i18n.$t('collocations.results.help.collocate').toString()],
		[props.info.i18n.$t('collocations.results.association', { scorer: scorerLabel }).toString(), props.info.i18n.$t('collocations.results.help.association', { scorer: scorerLabel }).toString()],
		[props.info.i18n.$t('collocations.results.cooccurrences').toString(), props.info.i18n.$t('collocations.results.help.cooccurrences').toString()],
		[props.info.i18n.$t('collocations.results.documents').toString(), props.info.i18n.$t('collocations.results.help.documents').toString()],
	];
});

type RowData = HitRowData | DocRowData | GroupRowData;

function commonRowProps(row: RowData, index: number): IRowProps<any> {
	return {
		row,
		info: props.info,
		cols: props.cols,
		maxima: props.rows.maxima,
		open: !!openRows.value[row.hit_id || index],
		disabled: props.disabled,
		detailsEnabled: isOpenable(row),
		detailsId: detailsId(index),
		type: props.type,
		operation: props.operation,
		query: props.query,
		hoverMatchInfos: row.hit_id === hoverMatchInfosId.value ? hoverMatchInfos.value : undefined,
	};
}
function detailsId(index: number) {
	return `${tableId}-result-row-details-${index}`;
}
function publishHover(row: RowData, matchInfos?: string[]) {
	hoverMatchInfos.value = matchInfos;
	hoverMatchInfosId.value = row.hit_id;
}
function isOpenable(row: RowData) {
	return !props.disabled && !props.disableDetails && (row.type === 'group' || (row.type === 'hit' ? props.type === 'hits' : props.type === 'docs' && !!row.hits));
}
function toggleRow(index: number, restoreFocus = false) {
	const row = props.rows.rows[index];
	if (!isOpenable(row)) return;
	const id = row.hit_id || index;
	openRows.value[id] = !openRows.value[id];
	if (restoreFocus) void nextTick(() => root.value?.querySelector<HTMLButtonElement>(`button[aria-controls="${detailsId(index)}"]`)?.focus());
}
function openFullConcordances(row: RowData) {
	if ('displayname' in row) {
		emit('viewgroup', row.id, row.displayname);
	}
}

watch(
	() => props.query,
	() => (openRows.value = {}),
);
</script>

<style lang="scss">
.results-table-scroll {
	max-width: 100%;
	min-width: 0;
	overflow-x: auto;
}

table.results-table {
	width: 100%;
	min-width: 36rem;
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
			background-color: #eee !important;
		}
		&:active {
			background-color: #ddd !important;
		}
	}

	tr.rounded {
		> th,
		> td {
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

		&.open:not(.details) > td,
		&.open > th {
			border-bottom-left-radius: 0;
			border-bottom-right-radius: 0;
		}
		&.open.details > td,
		&.open > th {
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
				&:first-child {
					border-left: 2px solid #ddd;
				}
				&:last-child {
					border-right: 2px solid #ddd;
				}
			}
			&.details > td {
				border-top: none;
				border-bottom: 2px solid #ddd;
				padding: 15px 20px;
				> p {
					margin: 0 6px 10px;
				}
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

	tr.muted + tr:not(.muted) {
		border-top: 2px dashed #aaa;
	}
	tr:not(.muted) + tr.muted {
		border-top: 2px dashed #aaa;
	}

	// Subtly style rows outside the shared URL-requested range
	tr.muted {
		font-style: italic;
		opacity: 0.7;
		&:hover {
			opacity: 1;
		}
	}
}
</style>
