<template>
	<div class="blf-field blf-within-field">
		<label>{{ config.label || 'Within' }}</label>
		<div class="blf-segmented">
			<button
				v-for="option in config.options"
				type="button"
				:class="{ active: state.element === option.value || (state.element === null && option.value === '') }"
				:key="option.value"
				:title="option.title || undefined"
				@click="selectElement(option.value)"
			>
				{{ option.label || option.value || 'Document' }}
			</button>
		</div>

		<div class="blf-within-attributes" v-for="attr in selectedAttributes" :key="attr.value">
			<label :for="`${node.id}_${attr.value}`">{{ attr.label || attr.value }}</label>
			<input
				class="blf-input"
				type="text"
				:id="`${node.id}_${attr.value}`"
				:title="attr.title || undefined"
				:value="state.attributes[attr.value] || ''"
				@input="changeWithinAttribute(attr.value, ($event.target as HTMLInputElement).value)"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { WithinFieldConfig, WithinFieldState } from '@/features/form/model/controllers/within-controller';
import type { FormFieldNode } from '@/features/form/model/types/form-shape';

const {
	node: { config, ...node },
	state,
} = defineProps<{
	node: FormFieldNode<WithinFieldConfig>;
	config: WithinFieldConfig;
	state: WithinFieldState;
}>();

const emit = defineEmits<{
	'update:state': [state: WithinFieldState];
}>();

const selectedAttributes = computed(() => config.options.find(option => option.value === state.element)?.attributes ?? []);

function selectElement(element: string) {
	emit('update:state', {
		element: element || null,
		attributes: {},
	});
}

function changeWithinAttribute(attribute: string, value: string) {
	emit('update:state', {
		...state,
		attributes: {
			...state.attributes,
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
