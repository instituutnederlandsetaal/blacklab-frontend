<template>
	<div class="form-group filterfield" :id="htmlId" :data-filterfield-type="definition.componentName">
		<label v-if="showLabel" class="col-xs-12" :for="inputId"
			>{{ displayName }} <Debug>(id: {{ id }})</Debug></label
		>
		<Debug v-else
			><label class="col-xs-12">(id: {{ id }})</label></Debug
		>
		<div class="col-xs-12">
			<input type="text" class="form-control" :id="inputId" :placeholder="displayName" :dir="textDirection" v-model="vmodel" />
			<small v-if="description" class="text-muted description"
				><em>{{ description }}</em></small
			>
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import createBaseFilterComponent from '@/components/filters/Filter';

export default defineComponent({
	extends: createBaseFilterComponent<string, any>([String, null], () => ''),
	computed: {
		vmodel: {
			get() {
				return this.modelValue;
			},
			set(value: string) {
				this.e_input(value);
			},
		},
	},
});
</script>
