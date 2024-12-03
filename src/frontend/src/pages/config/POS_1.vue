<template>
	<div>
		<h3>{{title}}</h3>
		<SelectPicker :options="options" :value="value.mainPosAnnotationId" @input="$emit('input', {...value, mainPosAnnotationId: $event})" placeholder="Select annotation" allowHtml searchable/>
		<button type="button" @click="$emit('submit')" :disabled="!value.mainPosAnnotationId">OK</button>
		<button type="button" @click="$emit('input', {...value, mainPosAnnotationId: defaultPosAnnotation && defaultPosAnnotation.id})">Default</button>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import { NormalizedAnnotation, Option } from '@/types/apptypes';
import SelectPicker from '@/components/SelectPicker.vue';
import {StepState} from './POS.vue';

export const value = 'Choose main'
export const label = value;
export const title = 'Select annotation to use as Part of Speech root';

export const defaultAction = (s: StepState): StepState => {
	let defaultPosAnnot = s.annotations.find(a => a.uiType === 'pos') || s.annotations.find(a => a.id.toLowerCase() === 'pos' || a.defaultDisplayName.toLowerCase() === 'part of speech');
	if (!defaultPosAnnot)
		throw new Error('Cannot determine default pos annotation');

	return {...s, mainPosAnnotationId: defaultPosAnnot.id};
}

export const lastStepChanged = (s: StepState): StepState => s; // what?

export const step = Vue.extend({
	components: { SelectPicker },
	props: {
		value: Object as () => StepState
	},
	data: () => ({
		title
	}),
	computed: {
		defaultPosAnnotation(): NormalizedAnnotation|undefined { return this.value.annotations.find(a => a.uiType === 'pos'); },
		options(): Option[] {
			return this.value.annotations.map(a => ({
				value: a.id,
				label: `${a.id} <small class="text-muted">${a.defaultDisplayName}</small>`,
				// disabled: !a.hasForwardIndex,
				title: !a.hasForwardIndex ? 'Annotation requires forward index in order to retrieve values' : undefined
			}));
		}
	},
	created() {
	}
});

export default step;

</script>