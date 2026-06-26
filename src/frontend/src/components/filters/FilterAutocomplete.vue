<template>
	<div class="form-group filterfield" :id="htmlId" :data-filterfield-type="definition.componentName">
		<label v-if="showLabel" class="col-xs-12" :for="inputId"
			>{{ displayName }} <Debug>(id: {{ id }})</Debug></label
		>
		<Debug v-else
			><label class="col-xs-12">(id: {{ id }})</label></Debug
		>
		<div class="col-xs-12">
			<Autocomplete type="text" useQuoteAsWordBoundary :id="inputId" :placeholder="displayName" :dir="textDirection" :getData="term => autocomplete(term)" v-model="vmodel" />
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

import { useCorpus } from '@/app/state/useCorpusContext';
import createBaseFilterComponent from '@/components/filters/Filter';

import { useBlackLabApi } from '@/shared/api';

import Autocomplete from '@/shared/ui/Autocomplete.vue';

export default defineComponent({
	extends: createBaseFilterComponent<string, string>([String, null], () => ''),
	components: { Autocomplete },
	data: () => ({
		blacklab: useBlackLabApi(),
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
		autocomplete(term: string): Promise<string[]> {
			const corpus = useCorpus().value;
			return this.blacklab.getMetadataAutocomplete(corpus.id, this.definition.metadata, term);
		},
	},
});
</script>
