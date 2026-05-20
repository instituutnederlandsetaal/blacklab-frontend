<template>
	<div class="blf-filter-field" :id="htmlId" :data-filterfield-type="definition.componentName">
		<label v-if="showLabel" :for="inputId">{{ displayName }}</label>
		<div>
			<input type="text" :id="inputId" :placeholder="displayName" :dir="textDirection" :list="inputId + '_suggestions'" class="blf-input" @input="refreshSuggestions" v-model="vmodel" />
			<datalist :id="inputId + '_suggestions'">
				<option v-for="suggestion in suggestions" :key="suggestion" :value="suggestion" />
			</datalist>
		</div>
		<small v-if="description" class="blf-help-text">{{ description }}</small>
	</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { type FilterAutocompleteMetadata, type FilterAutocompleteValue } from '../../model/filter-value-functions';
import createBaseFilterComponent from './FilterBase';

export default defineComponent({
	extends: createBaseFilterComponent<FilterAutocompleteValue, FilterAutocompleteMetadata>({ type: String }),
	data: () => ({
		suggestions: [] as string[],
		lastRequestedValue: '',
	}),
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
	methods: {
		refreshSuggestions() {
			const provider = this.definition.metadata;
			if (typeof provider !== 'function' || !this.modelValue?.trim() || this.modelValue === this.lastRequestedValue) return;
			const requestedValue = this.modelValue;
			this.lastRequestedValue = requestedValue;
			void provider(requestedValue).then(suggestions => {
				if (this.lastRequestedValue === requestedValue) this.suggestions = suggestions;
			});
		},
	},
});
</script>
