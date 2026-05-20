<template>
	<div class="blf-filter-field" :id="htmlId" :data-filterfield-type="definition.componentName">
		<fieldset>
			<legend v-if="showLabel">{{ displayName }}</legend>
			<div class="blf-choice" v-for="(option, index) in options" :key="index">
				<label :for="inputId + '_' + index"
					><input
						type="radio"
						:value="option.value"
						:name="inputId"
						:id="inputId + '_' + index"
						:checked="modelValue === option.value"
						@click="changeValue($event, option.value) /* clear if clicked again */"
						@input.space="changeValue($event, option.value) /* clear if clicked again */"
					/>
					{{ option.label || option.value }}</label
				>
			</div>
		</fieldset>
		<small v-if="description" class="blf-help-text">{{ description }}</small>
	</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import type { FilterRadioMetadata, FilterRadioValue } from '@/features/form/model/filter-value-functions';

import createBaseFilterComponent from './FilterBase';

export default defineComponent({
	extends: createBaseFilterComponent<FilterRadioValue, FilterRadioMetadata>({ type: String, default: '' }),

	methods: {
		changeValue(event: Event, value: string) {
			const t = event.target as HTMLInputElement;
			this.e_input(t.checked ? value : '');
		},
	},
});
</script>
