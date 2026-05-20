<template>
	<div class="blf-filter-field" :id="htmlId" :data-filterfield-type="definition.componentName">
		<label v-if="showLabel" :for="inputId">{{ displayName }}</label>
		<select :id="inputId" class="blf-input" multiple :dir="textDirection" v-model="vmodel">
			<option v-for="option in options" :key="option.value" :value="option.value" :title="option.title || undefined">
				{{ option.label || option.value }}
			</option>
		</select>
		<small v-if="description" class="blf-help-text">{{ description }}</small>
	</div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';

import type { FilterSelectValue, FilterSelectMetadata } from '@/features/form/model/filter-value-functions';

import createBaseFilterComponent from './FilterBase';

export default defineComponent({
	extends: createBaseFilterComponent<FilterSelectValue, FilterSelectMetadata>({ type: Array as PropType<string[]>, default: () => [] }),
	computed: {
		vmodel: {
			get() {
				return this.modelValue ?? [];
			},
			set(value: string[]) {
				this.e_input(value);
			},
		},
	},
});
</script>
