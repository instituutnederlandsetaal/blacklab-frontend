<template>
	<div :class="fieldClasses" :id="htmlId">
		<label v-if="showLabel" :for="`${inputId}_lower`"
			>{{ displayName }}<debug> [{{ id }}]</debug></label
		>
		<div class="blf-dual-input">
			<input :id="`${inputId}_lower`" v-model="lower" :type="inputType" :placeholder="lowPlaceholder || $t(`filter.range.from`)" class="blf-input form-control" autocomplete="off" :disabled="disabled" />
			<input :id="`${inputId}_upper`" v-model="upper" :type="inputType" :placeholder="highPlaceholder || $t(`filter.range.to`)" class="blf-input form-control" autocomplete="off" :disabled="disabled" />
		</div>
		<div v-if="!lockedMode" class="btn-group blf-range-modes">
			<button
				v-for="mode in modes"
				type="button"
				:class="['btn btn-default', { active: modelValue.mode === mode.value }]"
				:key="mode.value"
					:value="mode.value"
					:title="mode.title || ''"
					:disabled="disabled"
					@click="updateMode(mode.value)"
			>
				{{ mode.label }}
			</button>
		</div>
		<small v-if="description" class="blf-help-text">{{ description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { decodeVariants } from '@/features/form/model/form-utils';
import type { ImplicitFieldComponentProps } from '@/features/form/model/types/form-shape';

import type { RangeMultipleFieldsFieldState, RangeMultipleFieldsFieldUiConfig } from './range-multiple-fields-field';

import { useI18n } from '@/shared/i18n';
import type { Option } from '@/shared/utils/options';

type ModeOption = Option & { value: RangeMultipleFieldsFieldState['mode'] };

const props = withDefaults(defineProps<ImplicitFieldComponentProps<RangeMultipleFieldsFieldState> & RangeMultipleFieldsFieldUiConfig & { showLabel?: boolean }>(), {
	showLabel: true,
	disabled: false,
});
const i18n = useI18n();

const emit = defineEmits<{
	'update:modelValue': [value: RangeMultipleFieldsFieldState];
}>();

const inputId = computed(() => `${props.htmlId}_value`);
const fieldClasses = computed(() => ['blf-field', decodeVariants(props.variant)]);
const inputType = computed(() => props.inputType ?? 'number');
const lockedMode = computed(() => props.mode ?? null);

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

function updateMode(mode: RangeMultipleFieldsFieldState['mode']) {
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
