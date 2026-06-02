<template>
	<div :class="fieldClasses" :id="htmlId">
		<fieldset>
			<legend v-if="showLabel">{{ displayName }}</legend>
			<div v-for="(option, index) in options" :key="index" class="checkbox">
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
		<small v-if="description" class="blf-help-text">{{ description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { decodeVariants } from '@/features/form/model/form-utils';
import type { ImplicitFieldComponentProps } from '@/features/form/model/types';

import type { CheckboxFieldState, CheckboxFieldUiConfig } from './checkbox-field';

const props = withDefaults(defineProps<ImplicitFieldComponentProps<CheckboxFieldState> & CheckboxFieldUiConfig & { showLabel?: boolean }>(), {
	showLabel: true,
});

const emit = defineEmits<{
	'update:modelValue': [value: CheckboxFieldState];
}>();

const inputId = computed(() => `${props.htmlId}_value`);
const fieldClasses = computed(() => ['blf-field', decodeVariants(props.variant)]);

function toggleCheckbox(value: string, checked: boolean) {
	emit('update:modelValue', {
		...props.modelValue,
		[value]: checked,
	});
}
</script>
