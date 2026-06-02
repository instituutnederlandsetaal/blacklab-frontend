<template>
	<div :class="fieldClasses" :id="htmlId">
		<label v-if="showLabel" :for="inputId"
			>{{ displayName }}<debug> [{{ id }}]</debug>
		</label>
		<SelectPicker
			data-width="100%"
			:multiple="multiple"
			container="body"
			:data-id="inputId"
			:data-name="inputId"
			:placeholder="placeholderText"
			:dir="textDirection"
			:options="options"
			v-model="pickerValue"
		/>
		<small v-if="description" class="blf-help-text">{{ description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed, toValue } from 'vue';

import { decodeVariants } from '@/features/form/model/form-utils';
import type { ImplicitFieldComponentProps } from '@/features/form/model/types';

import type { SelectFieldState, SelectFieldUiConfig } from './select-field';

import SelectPicker from '@/shared/ui/SelectPicker.vue';

type SelectPickerModelValue = string | string[] | null;

const props = withDefaults(defineProps<ImplicitFieldComponentProps<SelectFieldState> & SelectFieldUiConfig & { showLabel?: boolean }>(), {
	showLabel: true,
});

const emit = defineEmits<{
	'update:modelValue': [value: SelectFieldState];
}>();

const inputId = computed(() => `${props.htmlId}_value`);
const fieldClasses = computed(() => ['blf-field', decodeVariants(props.variant)]);
const placeholderText = computed(() => props.placeholder ?? toValue(props.displayName));
const textDirection = computed(() => props.textDirection ?? 'ltr');

const pickerValue = computed<SelectPickerModelValue>({
	get() {
		if (props.multiple) {
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
