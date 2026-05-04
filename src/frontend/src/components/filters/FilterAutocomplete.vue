<template>
	<div
		class="form-group filterfield"
		:id="htmlId"
		:data-filterfield-type="definition.componentName"
	>
		<label v-if="showLabel" class="col-xs-12" :for="inputId">{{displayName}} <Debug>(id: {{id}})</Debug></label>
		<Debug v-else><label class="col-xs-12">(id: {{id}})</label></Debug>
		<div class="col-xs-12">
			<Autocomplete
				type="text"
			
				useQuoteAsWordBoundary

				:id="inputId"
				:placeholder="displayName"
				:dir="textDirection"

				:getData="definition.metadata"
				v-model="vmodel"
			/>
		</div>
		<div class="col-xs-12" v-if="description">
			<small class="text-muted description"><em>{{ description }}</em></small>
		</div>
	</div>
</template>

<script lang="ts">
import Autocomplete from '@/components/Autocomplete.vue';
import createBaseFilterComponent from '@/components/filters/Filter';
import type { FilterAutocompleteMetadata } from '@/components/filters/filterValueFunctions';
import { defineComponent } from 'vue';

export default defineComponent({
	extends: createBaseFilterComponent<string, FilterAutocompleteMetadata>([String, null], () => ''),
	components: { Autocomplete },
	computed: {
		vmodel: {
			get() { return this.modelValue; },
			set(value: string) { this.e_input(value); }
		},
	}
})


</script>
