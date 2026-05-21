<template>
	<div class="blf-field" :id="htmlId" :data-filterfield-type="definition.componentName">
		<label v-if="showLabel" :for="inputId">{{ displayName }}</label>
		<div>
			<input type="text" class="blf-input" :id="inputId" :placeholder="displayName" :dir="textDirection" v-model="vmodel" />
			<small v-if="description" class="blf-help-text">{{ description }}</small>
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import type { FilterTextMetadata, FilterTextValue } from '@/features/form/model/filter-value-functions';

import createBaseFilterComponent from './FilterBase';

export default defineComponent({
	extends: createBaseFilterComponent<FilterTextValue, FilterTextMetadata>({ type: String, default: '' }),
	computed: {
		vmodel: {
			get() {
				return this.modelValue;
			},
			set(value: string) {
				this.e_input(value);
			},
		},
	},
});
</script>
