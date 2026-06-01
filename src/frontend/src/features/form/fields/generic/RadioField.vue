<template>
	<div :class="fieldClasses" :id="htmlId">
		<fieldset>
			<legend v-if="showLabel">{{ displayName }}</legend>
			<div v-for="(option, index) in options" :key="index" class="radio">
				<label :for="`${inputId}_${index}`" :title="option.title || ''">
					<input
						type="radio"
						:value="option.value"
						:name="inputId"
						:id="`${inputId}_${index}`"
						:checked="modelValue === option.value"
						@click="changeValue($event, option.value)"
						@input.space="changeValue($event, option.value)"
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

import type { RadioFieldState, RadioFieldUiConfig } from './radio-field';

import { getVariantClassNames } from '@/features/form/model/form-utils';
import type { FormComponentProps } from '@/features/form/model/types/form-shape';

const props = withDefaults(
	defineProps<FormComponentProps<RadioFieldState> & RadioFieldUiConfig & { showLabel?: boolean }>(),
	{
		showLabel: true,
	},
);

const emit = defineEmits<{
	'update:modelValue': [value: RadioFieldState];
}>();

const inputId = computed(() => `${props.htmlId}_value`);
const fieldClasses = computed(() => ['blf-field', ...getVariantClassNames(props.variant, 'blf-field')]);

function changeValue(event: Event, value: string) {
	const target = event.target as HTMLInputElement | null;
	if (!target) {
		return;
	}

	emit('update:modelValue', target.checked ? value : '');
}
</script>
