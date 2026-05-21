<template>
	<div class="blf-field" :id="htmlId" :data-filterfield-type="definition.componentName">
		<label v-if="showLabel" :for="inputId">{{ displayName }}</label>
		<SelectPicker
			data-width="100%"
			multiple
			container="body"
			:data-id="inputId"
			:data-name="inputId"
			:placeholder="displayName"
			:dir="textDirection"
			:options="options"
			v-model="vmodel"
		/>
		<small v-if="description" class="blf-help-text">{{ description }}</small>
	</div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';

import type { FilterSelectValue, FilterSelectMetadata } from '@/features/form/model/filter-value-functions';

import SelectPicker from '@/shared/ui/SelectPicker.vue';

import createBaseFilterComponent from './FilterBase';

export default defineComponent({
	components: {
		SelectPicker,
	},
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
