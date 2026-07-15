<template>
	<div v-bind="field.rootAttrs">
		<label>{{ $t(`search.extended.within`) }}&nbsp;</label>
		<div class="btn-group">
			<button
				v-for="option in sortedOptions"
				type="button"
				:class="['btn', 'btn-default', field.buttonClass, { active: state.element === option.value || (!state.element && !option.value) }]"
				:key="option.value"
				:title="option.title || undefined"
				:disabled
				@click="selectElement(option.value)"
			>
				{{ option.label }}
			</button>
		</div>

		<div class="blf-within-attributes" v-for="attr in selectedAttributes" :key="attr.value">
			<label :for="`${htmlId}_${attr.value}`">{{ attr.label }}</label>
			<input
				:class="['form-control', field.inputClass]"
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

import { useFieldPresentation } from '@/features/form/fields/field-presentation';

import type { WithinFieldComponentProps, WithinFieldState } from './within-field';

import { useI18n } from '@/shared/i18n';

const props = withDefaults(defineProps<WithinFieldComponentProps>(), {
	disabled: false,
});
const state = defineModel<WithinFieldState>({ required: true });
const translate = useI18n();

const emit = defineEmits<{
	'update:modelValue': [value: WithinFieldState];
}>();

const field = useFieldPresentation(props, { formGroup: false, rootClass: 'blf-within-field' });
const sortedOptions = computed(() => {
	const translatedOptions = props.options.map(option => ({
		...option,
		label: translate.$tSpanDisplayName(option),
		attributes: [...(option.attributes ?? [])]
			.map(attribute => ({ ...attribute, label: translate.$tSpanAttributeDisplay(option.value, attribute.value) }))
			.sort((left, right) => left.label.localeCompare(right.label)),
	}));
	if (!props.sortOptions) return translatedOptions;
	const documentOption = translatedOptions.filter(option => !option.value);
	const spanOptions = translatedOptions.filter(option => option.value).sort((left, right) => left.label.localeCompare(right.label));
	return [...documentOption, ...spanOptions];
});
const selectedAttributes = computed(() => sortedOptions.value.find(option => option.value === state.value.element)?.attributes ?? []);

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
