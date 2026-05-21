<template>
	<div class="blf-field" :id="htmlId" :data-filterfield-type="definition.componentName">
		<fieldset>
			<legend v-if="showLabel">{{ displayName }}</legend>
			<div class="checkbox" v-for="(option, index) in options" :key="index">
				<!-- TODO optimize this, currently rewriting all values, ergo rerendering all checkboxes every time one changes -->
				<label :for="inputId + '_' + index" :title="option.title || ''">
					<input
						type="checkbox"
						:value="option.value"
						:name="inputId + '_' + index"
						:id="inputId + '_' + index"
						:checked="selectedValues[option.value]"
						@change="toggleCheckboxFromEvent(option.value, $event)"
					/>
					{{ option.label || option.value }}
				</label>
			</div>
		</fieldset>
		<small v-if="description" class="blf-help-text">{{ description }}</small>
	</div>
</template>

<script lang="ts">
import type { PropType } from 'vue';
import { defineComponent } from 'vue';

import type { FilterCheckboxValue, FilterCheckboxMetadata } from '@/features/form/model/filter-value-functions';

import createBaseFilterComponent from './FilterBase';

export default defineComponent({
	extends: createBaseFilterComponent<FilterCheckboxValue, FilterCheckboxMetadata>({ type: Object as PropType<FilterCheckboxValue>, default: () => ({}) }),
	computed: {
		selectedValues(): FilterCheckboxValue {
			return this.modelValue ?? {};
		},
	},
	methods: {
		toggleCheckboxFromEvent(value: string, event: Event) {
			const target = event.target as HTMLInputElement | null;
			if (!target) {
				return;
			}

			this.toggleCheckbox(value, target.checked);
		},
		toggleCheckbox(value: string, checked: boolean) {
			this.e_input({
				...this.modelValue,
				[value]: checked,
			});
		},
	},
});
</script>
