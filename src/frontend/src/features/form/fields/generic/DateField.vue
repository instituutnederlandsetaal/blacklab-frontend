<template>
	<div v-bind="field.rootAttrs">
		<label v-if="showLabel" :for="`${field.inputId}_year_from`" :class="['control-label', field.labelClass]">
			{{ displayName }}
			<small v-if="minDateDisplay && maxDateDisplay" class="text-muted">({{ minDateDisplay }} to {{ maxDateDisplay }})</small>
			<Debug> [{{ id }}]</Debug>
		</label>
		<Debug v-else>
			<label :class="['control-label', field.labelClass]">[{{ id }}]</label>
		</Debug>

		<div :class="field.controlsClass">
			<div>
				<div class="dates">
					<label v-if="range">{{ $t(`filter.range.from`) }}: </label>
					<input
						:class="['form-control', field.inputClass]"
						:id="`${field.inputId}_year_from`"
						type="number"
						title="year"
						placeholder="year"
						v-model="yearFrom"
						:min="minYear"
						:max="maxYear"
						:disabled
					/>
					<input :class="['form-control', field.inputClass]" type="number" title="month" placeholder="month" v-model="monthFrom" min="1" max="12" :disabled />
					<input :class="['form-control', field.inputClass]" type="number" title="day" placeholder="day" v-model="dayFrom" min="1" :max="startMonthLength" :disabled />
				</div>
				<div v-if="range" class="dates">
					<label>{{ $t(`filter.range.to`) }}: </label>
					<input :class="['form-control', field.inputClass]" type="number" title="year" placeholder="year" v-model="yearTo" :min="minYear" :max="maxYear" :disabled />
					<input :class="['form-control', field.inputClass]" type="number" title="month" placeholder="month" v-model="monthTo" min="1" max="12" :disabled />
					<input :class="['form-control', field.inputClass]" type="number" title="day" placeholder="day" v-model="dayTo" min="1" :max="endMonthLength" :disabled />
				</div>
			</div>

			<div v-if="!mode && range" :class="['btn-group', field.buttonGroupClass]">
				<button
					v-for="mode in modeOptions ?? rawRangeModeOptions"
					type="button"
					:class="['btn btn-default', { active: modelValue.mode === mode.value }]"
					:key="mode.value"
					:value="mode.value"
					:title="optionText(mode.title) || ''"
					:disabled
					@click="updateMode(mode.value)"
				>
					{{ optionLabel(mode) }}
				</button>
			</div>
			<small v-if="description" class="help-block">{{ description }}</small>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useFieldPresentation } from '../field-presentation';
import { DateUtils, type DateFieldComponentProps, type DateFieldState } from './date-field';
import { rawRangeModeOptions } from './range-mode';

import { optionLabel, optionText } from '@/shared/utils/options';

const props = withDefaults(defineProps<DateFieldComponentProps>(), {
	showLabel: true,
});

const emit = defineEmits<{
	'update:modelValue': [value: DateFieldState];
}>();

const field = useFieldPresentation(props);
const minDate = computed(() => DateUtils.normalizeBoundaryDate(props.min));
const maxDate = computed(() => DateUtils.normalizeBoundaryDate(props.max));
const minDateDisplay = computed(() => (minDate.value ? DateUtils.dateValueToDisplayString(minDate.value) : null));
const maxDateDisplay = computed(() => (maxDate.value ? DateUtils.dateValueToDisplayString(maxDate.value) : null));
const minYear = computed(() => minDate.value?.y);
const maxYear = computed(() => maxDate.value?.y);
const startMonthLength = computed(() => DateUtils.dateValueToString({ ...props.modelValue.startDate, d: '' }, 'end').substring(6, 8));
const endMonthLength = computed(() => DateUtils.dateValueToString({ ...props.modelValue.endDate, d: '' }, 'end').substring(6, 8));

function dateModel(boundary: 'startDate' | 'endDate', part: keyof DateFieldState['startDate']) {
	return computed({
		get: () => props.modelValue[boundary][part],
		set: (value: string) =>
			emit('update:modelValue', {
				...props.modelValue,
				[boundary]: { ...props.modelValue[boundary], [part]: value },
			}),
	});
}

const yearFrom = dateModel('startDate', 'y');
const monthFrom = dateModel('startDate', 'm');
const dayFrom = dateModel('startDate', 'd');
const yearTo = dateModel('endDate', 'y');
const monthTo = dateModel('endDate', 'm');
const dayTo = dateModel('endDate', 'd');

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
