<template>
	<div class="blf-field" :id="htmlId">
		<label v-if="showLabel" :for="`${inputId}_year_from`">
			{{ config.displayName }}
			<small v-if="minDateDisplay && maxDateDisplay" class="blf-muted">({{ minDateDisplay }} to {{ maxDateDisplay }})</small>
		</label>

		<div>
			<div class="dates">
				<label v-if="config.range">From: </label>
				<input class="blf-input" :id="`${inputId}_year_from`" type="number" title="year" placeholder="year" v-model="yearFrom" :min="minYear" :max="maxYear" />
				<input class="blf-input" type="number" title="month" placeholder="month" v-model="monthFrom" min="1" max="12" />
				<input class="blf-input" type="number" title="day" placeholder="day" v-model="dayFrom" min="1" :max="startMonthLength" />
			</div>
			<div v-if="config.range" class="dates">
				<label>To: </label>
				<input class="blf-input" type="number" title="year" placeholder="year" v-model="yearTo" :min="minYear" :max="maxYear" />
				<input class="blf-input" type="number" title="month" placeholder="month" v-model="monthTo" min="1" max="12" />
				<input class="blf-input" type="number" title="day" placeholder="day" v-model="dayTo" min="1" :max="endMonthLength" />
			</div>
		</div>

		<div v-if="!lockedMode && config.range" class="btn-group">
			<button
				v-for="mode in modes"
				type="button"
				:class="['btn btn-default', { active: modelValue.mode === mode.value }]"
				:key="mode.value"
				:value="mode.value"
				:title="mode.title || ''"
				@click="updateMode(mode.value)"
			>
				{{ mode.label }}
			</button>
		</div>
		<small v-if="config.description" class="blf-help-text">{{ config.description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { DateUtils, type DateFieldState, type DateFieldUiConfig } from './date-field';

import type { Option } from '@/shared/utils/options';

type ModeOption = Option & { value: DateFieldState['mode'] };

const props = withDefaults(
	defineProps<{
		config: DateFieldUiConfig;
		modelValue: DateFieldState;
		htmlId: string;
		showLabel?: boolean;
	}>(),
	{
		showLabel: true,
	},
);

const emit = defineEmits<{
	'update:modelValue': [value: DateFieldState];
}>();

const inputId = computed(() => `${props.htmlId}_value`);
const minDate = computed(() => DateUtils.normalizeBoundaryDate(props.config.min));
const maxDate = computed(() => DateUtils.normalizeBoundaryDate(props.config.max));
const minDateDisplay = computed(() => (minDate.value ? DateUtils.luceneToDisplayString(DateUtils.dateValueToLucene(minDate.value, 'start')) : null));
const maxDateDisplay = computed(() => (maxDate.value ? DateUtils.luceneToDisplayString(DateUtils.dateValueToLucene(maxDate.value, 'end')) : null));
const minYear = computed(() => minDate.value?.y);
const maxYear = computed(() => maxDate.value?.y);
const startMonthLength = computed(() => DateUtils.dateValueToLucene({ ...props.modelValue.startDate, d: '' }, 'end').substring(6, 8));
const endMonthLength = computed(() => DateUtils.dateValueToLucene({ ...props.modelValue.endDate, d: '' }, 'end').substring(6, 8));
const lockedMode = computed(() => props.config.mode ?? null);

const modes: ModeOption[] = [
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

const yearFrom = computed({
	get: () => props.modelValue.startDate.y,
	set: (y: string) => updateStartDate({ y }),
});
const monthFrom = computed({
	get: () => props.modelValue.startDate.m,
	set: (m: string) => updateStartDate({ m }),
});
const dayFrom = computed({
	get: () => props.modelValue.startDate.d,
	set: (d: string) => updateStartDate({ d }),
});
const yearTo = computed({
	get: () => props.modelValue.endDate.y,
	set: (y: string) => updateEndDate({ y }),
});
const monthTo = computed({
	get: () => props.modelValue.endDate.m,
	set: (m: string) => updateEndDate({ m }),
});
const dayTo = computed({
	get: () => props.modelValue.endDate.d,
	set: (d: string) => updateEndDate({ d }),
});

function updateStartDate(next: Partial<DateFieldState['startDate']>) {
	emit('update:modelValue', {
		...props.modelValue,
		startDate: {
			...props.modelValue.startDate,
			...next,
		},
	});
}

function updateEndDate(next: Partial<DateFieldState['endDate']>) {
	emit('update:modelValue', {
		...props.modelValue,
		endDate: {
			...props.modelValue.endDate,
			...next,
		},
	});
}

function updateMode(mode: DateFieldState['mode']) {
	emit('update:modelValue', {
		...props.modelValue,
		mode,
	});
}
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