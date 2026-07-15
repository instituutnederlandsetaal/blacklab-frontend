<template>
	<div v-bind="field.rootAttrs">
		<label v-if="showLabel" :for="`${field.inputId}_lower`" class="control-label">{{ displayName }}</label>
		<debug>[{{ id }}]</debug>
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
		<div v-if="showModeSelector" :class="['btn-group', 'blf-range-modes', field.buttonGroupClass]">
			<button
				v-for="mode in modes"
				type="button"
				:class="['btn btn-default', { active: currentMode === mode.value }]"
				:key="mode.value"
				:value="mode.value"
				:title="mode.title || ''"
				:disabled
				@click="updateMode(mode.value)"
			>
				{{ mode.label }}
			</button>
		</div>
		<small v-if="description" class="help-block">{{ description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useFieldPresentation } from '../field-presentation';
import type { RangeFieldComponentProps, RangeFieldState } from './range-field';
import type { RangeMode } from './range-mode';

import { useI18n } from '@/shared/i18n';
import type { Option } from '@/shared/utils/options';

type ModeOption = Option<RangeMode>;

const props = withDefaults(defineProps<RangeFieldComponentProps>(), {
	showLabel: true,
	disabled: false,
});
const i18n = useI18n();
const emit = defineEmits<{
	'update:modelValue': [value: RangeFieldState];
}>();

const field = useFieldPresentation(props);
const lockedMode = computed(() => props.mode ?? null);
const modeEnabled = computed(() => props.showMode || Boolean(props.lowField && props.highField));
const showModeSelector = computed(() => !lockedMode.value && modeEnabled.value);
const currentMode = computed(() => props.mode ?? props.modelValue.mode);
const resolvedInputType = computed(() => props.inputType ?? (modeEnabled.value ? 'number' : 'text'));

const modes = computed<ModeOption[]>(() => [
	{
		value: 'permissive',
		label: i18n.$t(`filter.range.permissive`),
		title: i18n.$t(`filter.range.permissiveDescription`),
	},
	{
		value: 'strict',
		label: i18n.$t(`filter.range.strict`),
		title: i18n.$t(`filter.range.strictDescription`),
	},
]);

const lower = computed({
	get: () => props.modelValue.low,
	set: (low: string) => {
		emit('update:modelValue', {
			...props.modelValue,
			low,
		});
	},
});

const upper = computed({
	get: () => props.modelValue.high,
	set: (high: string) => {
		emit('update:modelValue', {
			...props.modelValue,
			high,
		});
	},
});

function updateMode(mode: RangeMode) {
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
