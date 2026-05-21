<template>
	<div class="blf-field" :id="htmlId" data-filterfield-type="filter-range">
		<label v-if="showLabel" :for="inputId + '_lower'">{{ displayName }}</label>
		<div class="blf-dual-input">
			<input type="text" placeholder="From" class="blf-input" autocomplete="off" :id="inputId + '_lower'" v-model="lower" />
			<input type="text" placeholder="To" class="blf-input" autocomplete="off" :id="inputId + '_upper'" v-model="upper" />
		</div>
		<small v-if="description" class="blf-help-text">{{ description }}</small>
	</div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';

import type { FilterRangeValue, FilterRangeMetadata } from '@/features/form/model/filter-value-functions';

import createBaseFilterComponent from './FilterBase';

export default defineComponent({
	extends: createBaseFilterComponent<FilterRangeValue, FilterRangeMetadata>({ type: Object as PropType<FilterRangeValue>, default: () => ({ low: '', high: '' }) }),

	computed: {
		lower: {
			get(): string {
				return this.modelValue?.low ?? '';
			},
			set(value: string) {
				this.e_input({ low: value, high: this.modelValue?.high ?? '' });
			},
		},
		upper: {
			get(): string {
				return this.modelValue?.high ?? '';
			},
			set(value: string) {
				this.e_input({ low: this.modelValue?.low ?? '', high: value });
			},
		},
	},
});
</script>
