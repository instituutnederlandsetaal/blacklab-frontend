<template>
	<div class="form-group filterfield" :id="htmlId" :data-filterfield-type="definition.componentName">
		<label v-if="showLabel" class="col-xs-12" :for="inputId"
			>{{ displayName }} <Debug>(id: {{ id }})</Debug></label
		>
		<Debug v-else
			><label class="col-xs-12">(id: {{ id }})</label></Debug
		>
		<div class="col-xs-12">
			<Autocomplete type="text" useQuoteAsWordBoundary :id="inputId" :placeholder="displayName" :dir="textDirection" :url="autocompleteUrl" v-model="vmodel" />
		</div>
		<div class="col-xs-12" v-if="description">
			<small class="text-muted description"
				><em>{{ description }}</em></small
			>
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import Autocomplete from '@/components/Autocomplete.vue';
import FilterText from '@/components/filters/FilterText.vue';

export default defineComponent({
	extends: FilterText,
	components: { Autocomplete },
	computed: {
		autocompleteUrl(): string {
			return this.definition.metadata as string;
		},
		vmodel: {
			get(): string {
				return this.modelValue;
			},
			set(v: string) {
				this.e_input(v);
			},
		},
	},
});
</script>
