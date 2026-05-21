<template>
	<div class="blf-field" :id="htmlId" :data-filterfield-type="definition.componentName">
		<label v-if="showLabel" :for="inputId + '_year_from'"
			>{{ displayName }}
			<small v-if="minDateDisplay && maxDateDisplay" class="blf-muted">({{ minDateDisplay }} to {{ maxDateDisplay }})</small>
		</label>

		<div>
			<div class="dates">
				<label v-if="metadata.range">From: </label>
				<input class="blf-input" :id="inputId + '_year_from'" type="number" title="year" placeholder="year" v-model="yearFrom" :min="minYear" :max="maxYear" />
				<input class="blf-input" type="number" title="month" placeholder="month" v-model="monthFrom" min="1" max="12" />
				<input class="blf-input" type="number" title="day" placeholder="day" v-model="dayFrom" min="1" :max="startMonthLength" />
			</div>
			<div v-if="metadata.range" class="dates">
				<label>To: </label>
				<input class="blf-input" type="number" title="year" placeholder="year" v-model="yearTo" :min="minYear" :max="maxYear" />
				<input class="blf-input" type="number" title="month" placeholder="month" v-model="monthTo" min="1" max="12" />
				<input class="blf-input" type="number" title="day" placeholder="day" v-model="dayTo" min="1" :max="endMonthLength" />
			</div>
		</div>

		<div class="btn-group" v-if="!lockedMode && metadata.range">
			<button
				v-for="mode in modes"
				type="button"
				:class="['btn btn-default', { active: model.mode === mode.value }]"
				:key="mode.value"
				:value="mode.value"
				:title="mode.title || ''"
				@click="e_input({ ...model, mode: mode.value })"
			>
				{{ mode.label }}
			</button>
		</div>
		<small v-if="description" class="blf-help-text">{{ description }}</small>
	</div>
</template>

<script lang="ts">
import type { PropType } from 'vue';
import { defineComponent } from 'vue';

import type { FilterDateMetadata, FilterDateValue as FilterDateValueExternal } from '../../model/filter-value-functions';
import { DateUtils } from '../../model/filter-value-functions';
import createBaseFilterComponent from './FilterBase';

import type { Option } from '@/shared/utils/options';

type ModeOption = Option & { value: FilterDateValue['mode'] };

type FilterDateValue = FilterDateValueExternal & { isDefaultValue?: boolean };

export default defineComponent({
	extends: createBaseFilterComponent<FilterDateValue, FilterDateMetadata>({
		type: Object as PropType<FilterDateValue>,
		default: () => ({
			startDate: {
				y: '',
				m: '',
				d: '',
			},
			endDate: {
				y: '',
				m: '',
				d: '',
			},
			mode: 'strict' as const,
			/**
			 * props.definition.metadata can contain a default value.
			 * props.value is our actual value we pass to the calendar, on first setup this is undefined, so we set a default here in this object.
			 *
			 * We want to apply the defaults from definition.metadata to our default value object, but we can't do that,
			 * because we can't access the other props here (as the component hasn't been fully created yet).
			 *
			 * So what we do:
			 * Mark the default value with this boolean
			 * Instead of putting this into our calendar directly, pass it through computedValue() first
			 * There, see if we have this boolean, and if so, replace the two defaults defined above with those from defintion.metadata.
			 *
			 * Then when the user interacts with the calender (i.e. overwrites the default value) this boolean will disappear, and the user dates will be used.
			 * Conveniently this system also lets us detect when only the strict/permissive toggle has been changed, but not the date.
			 */
			isDefaultValue: true,
		}),
	}),
	computed: {
		model(): FilterDateValue {
			return this.modelValue;
		},
		metadata(): FilterDateMetadata {
			return (
				this.definition.metadata || {
					field: this.id,
					range: false,
				}
			);
		},
		fieldName(): string | null {
			return 'field' in this.metadata ? this.metadata.field : null;
		},
		rangeFields(): { from: string; to: string } | null {
			return 'from_field' in this.metadata ? { from: this.metadata.from_field, to: this.metadata.to_field } : null;
		},
		lockedMode(): FilterDateValue['mode'] | null {
			return 'mode' in this.metadata ? (this.metadata.mode ?? null) : null;
		},
		// This can probably be a little simpler, but whatever.
		minDate(): FilterDateValue['startDate'] | null {
			return DateUtils.normalizeBoundaryDate(this.metadata.min);
		},
		maxDate(): FilterDateValue['startDate'] | null {
			return DateUtils.normalizeBoundaryDate(this.metadata.max);
		},
		minDateDisplay(): string | null {
			return this.minDate ? DateUtils.luceneToDisplayString(DateUtils.dateValueToLucene(this.minDate, 'start')) : null;
		},
		maxDateDisplay(): string | null {
			return this.maxDate ? DateUtils.luceneToDisplayString(DateUtils.dateValueToLucene(this.maxDate, 'end')) : null;
		},
		minYear(): string | undefined {
			return this.minDate ? this.minDate.y : undefined;
		},
		maxYear(): string | undefined {
			return this.maxDate ? this.maxDate.y : undefined;
		},
		startMonthLength(): string {
			return DateUtils.dateValueToLucene({ ...this.model.startDate, d: '' }, 'end')!.substring(6, 8);
		},
		endMonthLength(): string {
			return DateUtils.dateValueToLucene({ ...this.model.endDate, d: '' }, 'end')!.substring(6, 8);
		},

		modes(): ModeOption[] {
			return [
				{
					value: 'permissive',
					label: 'Permissive',
					title: 'Match overlapping date ranges.',
				},
				{
					value: 'strict',
					label: 'Strict',
					title: 'Match date ranges fully inside the selected bounds.',
				},
			];
		},

		yearFrom: {
			get(): string {
				return this.model.startDate.y;
			},
			set(y: string) {
				this.e_input({ ...this.model, startDate: { ...this.model.startDate, y }, isDefaultValue: false });
			},
		},
		monthFrom: {
			get(): string {
				return this.model.startDate.m;
			},
			set(m: string) {
				this.e_input({ ...this.model, startDate: { ...this.model.startDate, m }, isDefaultValue: false });
			},
		},
		dayFrom: {
			get(): string {
				return this.model.startDate.d;
			},
			set(d: string) {
				this.e_input({ ...this.model, startDate: { ...this.model.startDate, d }, isDefaultValue: false });
			},
		},
		yearTo: {
			get(): string {
				return this.model.endDate.y;
			},
			set(y: string) {
				this.e_input({ ...this.model, endDate: { ...this.model.endDate, y }, isDefaultValue: false });
			},
		},
		monthTo: {
			get(): string {
				return this.model.endDate.m;
			},
			set(m: string) {
				this.e_input({ ...this.model, endDate: { ...this.model.endDate, m }, isDefaultValue: false });
			},
		},
		dayTo: {
			get(): string {
				return this.model.endDate.d;
			},
			set(d: string) {
				this.e_input({ ...this.model, endDate: { ...this.model.endDate, d }, isDefaultValue: false });
			},
		},
	},
});
</script>

<style lang="scss" scoped>
.dates {
	display: flex;
	flex-wrap: nowrap;
	width: 100%;
	align-items: baseline;
	margin-bottom: 10px;
	> *:not(:last-child) {
		margin-right: 15px;
	}
	> label {
		width: 3em;
		flex: none;
	}
}
</style>
