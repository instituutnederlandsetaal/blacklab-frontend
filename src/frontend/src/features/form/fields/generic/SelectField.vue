<template>
	<div :class="fieldClasses" :id="htmlId">
		<label v-if="showLabel" :for="inputId">{{ config.displayName }}</label>
		<SelectPicker
			data-width="100%"
			:multiple="config.multiple"
			container="body"
			:data-id="inputId"
			:data-name="inputId"
			:placeholder="placeholderText"
			:dir="textDirection"
			:options="config.options"
			v-model="pickerValue"
		/>
		<small v-if="config.description" class="blf-help-text">{{ config.description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { SelectFieldState, SelectFieldUiConfig } from './select-field';

import { getVariantClassNames } from '@/features/form/model/types/form-shape';

import SelectPicker from '@/shared/ui/SelectPicker.vue';

type SelectPickerModelValue = string | string[] | null;

const props = withDefaults(
	defineProps<{
		config: SelectFieldUiConfig;
		modelValue: SelectFieldState;
		htmlId: string;
		showLabel?: boolean;
	}>(),
	{
		showLabel: true,
	},
);

const emit = defineEmits<{
	'update:modelValue': [value: SelectFieldState];
}>();

const inputId = computed(() => `${props.htmlId}_value`);
const fieldClasses = computed(() => ['blf-field', ...getVariantClassNames(props.config, 'blf-field')]);
const placeholderText = computed(() => props.config.placeholder ?? props.config.displayName);
const textDirection = computed(() => props.config.textDirection ?? 'ltr');

const pickerValue = computed<SelectPickerModelValue>({
	get() {
		if (props.config.multiple) {
			return props.modelValue;
		}

		return props.modelValue[0] ?? '';
	},
	set(value) {
		if (!Array.isArray(value)) value = value ? [value] : [];
		emit('update:modelValue', value);
	},
});
</script>
