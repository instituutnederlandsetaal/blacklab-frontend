<template>
	<div :class="fieldClasses" :id="htmlId">
		<label v-if="showLabel" :for="inputId">{{ config.displayName }}</label>
		<Autocomplete
			v-if="config.autocomplete"
			data-width="100%"
			useQuoteAsWordBoundary
			:data-id="inputId"
			:data-name="inputId"
			:placeholder="placeholderText"
			:dir="textDirection"
			:getData="config.autocomplete"
			v-model="value"
		/>
		<input v-else :id="inputId" class="blf-input form-control" type="text" :placeholder="placeholderText" :dir="textDirection" v-model="value" />
		<label v-if="config.caseSensitive" class="blf-checkbox-inline">
			<input type="checkbox" :checked="modelValue.caseSensitive" @change="updateCaseSensitive(($event.target as HTMLInputElement).checked)" />
			{{ caseSensitiveLabel }}
		</label>
		<small v-if="config.description" class="blf-help-text">{{ config.description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { getVariantClassNames } from '@/features/form/model/types/form-shape';

import type { TextFieldState, TextFieldUiConfig } from './text-field';

import Autocomplete from '@/shared/ui/Autocomplete.vue';

const props = withDefaults(
	defineProps<{
		config: TextFieldUiConfig;
		modelValue: TextFieldState;
		htmlId: string;
		showLabel?: boolean;
	}>(),
	{
		showLabel: true,
	},
);

const emit = defineEmits<{
	'update:modelValue': [value: TextFieldState];
}>();

const inputId = computed(() => `${props.htmlId}_value`);
const fieldClasses = computed(() => ['blf-field', ...getVariantClassNames(props.config, 'blf-field')]);
const placeholderText = computed(() => props.config.placeholder ?? props.config.displayName);
const textDirection = computed(() => props.config.textDirection ?? 'ltr');
const caseSensitiveLabel = computed(() => props.config.caseSensitiveLabel ?? 'Case sensitive');

const value = computed({
	get: () => props.modelValue.value,
	set: (nextValue: string) => emit('update:modelValue', { ...props.modelValue, value: nextValue }),
});

function updateCaseSensitive(caseSensitive: boolean) {
	emit('update:modelValue', {
		...props.modelValue,
		caseSensitive,
	});
}
</script>
