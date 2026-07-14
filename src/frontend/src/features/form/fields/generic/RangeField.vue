<template>
	<div :class="formGroupClasses" :id="htmlId">
		<label v-if="showLabel" :for="`${inputId}_lower`" class="control-label">{{ resolvedDisplayName }}</label>
		<debug>[{{ id }}]</debug>
		<div class="blf-dual-input">
			<input :id="`${inputId}_lower`" v-model="lower" :type="resolvedInputType" :placeholder="lowPlaceholder || $t(`filter.range.from`)" class="form-control" autocomplete="off" :disabled />
			<input :id="`${inputId}_upper`" v-model="upper" :type="resolvedInputType" :placeholder="highPlaceholder || $t(`filter.range.to`)" class="form-control" autocomplete="off" :disabled />
		</div>
		<div v-if="showModeSelector" :class="btnGroupClasses">
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
		<small v-if="resolvedDescription" class="help-block">{{ resolvedDescription }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed, toValue } from 'vue';

import { decodeVariants } from '@/features/form/model/form-utils';
import type { ImplicitFieldComponentProps } from '@/features/form/model/types';

import type { RangeFieldState, RangeFieldUiConfig } from './range-field';
import type { RangeMode } from './shared-ui-config';

import { useI18n } from '@/shared/i18n';
import type { Option } from '@/shared/utils/options';

type ModeOption = Option<RangeMode>;

const props = withDefaults(defineProps<ImplicitFieldComponentProps<RangeFieldState> & RangeFieldUiConfig & { showLabel?: boolean; lowField?: string; highField?: string }>(), {
	showLabel: true,
	disabled: false,
});
const i18n = useI18n();
const emit = defineEmits<{
	'update:modelValue': [value: RangeFieldState];
}>();

const inputId = computed(() => `${props.htmlId}_value`);
const resolvedDisplayName = computed(() => toValue(props.displayName));
const resolvedDescription = computed(() => (props.description ? toValue(props.description) : undefined));
const variant = computed(() => decodeVariants(props.variant));
const formGroupClasses = computed(() => ['form-group', variant.value.large ? 'form-group-lg' : variant.value.small ? 'form-group-sm' : '']);

const btnGroupClasses = computed(() => ['btn-group', 'blf-range-modes', variant.value.large ? 'btn-group-lg' : variant.value.small ? 'btn-group-sm' : '']);
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
