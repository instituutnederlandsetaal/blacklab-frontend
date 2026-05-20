<template>
	<div class="blf-field blf-parallel-field">
		<label>{{ config.label || 'Parallel search' }}</label>
		<div class="blf-parallel-grid">
			<label :for="`${node.id}_source`">{{ config.sourceLabel || 'Source' }}</label>
			<select :id="`${node.id}_source`" class="blf-input" :value="state.source || ''" @change="updateSource(($event.target as HTMLSelectElement).value)">
				<option value=""></option>
				<option v-for="option in config.sourceOptions" :key="option.value" :value="option.value" :title="option.title || undefined">{{ option.label || option.value }}</option>
			</select>

			<label>{{ config.targetLabel || 'Targets' }}</label>
			<div class="blf-targets">
				<button
					v-for="option in targetOptions"
					:key="option.value"
					type="button"
					:class="{ active: state.targets.includes(option.value) }"
					:title="option.title || undefined"
					@click="toggleTarget(option.value)"
				>
					{{ option.label || option.value }}
				</button>
			</div>

			<label v-if="config.alignByOptions?.length" :for="`${node.id}_align`">{{ config.alignByLabel || 'Align by' }}</label>
			<select v-if="config.alignByOptions?.length" :id="`${node.id}_align`" class="blf-input" :value="state.alignBy || ''" @change="updateAlignBy(($event.target as HTMLSelectElement).value)">
				<option value=""></option>
				<option v-for="option in config.alignByOptions" :key="option.value" :value="option.value" :title="option.title || undefined">{{ option.label || option.value }}</option>
			</select>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { ParallelFieldConfig, ParallelFieldState } from '@/features/form/model/controllers/parallel-controller';
import type { FormFieldNode } from '@/features/form/model/types/form-shape';

// import type { FormFieldNode, ParallelFieldConfig, ParallelFieldState } from '../model/types';
const props = defineProps<{
	node: FormFieldNode<ParallelFieldConfig>;
	state: ParallelFieldState;
}>();

const emit = defineEmits<{
	'update:state': [state: ParallelFieldState];
}>();

const node = computed(() => props.node);
const config = computed(() => props.node.config);
const state = computed(() => props.state);
const targetOptions = computed(() => (config.value.targetOptions ?? config.value.sourceOptions).filter(option => option.value !== props.state.source));

function updateSource(source: string) {
	emit('update:state', {
		...props.state,
		source: source || null,
		targets: props.state.targets.filter(target => target !== source),
	});
}

function toggleTarget(target: string) {
	const targets = props.state.targets.includes(target) ? props.state.targets.filter(value => value !== target) : [...props.state.targets, target];
	emit('update:state', { ...props.state, targets });
}

function updateAlignBy(alignBy: string) {
	emit('update:state', { ...props.state, alignBy: alignBy || null });
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
