<template>
	<div :class="fieldClasses" :id="htmlId">
		<label v-if="showLabel" :for="`${inputId}_lower`">{{ displayName }}</label>
		<div class="blf-dual-input">
			<input :id="`${inputId}_lower`" v-model="lower" :type="inputType" :placeholder="lowPlaceholder" class="blf-input form-control" autocomplete="off" />
			<input :id="`${inputId}_upper`" v-model="upper" :type="inputType" :placeholder="highPlaceholder" class="blf-input form-control" autocomplete="off" />
		</div>
		<small v-if="description" class="blf-help-text">{{ description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { getVariantClassNames } from '@/features/form/model/form-utils';
import type { FormComponentProps } from '@/features/form/model/types/form-shape';

import type { RangeFieldState, RangeFieldUiConfig } from './range-field';

const props = withDefaults(
	defineProps<FormComponentProps<RangeFieldState> & RangeFieldUiConfig & { showLabel?: boolean }>(),
	{
		showLabel: true,
	},
);

const emit = defineEmits<{
	'update:modelValue': [value: RangeFieldState];
}>();

const inputId = computed(() => `${props.htmlId}_value`);
const fieldClasses = computed(() => ['blf-field', ...getVariantClassNames(props.variant, 'blf-field')]);
const inputType = computed(() => props.inputType ?? 'text');
const lowPlaceholder = computed(() => props.lowPlaceholder ?? 'From');
const highPlaceholder = computed(() => props.highPlaceholder ?? 'To');

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
</script>
