<template>
	<div class="blf-field" :id="htmlId">
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
		<label v-if="config.caseSensitive" class="blf-checkbox-inline">
			<input type="checkbox" :checked="modelValue.caseSensitive" @change="updateCaseSensitive(($event.target as HTMLInputElement).checked)" />
			{{ caseSensitiveLabel }}
		</label>
		<small v-if="config.description" class="blf-help-text">{{ config.description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { SelectFieldState, SelectFieldUiConfig } from './select-field';

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
const placeholderText = computed(() => props.config.placeholder ?? props.config.displayName);
const textDirection = computed(() => props.config.textDirection ?? 'ltr');
const caseSensitiveLabel = computed(() => props.config.caseSensitiveLabel ?? 'Case sensitive');

const pickerValue = computed<SelectPickerModelValue>({
	get() {
		if (props.config.multiple) {
			return props.modelValue.selectedValues;
		}

		return props.modelValue.selectedValues[0] ?? '';
	},
	set(value) {
		const selectedValues = props.config.multiple ? (Array.isArray(value) ? value : value ? [value] : []) : Array.isArray(value) ? value.slice(0, 1) : value ? [value] : [];
		emit('update:modelValue', {
			...props.modelValue,
			selectedValues,
		});
	},
});

function updateCaseSensitive(value: boolean) {
	emit('update:modelValue', {
		...props.modelValue,
		caseSensitive: value,
	});
}
</script>