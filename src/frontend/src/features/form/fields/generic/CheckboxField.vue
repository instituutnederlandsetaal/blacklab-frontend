<template>
	<fieldset v-bind="field.rootAttrs">
		<legend v-if="showLabel" :class="field.labelClass">
			{{ displayName }}<Debug> [{{ id }}]</Debug>
		</legend>
		<div :class="field.controlsClass">
			<div v-for="(option, index) in options" :key="index" class="checkbox">
				<label :for="`${field.inputId}_${index}`" :title="option.title || ''">
					<input
						type="checkbox"
						:value="option.value"
						:name="`${field.inputId}_${index}`"
						:id="`${field.inputId}_${index}`"
						:checked="modelValue.includes(option.value)"
						:disabled
						@change="toggleCheckbox(option.value, ($event.target as HTMLInputElement).checked)"
					/>
					{{ option.label || option.value }}
				</label>
			</div>
			<small v-if="description" class="help-block">{{ description }}</small>
		</div>
	</fieldset>
</template>

<script setup lang="ts">
import { useFieldPresentation } from '../field-presentation';
import type { CheckboxFieldComponentProps, CheckboxFieldState } from './checkbox-field';

const props = withDefaults(defineProps<CheckboxFieldComponentProps>(), {
	showLabel: true,
	disabled: false,
});

const emit = defineEmits<{
	'update:modelValue': [value: CheckboxFieldState];
}>();

const field = useFieldPresentation(props);

function toggleCheckbox(value: string, checked: boolean) {
	emit('update:modelValue', checked ? [...props.modelValue, value] : props.modelValue.filter(selected => selected !== value));
}
</script>
