<template>
	<div class="blf-field" :id="htmlId" :data-filterfield-type="definition.componentName">
		<label v-if="showLabel" :for="inputId">{{ displayName }}</label>
		<Debug v-else
			><label class="col-xs-12">(id: {{ id }})</label></Debug
		>
		<Autocomplete
			v-if="dataProvider"
			data-width="100%"
			useQuoteAsWordBoundary
			:data-id="inputId"
			:data-name="inputId"
			:placeholder="displayName"
			:dir="textDirection"
			:getData="dataProvider"
			v-model="vmodel"
		/>
		<input v-else type="text" :id="inputId" :placeholder="displayName" :dir="textDirection" class="blf-input" v-model="vmodel" />
		<small v-if="description" class="blf-help-text">{{ description }}</small>
	</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { type FilterAutocompleteMetadata, type FilterAutocompleteValue } from '../../model/filter-value-functions';
import createBaseFilterComponent from './FilterBase';

import Autocomplete from '@/shared/ui/Autocomplete.vue';

export default defineComponent({
	components: {
		Autocomplete,
	},
	extends: createBaseFilterComponent<FilterAutocompleteValue, FilterAutocompleteMetadata>({ type: String }),
	computed: {
		dataProvider(): FilterAutocompleteMetadata | undefined {
			return typeof this.definition.metadata === 'function' ? this.definition.metadata : undefined;
		},
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
