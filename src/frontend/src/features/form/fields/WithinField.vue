<template>
	<div :class="fieldClasses">
		<label>{{ $t(`search.extended.within`) }}&nbsp;</label>
		<div class="btn-group">
			<button
				v-for="option in options"
				type="button"
				:class="['btn', 'btn-default', btnSizeClass, { active: state.element === option.value || (!state.element && !option.value) }]"
				:key="option.value"
				:title="option.title || undefined"
				:disabled
				@click="selectElement(option.value)"
			>
				{{ $tSpanDisplayName(option) }}
			</button>
		</div>

		<div class="blf-within-attributes" v-for="attr in selectedAttributes" :key="attr.value">
			<label :for="`${htmlId}_${attr.value}`">{{ $tSpanAttributeDisplay(state.element!, attr.value) }}</label>
			<input
				:class="['form-control', inputSizeClass]"
				type="text"
				:id="`${htmlId}_${attr.value}`"
				:title="attr.title || undefined"
				:value="state.attributes[attr.value] || ''"
				:disabled
				@input="changeWithinAttribute(attr.value, ($event.target as HTMLInputElement).value)"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { decodeVariants } from '@/features/form/model/form-utils';

import type { WithFieldComponentProps, WithinFieldConfig, WithinFieldState } from '../model/controllers/within-controller';

const props = withDefaults(defineProps<WithFieldComponentProps>(), {
	disabled: false,
});
const state = defineModel<WithinFieldState>({ required: true });

const emit = defineEmits<{
	'update:modelValue': [value: WithinFieldState];
}>();

const variants = computed(() => decodeVariants(props.variant));
const fieldClasses = computed(() => ['blf-field', 'blf-within-field', variants.value]);
const htmlId = computed(() => props.htmlId);
const selectedAttributes = computed(() => props.options.find((option: WithinFieldConfig['options'][number]) => option.value === state.value.element)?.attributes ?? []);

const btnSizeClass = computed(() => (variants.value.large ? 'btn-lg' : variants.value.small ? 'btn-sm' : ''));
const inputSizeClass = computed(() => (variants.value.large ? 'input-lg' : variants.value.small ? 'input-sm' : ''));

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
