<template>
	<div :class="fieldClasses" :id="htmlId">
		<fieldset>
			<legend v-if="showLabel">
				{{ displayName }}<debug> [{{ id }}]</debug>
			</legend>
			<div v-for="(option, index) in options" :key="index" class="radio">
				<label :for="`${inputId}_${index}`" :title="option.title || ''">
					<input
						type="radio"
						:value="option.value"
						:name="inputId"
						:id="`${inputId}_${index}`"
						:checked="modelValue === option.value"
						:disabled="disabled"
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

import { decodeVariants } from '@/features/form/model/form-utils';
import type { ImplicitFieldComponentProps } from '@/features/form/model/types';

import type { RadioFieldState, RadioFieldUiConfig } from './radio-field';

const props = withDefaults(defineProps<ImplicitFieldComponentProps<RadioFieldState> & RadioFieldUiConfig & { showLabel?: boolean }>(), {
	showLabel: true,
	disabled: false,
});

const emit = defineEmits<{
	'update:modelValue': [value: RadioFieldState];
}>();

const inputId = computed(() => `${props.htmlId}_value`);
const fieldClasses = computed(() => ['blf-field', decodeVariants(props.variant)]);

function changeValue(event: Event, value: string) {
	const target = event.target as HTMLInputElement | null;
	if (!target) {
		return;
	}

	emit('update:modelValue', target.checked ? value : '');
}
</script>
