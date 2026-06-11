<template>
	<div :class="formGroupClasses" :id="htmlId">
		<label v-if="showLabel" :for="`${inputId}_year_from`" class="control-label">
			{{ displayName }}
			<small v-if="minDateDisplay && maxDateDisplay" class="text-muted">({{ minDateDisplay }} to {{ maxDateDisplay }})</small>
		</label>
		<debug> [{{ id }}]</debug>

		<div>
			<div class="dates">
				<label v-if="range">{{ $t(`filter.range.from`) }}: </label>
				<input class="form-control" :id="`${inputId}_year_from`" type="number" title="year" placeholder="year" v-model="yearFrom" :min="minYear" :max="maxYear" :disabled />
				<input class="form-control" type="number" title="month" placeholder="month" v-model="monthFrom" min="1" max="12" :disabled />
				<input class="form-control" type="number" title="day" placeholder="day" v-model="dayFrom" min="1" :max="startMonthLength" :disabled />
			</div>
			<div v-if="range" class="dates">
				<label>{{ $t(`filter.range.to`) }}: </label>
				<input class="form-control" type="number" title="year" placeholder="year" v-model="yearTo" :min="minYear" :max="maxYear" :disabled />
				<input class="form-control" type="number" title="month" placeholder="month" v-model="monthTo" min="1" max="12" :disabled />
				<input class="form-control" type="number" title="day" placeholder="day" v-model="dayTo" min="1" :max="endMonthLength" :disabled />
			</div>
		</div>

		<div v-if="!lockedMode && range" :class="btnGroupClasses">
			<button
				v-for="mode in modes"
				type="button"
				:class="['btn btn-default', { active: modelValue.mode === mode.value }]"
				:key="mode.value"
				:value="mode.value"
				:title="mode.title || ''"
				:disabled
				@click="updateMode(mode.value)"
			>
				{{ mode.label }}
			</button>
		</div>
		<small v-if="description" class="help-block">{{ description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { decodeVariants } from '@/features/form/model/form-utils';
import type { ImplicitFieldComponentProps } from '@/features/form/model/types';

import { DateUtils, type RangeMode, type DateFieldState, type DateFieldUiConfig } from './date-field';

import { useI18n } from '@/shared/i18n';
import type { Option } from '@/shared/utils/options';

type ModeOption = Option<RangeMode>;

const props = withDefaults(defineProps<ImplicitFieldComponentProps<DateFieldState> & DateFieldUiConfig & { showLabel?: boolean }>(), {
	showLabel: true,
	disabled: false,
});
const i18n = useI18n();

const emit = defineEmits<{
	'update:modelValue': [value: DateFieldState];
}>();

const variant = computed(() => decodeVariants(props.variant));
const formGroupClasses = computed(() => ['form-group', variant.value.large ? 'form-group-lg' : variant.value.small ? 'form-group-sm' : '']);
const btnGroupClasses = computed(() => ['btn-group', variant.value.large ? 'btn-group-lg' : variant.value.small ? 'btn-group-sm' : '']);

const inputId = computed(() => `${props.htmlId}_value`);
const minDate = computed(() => DateUtils.normalizeBoundaryDate(props.min));
const maxDate = computed(() => DateUtils.normalizeBoundaryDate(props.max));
const minDateDisplay = computed(() => (minDate.value ? DateUtils.dateValueToDisplayString(minDate.value) : null));
const maxDateDisplay = computed(() => (maxDate.value ? DateUtils.dateValueToDisplayString(maxDate.value) : null));
const minYear = computed(() => minDate.value?.y);
const maxYear = computed(() => maxDate.value?.y);
const startMonthLength = computed(() => DateUtils.dateValueToLucene({ ...props.modelValue.startDate, d: '' }, 'end').substring(6, 8));
const endMonthLength = computed(() => DateUtils.dateValueToLucene({ ...props.modelValue.endDate, d: '' }, 'end').substring(6, 8));
const lockedMode = computed(() => props.mode ?? null);

const modes = computed<ModeOption[]>(() => [
	{
		value: 'permissive',
		label: i18n.$t(`filter.range.permissive`),
		title: i18n.$t(`filter.range.permissiveDescription`),
	},
	{
		value: 'strict',
		label: i18n.$t(`filter.range.strict`),
		title: i18n.$t(`filter.range.strictDescription`),
	},
]);

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

function updateMode(mode: RangeMode) {
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
