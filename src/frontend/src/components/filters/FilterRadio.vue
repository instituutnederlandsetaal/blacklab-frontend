<template>
	<div class="form-group filterfield" :id="htmlId" :data-filterfield-type="definition.componentName">
		<label v-if="showLabel" class="col-xs-12" :for="inputId"
			>{{ displayName }} <Debug>(id: {{ id }})</Debug></label
		>
		<Debug v-else
			><label class="col-xs-12">(id: {{ id }})</label></Debug
		>
		<div class="col-xs-12">
			<div class="radio" v-for="(option, index) in options" :key="index">
				<label :for="inputId + '_' + index"
					><input
						type="radio"
						:value="option.value"
						:name="inputId"
						:id="inputId + '_' + index"
						:checked="modelValue === option.value"
						@click="changeValue($event, option.value) /* clear if clicked again */"
						@input.space="changeValue($event, option.value) /* clear if clicked again */"
					/>
					{{ optionLabel(option) }}</label
				>
			</div>
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

import { optionLabel } from '@/shared/utils/options';

export default defineComponent({
	extends: createBaseFilterComponent(Object as PropType<string | undefined>),
	methods: {
		optionLabel,
		changeValue(event: Event, value: string) {
			const t = event.target as HTMLInputElement;
			this.e_input(t.checked ? value : undefined);
		},
	},
});
</script>
