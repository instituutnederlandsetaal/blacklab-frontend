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
				v-model="lower"
			>
		</div>
		<div class="col-xs-4">
			<input type="text"
				:placeholder="$t('filter.range.to')"
				class="form-control"
				autocomplete="off"

				:id="inputId+'_upper'"
				v-model="upper"
			>
		</div>
		<div class="col-xs-12" v-if="description">
			<small class="text-muted description"><em>{{ description }}</em></small>
		</div>
	</div>
</template>

<script lang="ts">
import createBaseFilterComponent from '@/components/filters/Filter';
import { defineComponent, type PropType } from 'vue';

export default defineComponent({
	extends: createBaseFilterComponent([Object, null] as PropType<null|{low: string, high: string}>, () => ({low: '', high: ''})),

	computed: {
		lower: {
			get(): string { return this.modelValue?.low ?? ''; },
			set(value: string) { this.e_input({low: value, high: this.modelValue?.high ?? ''}); }
		},
		upper: {
			get(): string { return this.modelValue?.high ?? ''; },
			set(value: string) { this.e_input({low: this.modelValue?.low ?? '', high: value}); }
		}
	}
});

</script>
