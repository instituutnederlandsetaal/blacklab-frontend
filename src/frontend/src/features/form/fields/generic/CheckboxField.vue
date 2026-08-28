<template>
	<fieldset v-bind="field.rootAttrs">
		<legend v-if="showLabel" :class="field.labelClass">
			{{ displayName }}<Debug> [{{ id }}]</Debug>
		</legend>
		<div :class="field.controlsClass">
			<div v-for="(option, index) in options" :key="index" class="checkbox">
				<label :for="`${field.inputId}_${index}`" :title="optionText(option.title) || ''">
					<input
						type="checkbox"
						:value="option.value"
						:name="`${field.inputId}_${index}`"
						:id="`${field.inputId}_${index}`"
						:checked="modelValue.includes(option.value)"
						:disabled
						@change="emit('update:modelValue', ($event.target as HTMLInputElement).checked ? [...modelValue, option.value] : modelValue.filter(selected => selected !== option.value))"
					/>
					{{ optionLabel(option) }}
				</label>
			</div>
			<small v-if="description" class="help-block">{{ description }}</small>
		</div>
	</fieldset>
</template>

<script setup lang="ts">
import { useFieldPresentation } from '../field-presentation';
import type { CheckboxFieldComponentProps, CheckboxFieldState } from './checkbox-field';

import { optionLabel, optionText } from '@/shared/utils/options';

const props = withDefaults(defineProps<CheckboxFieldComponentProps>(), {
	showLabel: true,
});

const emit = defineEmits<{
	'update:modelValue': [value: CheckboxFieldState];
}>();

const field = useFieldPresentation(props);
</script>
