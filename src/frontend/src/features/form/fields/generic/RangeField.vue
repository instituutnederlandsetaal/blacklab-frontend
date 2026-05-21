<template>
	<div class="blf-field" :id="htmlId">
		<label v-if="showLabel" :for="`${inputId}_lower`">{{ config.displayName }}</label>
		<div class="blf-dual-input">
			<input :id="`${inputId}_lower`" v-model="lower" :type="inputType" :placeholder="lowPlaceholder" class="blf-input" autocomplete="off" />
			<input :id="`${inputId}_upper`" v-model="upper" :type="inputType" :placeholder="highPlaceholder" class="blf-input" autocomplete="off" />
		</div>
		<small v-if="config.description" class="blf-help-text">{{ config.description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { RangeFieldState, RangeFieldUiConfig } from './range-field';

const props = withDefaults(
	defineProps<{
		config: RangeFieldUiConfig;
		modelValue: RangeFieldState;
		htmlId: string;
		showLabel?: boolean;
	}>(),
	{
		showLabel: true,
	},
);

const emit = defineEmits<{
	'update:modelValue': [value: RangeFieldState];
}>();

const inputId = computed(() => `${props.htmlId}_value`);
const inputType = computed(() => props.config.inputType ?? 'text');
const lowPlaceholder = computed(() => props.config.lowPlaceholder ?? 'From');
const highPlaceholder = computed(() => props.config.highPlaceholder ?? 'To');

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