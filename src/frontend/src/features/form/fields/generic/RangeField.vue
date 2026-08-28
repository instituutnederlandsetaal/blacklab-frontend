<template>
	<div v-bind="field.rootAttrs">
		<label v-if="showLabel" :for="`${field.inputId}_lower`" :class="['control-label', field.labelClass]">
			{{ displayName }}
			<Debug> [{{ id }}]</Debug>
		</label>
		<Debug v-else>
			<label :class="['control-label', field.labelClass]">[{{ id }}]</label>
		</Debug>
		<div :class="field.controlsClass">
			<div class="blf-dual-input">
				<input
					:id="`${field.inputId}_lower`"
					v-model="lower"
					:type="resolvedInputType"
					:placeholder="lowPlaceholder || $t(`filter.range.from`)"
					:class="['form-control', field.inputClass]"
					autocomplete="off"
					:disabled
				/>
				<input
					:id="`${field.inputId}_upper`"
					v-model="upper"
					:type="resolvedInputType"
					:placeholder="highPlaceholder || $t(`filter.range.to`)"
					:class="['form-control', field.inputClass]"
					autocomplete="off"
					:disabled
				/>
			</div>
			<div v-if="!mode && modeEnabled" :class="['btn-group', 'blf-range-modes', field.buttonGroupClass]">
				<button
					v-for="option in modeOptions ?? rawRangeModeOptions"
					type="button"
					:class="['btn btn-default', { active: (mode ?? modelValue.mode) === option.value }]"
					:key="option.value"
					:value="option.value"
					:title="optionText(option.title) || ''"
					:disabled
					@click="updateMode(option.value)"
				>
					{{ optionLabel(option) }}
				</button>
			</div>
			<small v-if="description" class="help-block">{{ description }}</small>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useFieldPresentation } from '../field-presentation';
import type { RangeFieldComponentProps, RangeFieldState } from './range-field';
import { rawRangeModeOptions } from './range-mode';

import { optionLabel, optionText } from '@/shared/utils/options';

const props = withDefaults(defineProps<RangeFieldComponentProps>(), {
	showLabel: true,
});
const emit = defineEmits<{
	'update:modelValue': [value: RangeFieldState];
}>();

const field = useFieldPresentation(props);
const modeEnabled = computed(() => props.showMode || Boolean(props.lowField && props.highField));
const resolvedInputType = computed(() => props.inputType ?? (modeEnabled.value ? 'number' : 'text'));

const lower = computed({
	get: () => props.modelValue.low,
	set: low => {
		emit('update:modelValue', {
			...props.modelValue,
			low: String(low),
		});
	},
});

const upper = computed({
	get: () => props.modelValue.high,
	set: high => {
		emit('update:modelValue', {
			...props.modelValue,
			high: String(high),
		});
	},
});

function updateMode(mode: RangeFieldState['mode']) {
	emit('update:modelValue', {
		...props.modelValue,
		mode,
	});
}
</script>

<style lang="scss" scoped>
.blf-range-modes {
	margin-top: 12px;
}
</style>
