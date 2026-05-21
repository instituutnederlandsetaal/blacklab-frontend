<template>
	<div class="blf-field" :id="htmlId">
		<fieldset>
			<legend v-if="showLabel">{{ config.displayName }}</legend>
			<div v-for="(option, index) in config.options" :key="index" class="radio">
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
		<small v-if="config.description" class="blf-help-text">{{ config.description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { RadioFieldUiConfig } from './radio-field';

const props = withDefaults(
	defineProps<{
		config: RadioFieldUiConfig;
		modelValue: string;
		htmlId: string;
		showLabel?: boolean;
	}>(),
	{
		showLabel: true,
	},
);

const emit = defineEmits<{
	'update:modelValue': [value: string];
}>();

const inputId = computed(() => `${props.htmlId}_value`);

function changeValue(event: Event, value: string) {
	const target = event.target as HTMLInputElement | null;
	if (!target) {
		return;
	}

	emit('update:modelValue', target.checked ? value : '');
}
</script>