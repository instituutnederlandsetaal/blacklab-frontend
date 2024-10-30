<template>
	<div
		class="form-group filterfield"
		:id="htmlId"
		:data-filterfield-type="definition.componentName"
	>
		<label v-if="showLabel" class="col-xs-12" :for="inputId">{{displayName}} <Debug>(id: {{id}})</Debug></label>
		<Debug v-else><label>(id: {{id}})</label></Debug>
		<div class="col-xs-4">
			<input type="text"
				:placeholder="$t('filter.range.from')"
				class="form-control"
				autocomplete="off"

				:id="inputId+'_lower'"
				:value="value.low"

				@input="e_input({low: $event.target.value, high: value.high})"
			>
		</div>
		<div class="col-xs-4">
			<input type="text"
				:placeholder="$t('filter.range.to')"
				class="form-control"
				autocomplete="off"

				:id="inputId+'_upper'"
				:value="value.high"

				@input="e_input({low: value.low, high: $event.target.value})"
			>
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
				low: string,
				high: string
			},
			required: true,
			default: () => ({
				high: '',
				low: ''
			})
		}
	},
});

</script>
