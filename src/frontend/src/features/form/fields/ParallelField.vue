<template>
	<div :class="fieldClasses">
		<label>{{ label || 'Parallel search' }}</label>
		<div class="blf-parallel-grid">
			<label :for="`${htmlId}_source`">{{ sourceLabel || 'Source' }}</label>
			<select :id="`${htmlId}_source`" class="blf-input form-control" :value="modelValue.source || ''" @change="updateSource(($event.target as HTMLSelectElement).value)">
				<option value=""></option>
				<option v-for="option in sourceOptions" :key="option.value" :value="option.value" :title="option.title || undefined">{{ option.label || option.value }}</option>
			</select>

			<label>{{ targetLabel || 'Targets' }}</label>
			<div class="blf-targets">
				<button
					v-for="option in targetOptions"
					:key="option.value"
					type="button"
					:class="{ active: modelValue.targets.includes(option.value) }"
					:title="option.title || undefined"
					@click="toggleTarget(option.value)"
				>
					{{ option.label || option.value }}
				</button>
			</div>

			<label v-if="alignByOptions?.length" :for="`${htmlId}_align`">{{ alignByLabel || 'Align by' }}</label>
			<select
				v-if="alignByOptions?.length"
				:id="`${htmlId}_align`"
				class="blf-input form-control"
				:value="modelValue.alignBy || ''"
				@change="updateAlignBy(($event.target as HTMLSelectElement).value)"
			>
				<option value=""></option>
				<option v-for="option in alignByOptions" :key="option.value" :value="option.value" :title="option.title || undefined">{{ option.label || option.value }}</option>
			</select>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { ParallelFieldComponentProps, ParallelFieldState } from '@/features/form/model/controllers/parallel-controller';
import { getVariantClassNames } from '@/features/form/model/form-utils';
const props = defineProps<ParallelFieldComponentProps>();

const emit = defineEmits<{
	'update:modelValue': [value: ParallelFieldState];
}>();

const fieldClasses = computed(() => ['blf-field', 'blf-parallel-field', ...getVariantClassNames(props.variant, 'blf-field')]);
const htmlId = computed(() => props.htmlId);
const targetOptions = computed(() => (props.targetOptions ?? props.sourceOptions).filter(option => option.value !== props.modelValue.source));

function updateSource(source: string) {
	emit('update:modelValue', {
		...props.modelValue,
		source: source || null,
		targets: props.modelValue.targets.filter(target => target !== source),
	});
}

function toggleTarget(target: string) {
	const targets = props.modelValue.targets.includes(target) ? props.modelValue.targets.filter(value => value !== target) : [...props.modelValue.targets, target];
	emit('update:modelValue', { ...props.modelValue, targets });
}

function updateAlignBy(alignBy: string) {
	emit('update:modelValue', { ...props.modelValue, alignBy: alignBy || null });
}
</script>

<style lang="scss" scoped>
.blf-parallel-grid {
	display: grid;
	grid-template-columns: max-content minmax(12rem, 1fr);
	gap: 8px 12px;
	align-items: center;
}

.blf-targets {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;

	button {
		border: 1px solid #c8d0d9;
		background: #fff;
		border-radius: 4px;
		padding: 5px 8px;
	}

	button.active {
		background: #216ba5;
		border-color: #216ba5;
		color: #fff;
	}
}
</style>
