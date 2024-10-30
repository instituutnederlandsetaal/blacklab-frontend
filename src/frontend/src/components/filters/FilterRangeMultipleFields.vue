<template>
	<div
		class="form-group filterfield"
		:id="htmlId"
		:data-filterfield-type="definition.componentName"
	>
		<label v-if="showLabel" class="col-xs-12" :for="inputId">{{displayName}} <Debug>(id: {{id}} [{{fields.low}} - {{fields.high}}])</Debug></label>
		<Debug v-else><label class="col-xs-12">(id: {{id}} [{{fields.low}} - {{fields.high}}])</label></Debug>
		<div class="col-xs-4">
			<input type="number"
				:placeholder="$t('filter.range.from')"
				class="form-control"
				autocomplete="off"

				:id="inputId+'_lower'"
				:value="value.low"

				@input="e_input({...value, low: $event.target.value})"
			>
		</div>
		<div class="col-xs-4">
			<input type="number"
				:placeholder="$t('filter.range.to')"
				class="form-control"
				autocomplete="off"

				:id="inputId+'_upper'"
				:value="value.high"

				@input="e_input({...value, high: $event.target.value})"
			>
		</div>
		<div class="btn-group col-xs-12" style="margin-top: 12px;" v-if="!fields.mode">
			<button v-for="mode in modes"
				type="button"
				:class="['btn btn-default', {'active': value.mode === mode.value}]"
				:key="mode.value"
				:value="mode.value"
				:title="mode.title || ''"
				@click="e_input({...value, mode: mode.value})"
			>{{mode.label}}</button>
		</div>
		<div class="col-xs-12" v-if="description">
			<small class="text-muted description"><em>{{ description }}</em></small>
		</div>
	</div>
</template>

<script lang="ts">
import BaseFilter from '@/components/filters/Filter';
import { Option } from '@/components/SelectPicker.vue';

export const modes = {
	permissive: {
		id: 'permissive',
		operator: 'OR',
	},

	strict: {
		id: 'strict',
		operator: 'AND',
	}
};

type Mode = keyof typeof modes;

type ValueType = {
	low: string;
	high: string;
	mode: Mode;
};

export default BaseFilter.extend({
	props: {
		value: {
			type: Object as () => ValueType,
			required: true,
			default: () => ({
				low: '',
				high: '',
				mode: 'strict'
			}) as ValueType
		},
	},
	computed: {
		fields(): { low: string, high: string, mode?: keyof typeof modes } { return this.definition.metadata; },
		modes(): Option[] {
			return Object.values(modes).map<Option>(m => ({
				value: m.id,
				label: this.$td(`filter.range.${m.id}`, m.id),
				title: this.$td(`filter.range.${m.id}_description`, m.id)
			}))
		},
	}
});
</script>
