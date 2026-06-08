<template>
	<div :class="fieldClasses" :id="htmlId">
		<label v-if="showLabel" :for="inputId"
			>{{ displayName }}<debug> [{{ id }}]</debug>
		</label>
		<Autocomplete
			v-if="autocomplete"
			data-width="100%"
			useQuoteAsWordBoundary
			:data-id="inputId"
			:data-name="inputId"
			:placeholder="placeholderText"
			:dir="textDirection"
			:getData="autocomplete"
			:disabled="disabled"
			:value="value"
			@update:model-value="value = $event"
		/>
		<input
			v-else
			:id="inputId"
			class="blf-input form-control"
			type="text"
			:placeholder="placeholderText"
			:dir="textDirection"
			:disabled="disabled"
			:value="value"
			@input="value = ($event.target as HTMLInputElement).value"
		/>
		<label v-if="caseSensitive" class="blf-checkbox-inline">
			<input type="checkbox" :checked="modelValue.caseSensitive" :disabled="disabled" @change="updateCaseSensitive(($event.target as HTMLInputElement).checked)" />
			{{ $t(`widgets.caseSensitive`) }}
		</label>
		<small v-if="description" class="blf-help-text">{{ description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed, toValue } from 'vue';

import { decodeVariants } from '@/features/form/model/form-utils';
import type { ImplicitFieldComponentProps } from '@/features/form/model/types';

import type { TextFieldState, TextFieldUiConfig } from './text-field';

import Autocomplete from '@/shared/ui/Autocomplete.vue';

const props = withDefaults(defineProps<ImplicitFieldComponentProps<TextFieldState> & TextFieldUiConfig & { showLabel?: boolean }>(), {
	showLabel: true,
	disabled: false,
});
const emit = defineEmits<{
	'update:modelValue': [value: TextFieldState];
}>();

const inputId = computed(() => `${props.htmlId}_value`);
const fieldClasses = computed(() => ['blf-field', decodeVariants(props.variant)]);
const placeholderText = computed(() => props.placeholder ?? toValue(props.displayName));
const textDirection = computed(() => props.textDirection ?? 'ltr');

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
