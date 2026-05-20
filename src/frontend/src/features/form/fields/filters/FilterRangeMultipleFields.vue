<template>
	<div class="blf-filter-field" :id="htmlId" :data-filterfield-type="definition.componentName">
		<label v-if="showLabel" :for="inputId + '_lower'">{{ displayName }}</label>
		<div class="blf-filter-range">
			<input type="number" placeholder="From" class="blf-input" autocomplete="off" :id="inputId + '_lower'" v-model="lower" />
			<input type="number" placeholder="To" class="blf-input" autocomplete="off" :id="inputId + '_upper'" v-model="upper" />
		</div>
		<div class="blf-segmented" v-if="!fields.mode">
			<button
				v-for="mode in modes"
				type="button"
				:class="{ active: modelValue.mode === mode.value }"
				:key="mode.value"
				:value="mode.value"
				:title="mode.title || ''"
				@click="e_input({ ...modelValue, mode: mode.value })"
			>
				{{ mode.label }}
			</button>
		</div>
		<small v-if="description" class="blf-help-text">{{ description }}</small>
	</div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';

import type { FilterRangeMultipleFieldsMetadata, FilterRangeMultipleFieldsValue } from '../../model/filter-value-functions';
import createBaseFilterComponent from './FilterBase';

import type { Option } from '@/shared/utils/options';

type ModeOption = Option & { value: FilterRangeMultipleFieldsValue['mode'] };

export default defineComponent({
	extends: createBaseFilterComponent<FilterRangeMultipleFieldsValue, FilterRangeMultipleFieldsMetadata>({
		type: Object as PropType<FilterRangeMultipleFieldsValue>,
		default: () => ({
			low: '',
			high: '',
			mode: 'strict',
		}),
	}),
	computed: {
		fields(): FilterRangeMultipleFieldsMetadata {
			return this.definition.metadata ?? { low: this.id, high: this.id };
		},
		modes(): ModeOption[] {
			return [
				{
					value: 'permissive',
					label: 'Permissive',
					title: 'Match overlapping ranges.',
				},
				{
					value: 'strict',
					label: 'Strict',
					title: 'Match ranges fully inside the selected bounds.',
				},
			];
		},
		upper: {
			get() {
				return this.modelValue.high;
			},
			set(value: string) {
				this.e_input({ ...this.modelValue, high: value });
			},
		},
		lower: {
			get() {
				return this.modelValue.low;
			},
			set(value: string) {
				this.e_input({ ...this.modelValue, low: value });
			},
		},
	},
});
</script>
