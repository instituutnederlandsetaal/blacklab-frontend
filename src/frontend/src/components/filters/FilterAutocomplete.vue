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
				class="form-control"

				useQuoteAsWordBoundary

				:id="inputId"
				:placeholder="displayName"
				:dir="textDirection"

				:url="autocompleteUrl"
				v-model="modelvalue"
			/>
		</div>
		<div class="col-xs-12" v-if="description">
			<small class="text-muted description"><em>{{ description }}</em></small>
		</div>
	</div>
</template>

<script lang="ts">
import Autocomplete from '@/components/Autocomplete.vue';
import FilterText from '@/components/filters/FilterText.vue';

export default FilterText.extend({
	components: { Autocomplete },
	props: {
		value: {
			type: String,
			required: true,
			default: '',
		}
	},
	computed: {
		autocompleteUrl(): string { return this.definition.metadata as string; },
		modelvalue: {
			get(): string { return this.value; },
			set(v: string) { this.e_input(v); }
		}
	},
});

</script>
