<template>
	<div class="form-group" :id="htmlId">
		<label v-if="showLabel" :for="inputId" class="control-label">{{ resolvedDisplayName }} </label>
		<debug> [{{ id }}]</debug>
		<SelectPicker
			data-width="100%"
			:multiple
			container="body"
			:data-id="inputId"
			:data-name="inputId"
			:data-class="['btn btn-default', btnClass]"
			:placeholder="placeholderText"
			:dir="textDirection"
			:options
			:allow-html="html"
			:hide-empty="hideEmpty"
			:disabled
			v-model="pickerValue"
		/>
		<small v-if="resolvedDescription" class="help-block">{{ resolvedDescription }}</small>
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
	disabled: false,
});

const emit = defineEmits<{
	'update:modelValue': [value: SelectFieldState];
}>();

const variant = computed(() => decodeVariants(props.variant));
const inputId = computed(() => `${props.htmlId}_value`);
const resolvedDisplayName = computed(() => toValue(props.displayName));
const resolvedDescription = computed(() => (props.description ? toValue(props.description) : undefined));
const placeholderText = computed(() => (props.placeholder ? toValue(props.placeholder) : resolvedDisplayName.value));
const textDirection = computed(() => props.textDirection ?? 'ltr');

const btnClass = computed(() => (variant.value.large ? 'btn-lg' : variant.value.small ? 'btn-sm' : ''));

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
