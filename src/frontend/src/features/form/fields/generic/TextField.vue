<template>
	<div :class="fieldClasses" :id="htmlId">
		<label v-if="showLabel" :for="inputId">{{ displayName }}</label>
		<Autocomplete
			v-if="autocomplete"
			data-width="100%"
			useQuoteAsWordBoundary
			:data-id="inputId"
			:data-name="inputId"
			:placeholder="placeholderText"
			:dir="textDirection"
			:getData="autocomplete"
			v-model="value"
		/>
		<input v-else :id="inputId" class="blf-input form-control" type="text" :placeholder="placeholderText" :dir="textDirection" v-model="value" />
		<label v-if="caseSensitive" class="blf-checkbox-inline">
			<input type="checkbox" :checked="modelValue.caseSensitive" @change="updateCaseSensitive(($event.target as HTMLInputElement).checked)" />
			{{ caseSensitiveLabel }}
		</label>
		<small v-if="description" class="blf-help-text">{{ description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { decodeVariants } from '@/features/form/model/form-utils';
import type { ImplicitFieldComponentProps } from '@/features/form/model/types';

import type { TextFieldState, TextFieldUiConfig } from './text-field';

import Autocomplete from '@/shared/ui/Autocomplete.vue';

const props = withDefaults(defineProps<ImplicitFieldComponentProps<TextFieldState> & TextFieldUiConfig & { showLabel?: boolean }>(), {
	showLabel: true,
});

const emit = defineEmits<{
	'update:modelValue': [value: TextFieldState];
}>();

const inputId = computed(() => `${props.htmlId}_value`);
const fieldClasses = computed(() => ['blf-field', decodeVariants(props.variant)]);
const placeholderText = computed(() => props.placeholder ?? props.displayName);
const textDirection = computed(() => props.textDirection ?? 'ltr');
const caseSensitiveLabel = computed(() => props.caseSensitiveLabel ?? 'Case sensitive');

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
