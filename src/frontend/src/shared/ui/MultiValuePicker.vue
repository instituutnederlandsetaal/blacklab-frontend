<template>
	<div class="multi-value-picker">
		<div class="selected" v-if="selected.length">
			<button v-for="v in selected" type="button" class="btn option" :key="optionValue(v)" :title="$t('widgets.clickToRemove')" :disabled @click="remove(optionValue(v))">
				{{ optionLabel(v) }}
			</button>
		</div>
		<div class="add" v-if="bisected.unmatched.length > 0">
			<SelectPicker :options="bisected.unmatched" :onBeforeSelect="add" :value="null" data-menu-width="grow" hideEmpty :disabled />
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { filterOptions, isOptGroup, optionLabel, optionValue, type Option, type Options } from '@/shared/utils/options';

import SelectPicker from './SelectPicker.vue';

const modelValue = defineModel<string[] | null>({ required: true });
const { disabled = false, options } = defineProps<{
	disabled?: boolean;
	options: Options;
}>();

const bisected = computed(() => filterOptions(options, new Set(modelValue.value || [])));
const selected = computed(() => bisected.value.matched.flatMap(o => (isOptGroup(o) ? o.options : o)));
const add = (v: Option) => {
	modelValue.value = modelValue.value ? [...modelValue.value, v.value] : [v.value];
	return true;
};
const remove = (v: string) => {
	modelValue.value = modelValue.value?.filter(o => optionValue(o) !== v) ?? null;
};
</script>

<style lang="scss" scoped>
@use 'sass:color';
.selected {
	margin: 0.5rem 0;
	display: inline-flex;
	flex-wrap: wrap;
	gap: 0.5rem;

	.option {
		background-color: color.adjust(#337ab7, $lightness: 40%); // $panel-color (global.scss); maybe separate variables into file we can import here?
		color: black;
		padding-left: 7px;
		padding-right: 7px;

		&::after {
			font-weight: bold;
			content: '✕';
		}
	}
}
</style>
