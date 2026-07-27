<template>
	<div v-bind="field.rootAttrs">
		<label v-if="showLabel" :for="field.inputId" :class="['control-label', field.labelClass]">
			{{ displayName }}
			<Debug> [{{ id }}]</Debug>
		</label>
		<Debug v-else>
			<label :class="['control-label', field.labelClass]">[{{ id }}]</label>
		</Debug>
		<div :class="field.controlsClass">
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
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useFieldPresentation } from '../field-presentation';
import type { SelectFieldComponentProps, SelectFieldState, SingleSelectFieldState } from './select-field';

import SelectPicker from '@/shared/ui/SelectPicker.vue';

type SelectPickerModelValue = string | string[] | null;

const props = withDefaults(defineProps<SelectFieldComponentProps>(), {
	showLabel: true,
	disabled: false,
});

const emit = defineEmits<{
	'update:modelValue': [value: SelectFieldState | SingleSelectFieldState];
}>();

const field = useFieldPresentation(props);

const pickerValue = computed<SelectPickerModelValue>({
	get() {
		if (props.multiple) {
			return Array.isArray(props.modelValue) ? props.modelValue : props.modelValue ? [props.modelValue] : [];
		}

		return Array.isArray(props.modelValue) ? (props.modelValue[0] ?? '') : props.modelValue;
	},
	set(value) {
		emit('update:modelValue', props.multiple ? (Array.isArray(value) ? value : value ? [value] : []) : Array.isArray(value) ? (value[0] ?? '') : (value ?? ''));
	},
});
</script>
