<template>
	<div :class="fieldClasses" :id="htmlId">
		<fieldset>
			<legend v-if="showLabel">{{ config.displayName }}</legend>
			<div v-for="(option, index) in config.options" :key="index" class="checkbox">
				<label :for="`${inputId}_${index}`" :title="option.title || ''">
					<input
						type="checkbox"
						:value="option.value"
						:name="`${inputId}_${index}`"
						:id="`${inputId}_${index}`"
						:checked="modelValue[option.value]"
						@change="toggleCheckbox(option.value, ($event.target as HTMLInputElement).checked)"
					/>
					{{ option.label || option.value }}
				</label>
			</div>
		</fieldset>
		<small v-if="config.description" class="blf-help-text">{{ config.description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { CheckboxFieldState, CheckboxFieldUiConfig } from './checkbox-field';

import { getVariantClassNames } from '@/features/form/model/types/form-shape';

const props = withDefaults(
	defineProps<{
		config: CheckboxFieldUiConfig;
		modelValue: CheckboxFieldState;
		htmlId: string;
		showLabel?: boolean;
	}>(),
	{
		showLabel: true,
	},
);

const emit = defineEmits<{
	'update:modelValue': [value: CheckboxFieldState];
}>();

const inputId = computed(() => `${props.htmlId}_value`);
const fieldClasses = computed(() => ['blf-field', ...getVariantClassNames(props.config, 'blf-field')]);

function toggleCheckbox(value: string, checked: boolean) {
	emit('update:modelValue', {
		...props.modelValue,
		[value]: checked,
	});
}
</script>