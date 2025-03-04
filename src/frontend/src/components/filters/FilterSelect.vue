<template>
	<div
		class="form-group filterfield"
		:id="htmlId"
		:data-filterfield-type="definition.componentName"
	>
		<label v-if="showLabel" class="col-xs-12" :for="inputId">{{displayName}} <Debug>(id: {{id}})</Debug></label>
		<Debug v-else><label class="col-xs-12">(id: {{id}})</label></Debug>
		<div class="col-xs-12">
			<SelectPicker
				data-width="100%"
				multiple

				container="body"

				:data-id="inputId"
				:data-name="inputId"
				:dir="textDirection"
				:placeholder="displayName"
				:options="options"
				:searchable="searchable"

				:value="value"
				@input="e_input($event);"
			/>
			<div class="col-xs-12" v-if="description">
				<small class="text-muted description"><em>{{ description }}</em></small>
			</div>
		</div>
	</div>
</template>


<script lang="ts">
import BaseFilter from '@/components/filters/Filter';
import SelectPicker, { Option } from '@/components/SelectPicker.vue';

export default BaseFilter.extend({
	components: {
		SelectPicker
	},
	props: {
		value: {
			type: Array as () => string[],
			required: true,
			default: () => []
		},
	},
	computed: {
		searchable(): boolean { return Array.isArray(this.options) && this.options!.length > 10; },
	},
});

</script>
