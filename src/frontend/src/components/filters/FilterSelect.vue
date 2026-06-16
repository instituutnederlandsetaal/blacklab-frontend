<template>
	<div class="form-group filterfield" :id="htmlId" :data-filterfield-type="definition.componentName">
		<label v-if="showLabel" class="col-xs-12" :for="inputId"
			>{{ displayName }} <Debug>(id: {{ id }})</Debug></label
		>
		<Debug v-else
			><label class="col-xs-12">(id: {{ id }})</label></Debug
		>
		<div class="col-xs-12">
			<SelectPicker data-width="100%" multiple container="body" :data-id="inputId" :data-name="inputId" :dir="textDirection" :placeholder="displayName" :options="options" v-model="vmodel" />
			<div class="col-xs-12" v-if="description">
				<small class="text-muted description"
					><em>{{ description }}</em></small
				>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';

import createBaseFilterComponent from '@/components/filters/Filter';

import SelectPicker from '../SelectPicker.vue';

export default defineComponent({
	extends: createBaseFilterComponent([Array, null] as PropType<null | string[]>, () => []),
	components: { SelectPicker },
	computed: {
		vmodel: {
			get() {
				return this.modelValue;
			},
			set(value: string[]) {
				this.e_input(value);
			},
		},
	},
});
</script>
