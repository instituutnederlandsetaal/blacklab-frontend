<template>
	<div v-bind="field.rootAttrs">
		<label :class="field.labelClass">{{ $t(`search.extended.within`) }}&nbsp;</label>
		<div :class="field.controlsClass">
			<div class="btn-group">
				<button
					v-for="option in sortedOptions"
					type="button"
					:class="['btn', state.element === option.value || (!state.element && !option.value) ? 'active btn-primary' : 'btn-default', field.buttonClass]"
					:key="option.value"
					:title="optionText(option.title) || undefined"
					:disabled
					@click="selectElement(option.value)"
				>
					{{ optionLabel(option) }}
				</button>
			</div>

			<div class="blf-within-attributes" v-for="attr in selectedAttributes" :key="attr.value">
				<label :for="`${htmlId}_${attr.value}`">{{ optionLabel(attr) }}</label>
				<input
					:class="['form-control', field.inputClass]"
					type="text"
					:id="`${htmlId}_${attr.value}`"
					:title="optionText(attr.title) || undefined"
					:value="state.attributes[attr.value] || ''"
					:disabled
					@input="changeWithinAttribute(attr.value, ($event.target as HTMLInputElement).value)"
				/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useFieldPresentation } from '@/features/form/fields/field-presentation';

import type { WithinFieldComponentProps, WithinFieldState } from './within-field';

import { optionLabel, optionText } from '@/shared/utils/options';

const props = withDefaults(defineProps<WithinFieldComponentProps>(), {
	disabled: false,
});
const state = defineModel<WithinFieldState>({ required: true });

const field = useFieldPresentation(props, { formGroup: false, rootClass: 'blf-within-field' });
const sortedOptions = computed(() => {
	if (!props.sortOptions) return props.options;
	return [...props.options].sort((left, right) => {
		if (!left.value || !right.value) return left.value ? 1 : right.value ? -1 : 0;
		return optionLabel(left).localeCompare(optionLabel(right));
	});
});
const selectedAttributes = computed(() =>
	[...(sortedOptions.value.find(option => option.value === state.value.element)?.attributes ?? [])].sort((left, right) => optionLabel(left).localeCompare(optionLabel(right))),
);

function selectElement(element: string) {
	state.value = {
		element: element || null,
		attributes: {},
	};
}

function changeWithinAttribute(attribute: string, value: string) {
	state.value = {
		...state.value,
		attributes: {
			...state.value.attributes,
			[attribute]: value,
		},
	};
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
