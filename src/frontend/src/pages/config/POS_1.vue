<template>
	<div>
		<h3>{{ title }}</h3>
		<SelectPicker
			:options="options"
			:modelValue="modelValue.mainPosAnnotationId"
			@update:modelValue="$emit('update:modelValue', { ...modelValue, mainPosAnnotationId: $event })"
			placeholder="Select annotation"
			allowHtml
			searchable
		/>
		<button type="button" class="btn btn-primary" @click="$emit('submit')" :disabled="!modelValue.mainPosAnnotationId">OK</button>
		<button type="button" class="btn btn-default" @click="$emit('update:modelValue', { ...modelValue, mainPosAnnotationId: defaultPosAnnotation && defaultPosAnnotation.id })">Default</button>
	</div>
</template>

<script lang="ts">
import type { PropType } from 'vue';
import { defineComponent } from 'vue';

import type { NormalizedAnnotation } from '@/types/apptypes';
import type { Option } from '@/utils/options';

import type { StepState } from './POS.vue';
import SelectPicker from '@/components/SelectPicker.vue';

export const value = 'Choose main';
export const label = value;
export const title = 'Select annotation to use as Part of Speech root';

export const defaultAction = (s: StepState): StepState => {
	let defaultPosAnnot = s.annotations.find(a => a.uiType === 'pos') || s.annotations.find(a => a.id.toLowerCase() === 'pos' || a.defaultDisplayName.toLowerCase() === 'part of speech');
	if (!defaultPosAnnot) throw new Error('Cannot determine default pos annotation');

	return { ...s, mainPosAnnotationId: defaultPosAnnot.id };
};

export const step = defineComponent({
	components: { SelectPicker },
	emits: ['update:modelValue', 'submit'],
	props: {
		modelValue: { type: Object as PropType<StepState>, required: true },
	},
	data: () => ({
		title,
	}),
	computed: {
		defaultPosAnnotation(): NormalizedAnnotation | undefined {
			return this.modelValue.annotations.find(a => a.uiType === 'pos');
		},
		options(): Option[] {
			return this.modelValue.annotations.map(a => ({
				value: a.id,
				label: `${a.id} <small class="text-muted">${a.defaultDisplayName}</small>`,
				// disabled: !a.hasForwardIndex,
				title: !a.hasForwardIndex ? 'Annotation requires forward index in order to retrieve values' : undefined,
			}));
		},
	},
	created() {},
});

export default step;
</script>
