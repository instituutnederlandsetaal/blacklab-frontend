<template>
	<div
		class="form-group filterfield"
		:id="htmlId"
		:data-filterfield-type="definition.componentName"
	>
		<label v-if="showLabel" class="col-xs-12" :for="inputId">{{displayName}} <Debug>(id: {{id}})</Debug></label>
		<Debug v-else><label class="col-xs-12">(id: {{id}})</label></Debug>
		<div class="col-xs-12">
			<div class="checkbox" v-for="(option, index) in options" :key="index">
				<!-- TODO optimize this, currently rewriting all values, ergo rerendering all checkboxes every time one changes -->
				<label :for="inputId+'_'+index" :title="option.title || ''"><input
					type="checkbox"

					:value="option.value"
					:name="inputId+'_'+index"
					:id="inputId+'_'+index"
					:checked="modelValue[option.value]"

					@change="toggleCheckboxFromEvent(option.value, $event)"
				> {{option.label || option.value}}</label>
			</div>
		</div>
		<div class="col-xs-12" v-if="description">
			<small class="text-muted description"><em>{{ description }}</em></small>
		</div>
	</div>
</template>


<script lang="ts">
import createBaseFilterComponent from '@/components/filters/Filter';
import type { PropType } from 'vue';
import { defineComponent } from 'vue';

export default defineComponent({
	extends: createBaseFilterComponent(Object as PropType<Record<string, boolean>>),
	methods: {
		toggleCheckboxFromEvent(value: string, event: Event) {
			const target = event.target as HTMLInputElement|null;
			if (!target) {
				return;
			}

			this.toggleCheckbox(value, target.checked);
		},
		toggleCheckbox(value: string, checked: boolean) {
			this.e_input({
				...this.modelValue,
				[value]: checked
			});
		},
	},
});

</script>
