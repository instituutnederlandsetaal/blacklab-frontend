<template>
	<div class="blf-field blf-within-field">
		<label>{{ config.label || 'Within' }}</label>
		<div class="blf-segmented">
			<button
				v-for="option in config.options"
				type="button"
				:class="{ active: modelValue.element === option.value || (modelValue.element === null && option.value === '') }"
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
				class="blf-input"
				type="text"
				:id="`${htmlId}_${attr.value}`"
				:title="attr.title || undefined"
				:value="modelValue.attributes[attr.value] || ''"
				@input="changeWithinAttribute(attr.value, ($event.target as HTMLInputElement).value)"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { WithinFieldConfig, WithinFieldState } from '@/features/form/model/controllers/within-controller';

const props = defineProps<{
	config: WithinFieldConfig;
	htmlId: string;
	modelValue: WithinFieldState;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: WithinFieldState];
}>();

const config = computed(() => props.config);
const htmlId = computed(() => props.htmlId);
const selectedAttributes = computed(() => config.value.options.find(option => option.value === props.modelValue.element)?.attributes ?? []);

function selectElement(element: string) {
	emit('update:modelValue', {
		element: element || null,
		attributes: {},
	});
}

function changeWithinAttribute(attribute: string, value: string) {
	emit('update:modelValue', {
		...props.modelValue,
		attributes: {
			...props.modelValue.attributes,
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
