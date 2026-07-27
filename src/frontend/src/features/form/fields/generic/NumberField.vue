<template>
	<div v-bind="field.rootAttrs">
		<label v-if="showLabel" :for="field.inputId" :class="['control-label', field.labelClass]">
			{{ displayName }}
			<Debug> [{{ id }}]</Debug>
		</label>
		<Debug v-else>
			<label :class="['control-label', field.labelClass]">[{{ id }}]</label>
		</Debug>
		<div :class="field.controlsClass">
			<input
				:id="field.inputId"
				:class="['form-control', field.inputClass]"
				type="number"
				:value="modelValue"
				:min="finiteMin"
				:max="finiteMax"
				:step="normalizedStep"
				:disabled
				@input="updateValue"
			/>
			<small v-if="description" class="help-block">{{ description }}</small>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useFieldPresentation } from '../field-presentation';
import type { NumberFieldComponentProps } from './number-field';

const props = withDefaults(defineProps<NumberFieldComponentProps>(), {
	showLabel: true,
	disabled: false,
	step: 1,
});
const emit = defineEmits<{
	'update:modelValue': [value: number];
}>();

const field = useFieldPresentation(props);
const finiteMin = computed(() => (Number.isFinite(props.min) ? props.min : undefined));
const finiteMax = computed(() => (Number.isFinite(props.max) ? props.max : undefined));
const normalizedStep = computed(() => (Number.isFinite(props.step) && props.step > 0 ? props.step : 1));

function normalizeValue(value: number): number {
	const stepBase = finiteMin.value ?? 0;
	const stepped = stepBase + Math.round((value - stepBase) / normalizedStep.value) * normalizedStep.value;
	// Avoid exposing ordinary floating-point noise such as 0.30000000000000004.
	let normalized = Number.isFinite(stepped) ? Number(stepped.toPrecision(15)) : value;
	if (finiteMin.value != null) normalized = Math.max(finiteMin.value, normalized);
	if (finiteMax.value != null) normalized = Math.min(finiteMax.value, normalized);
	return normalized;
}

function updateValue(event: Event) {
	const input = event.target as HTMLInputElement;
	const parsed = input.valueAsNumber;
	if (!Number.isFinite(parsed)) {
		input.value = String(props.modelValue);
		return;
	}

	const normalized = normalizeValue(parsed);
	input.value = String(normalized);
	emit('update:modelValue', normalized);
}
</script>
