<template>
	<div class="form-group filterfield" :id="htmlId" :data-filterfield-type="definition.componentName">
		<label v-if="showLabel" class="col-xs-12" :for="inputId"
			>{{ displayName }} <Debug>(id: {{ id }} [{{ fields.low }} - {{ fields.high }}])</Debug></label
		>
		<Debug v-else
			><label class="col-xs-12">(id: {{ id }} [{{ fields.low }} - {{ fields.high }}])</label></Debug
		>
		<div class="col-xs-4">
			<input type="number" :placeholder="$t('filter.range.from')" class="form-control" autocomplete="off" :id="inputId + '_lower'" :v-model="lower" />
		</div>
		<div class="col-xs-4">
			<input type="number" :placeholder="$t('filter.range.to')" class="form-control" autocomplete="off" :id="inputId + '_upper'" v-model="upper" />
		</div>
		<div class="btn-group col-xs-12" style="margin-top: 12px" v-if="!fields.mode">
			<button
				v-for="mode in modes"
				type="button"
				:class="['btn btn-default', { active: modelValue.mode === mode.value }]"
				:key="mode.value"
				:value="mode.value"
				:title="mode.title || ''"
				@click="e_input({ ...modelValue, mode: mode.value })"
			>
				{{ mode.label }}
			</button>
		</div>
		<div class="col-xs-12" v-if="description">
			<small class="text-muted description"
				><em>{{ description }}</em></small
			>
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';

import createBaseFilterComponent from '@/components/filters/Filter';
import type { Option } from '@/shared/utils/options';

import type { FilterRangeMultipleFieldsMetadata, FilterRangeMultipleFieldsValue } from './filterValueFunctions';

type ModeOption = Option & { value: FilterRangeMultipleFieldsValue['mode'] };

export default defineComponent({
	extends: createBaseFilterComponent<FilterRangeMultipleFieldsValue, FilterRangeMultipleFieldsMetadata>(Object as PropType<FilterRangeMultipleFieldsValue>, () => ({
		low: '',
		high: '',
		mode: 'strict',
	})),
	computed: {
		fields(): FilterRangeMultipleFieldsMetadata {
			return this.definition.metadata;
		},
		modes(): ModeOption[] {
			return [
				{
					value: 'permissive',
					label: this.$t('filter.range.permissive').toString(),
					title: this.$t('filter.range.permissiveDescription').toString(),
				},
				{
					value: 'strict',
					label: this.$t('filter.range.strict').toString(),
					title: this.$t('filter.range.strictDescription').toString(),
				},
			];
		},
		upper: {
			get() {
				return this.modelValue.high;
			},
			set(value: string) {
				this.e_input({ ...this.modelValue, high: value });
			},
		},
		lower: {
			get() {
				return this.modelValue.low;
			},
			set(value: string) {
				this.e_input({ ...this.modelValue, low: value });
			},
		},
	},
});
</script>
