<template>
	<div :class="fieldClasses" :id="htmlId">
		<label v-if="showLabel" :for="`${inputId}_lower`">{{ displayName }}</label>
		<div class="blf-dual-input">
			<input :id="`${inputId}_lower`" v-model="lower" :type="inputType" :placeholder="lowPlaceholder" class="blf-input form-control" autocomplete="off" />
			<input :id="`${inputId}_upper`" v-model="upper" :type="inputType" :placeholder="highPlaceholder" class="blf-input form-control" autocomplete="off" />
		</div>
		<div v-if="!lockedMode" class="btn-group blf-range-modes">
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
		<small v-if="description" class="blf-help-text">{{ description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { getVariantClassNames } from '@/features/form/model/form-utils';
import type { FormComponentProps } from '@/features/form/model/types/form-shape';

import type { RangeMultipleFieldsFieldState, RangeMultipleFieldsFieldUiConfig } from './range-multiple-fields-field';

import type { Option } from '@/shared/utils/options';

type ModeOption = Option & { value: RangeMultipleFieldsFieldState['mode'] };

const props = withDefaults(
	defineProps<FormComponentProps<RangeMultipleFieldsFieldState> & RangeMultipleFieldsFieldUiConfig & { showLabel?: boolean }>(),
	{
		showLabel: true,
	},
);

const emit = defineEmits<{
	'update:modelValue': [value: RangeMultipleFieldsFieldState];
}>();

const inputId = computed(() => `${props.htmlId}_value`);
const fieldClasses = computed(() => ['blf-field', ...getVariantClassNames(props.variant, 'blf-field')]);
const inputType = computed(() => props.inputType ?? 'number');
const lowPlaceholder = computed(() => props.lowPlaceholder ?? 'From');
const highPlaceholder = computed(() => props.highPlaceholder ?? 'To');
const lockedMode = computed(() => props.mode ?? null);

const modes: ModeOption[] = [
	{
		value: 'permissive',
		label: 'Permissive',
		title: 'Match overlapping ranges.',
	},
	{
		value: 'strict',
		label: 'Strict',
		title: 'Match ranges fully inside the selected bounds.',
	},
];

const lower = computed({
	get: () => props.modelValue.low,
	set: (low: string) => {
		emit('update:modelValue', {
			...props.modelValue,
			low,
		});
	},
});

const upper = computed({
	get: () => props.modelValue.high,
	set: (high: string) => {
		emit('update:modelValue', {
			...props.modelValue,
			high,
		});
	},
});

function updateMode(mode: RangeMultipleFieldsFieldState['mode']) {
	emit('update:modelValue', {
		...props.modelValue,
		mode,
	});
}
</script>

<style lang="scss" scoped>
.blf-range-modes {
	margin-top: 12px;
}
</style>
