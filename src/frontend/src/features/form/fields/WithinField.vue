<template>
	<div :class="fieldClasses">
		<label>{{ label || 'Within' }}</label>
		<div class="blf-segmented">
			<button
				v-for="option in options"
				type="button"
				:class="{ active: state.element === option.value || (!state.element && !option.value) }"
				:key="option.value"
				:title="option.title || undefined"
				@click="selectElement(option.value)"
			>
				{{ option.label || option.value || 'Document' }}
			</button>
		</div>

		<div class="blf-within-attributes" v-for="attr in selectedAttributes" :key="attr.value">
			<label :for="`${htmlId}_${attr.value}`">{{ attr.label || attr.value }}</label>
			<input
				class="blf-input form-control"
				type="text"
				:id="`${htmlId}_${attr.value}`"
				:title="attr.title || undefined"
				:value="state.attributes[attr.value] || ''"
				@input="changeWithinAttribute(attr.value, ($event.target as HTMLInputElement).value)"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { getVariantClassNames } from '@/features/form/model/form-utils';

import type { WithFieldComponentProps, WithinFieldConfig, WithinFieldState } from '../model/controllers/within-controller';

const props = defineProps<WithFieldComponentProps>();

const state = defineModel<WithinFieldState>({ required: true });

const emit = defineEmits<{
	'update:modelValue': [value: WithinFieldState];
}>();

const fieldClasses = computed(() => ['blf-field', 'blf-within-field', ...getVariantClassNames(props.variant, 'blf-field')]);
const htmlId = computed(() => props.htmlId);
const selectedAttributes = computed(() => props.options.find((option: WithinFieldConfig['options'][number]) => option.value === state.value.element)?.attributes ?? []);

function selectElement(element: string) {
	emit('update:modelValue', {
		element: element || null,
		attributes: {},
	});
}

function changeWithinAttribute(attribute: string, value: string) {
	emit('update:modelValue', {
		...state.value,
		attributes: {
			...state.value.attributes,
			[attribute]: value,
		},
	});
}
</script>

<style lang="scss" scoped>
.blf-within-attributes {
	display: grid;
	grid-template-columns: minmax(5rem, max-content) minmax(10rem, 1fr);
	gap: 8px;
	align-items: center;
	margin-top: 8px;
}
</style>
