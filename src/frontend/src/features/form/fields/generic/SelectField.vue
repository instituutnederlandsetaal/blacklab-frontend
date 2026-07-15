<template>
	<div v-bind="field.rootAttrs">
		<label v-if="showLabel" :for="field.inputId" class="control-label">{{ displayName }} </label>
		<debug> [{{ id }}]</debug>
		<SelectPicker
			data-width="100%"
			:multiple
			container="body"
			:data-id="field.inputId"
			:data-name="field.inputId"
			:data-class="['btn btn-default', field.buttonClass]"
			:placeholder="placeholder || displayName"
			:dir="textDirection || 'ltr'"
			:options
			:allow-html="html"
			:hide-empty="hideEmpty"
			:disabled
			v-model="pickerValue"
		/>
		<small v-if="description" class="help-block">{{ description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useFieldPresentation } from '../field-presentation';
import type { SelectFieldComponentProps, SelectFieldState } from './select-field';

import SelectPicker from '@/shared/ui/SelectPicker.vue';

type SelectPickerModelValue = string | string[] | null;

const props = withDefaults(defineProps<SelectFieldComponentProps>(), {
	showLabel: true,
	disabled: false,
});

const emit = defineEmits<{
	'update:modelValue': [value: SelectFieldState];
}>();

const field = useFieldPresentation(props);

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
