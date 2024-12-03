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
					:checked="value[option.value]"

					@change="toggleCheckbox(option.value, $event.target.checked);"
				> {{option.label || option.value}}</label>
			</div>
		</div>
		<div class="col-xs-12" v-if="description">
			<small class="text-muted description"><em>{{ description }}</em></small>
		</div>
	</div>
</template>


<script lang="ts">
import BaseFilter from '@/components/filters/Filter';

export default BaseFilter.extend({
	props: {
		value: {
			type: Object as () => {
				[value: string]: boolean;
			},
			required: true,
			default: () => ({})
		}
	},
	methods: {
		toggleCheckbox(value: string, checked: boolean) {
			this.e_input({
				...this.value,
				[value]: checked
			});
		},
	},
});

</script>
