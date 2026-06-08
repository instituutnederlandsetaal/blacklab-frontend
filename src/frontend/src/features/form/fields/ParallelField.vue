<template>
	<div :class="fieldClasses">
		<div class="blf-parallel-grid">
			<label :for="`${htmlId}_source`">{{ $t(`search.parallel.searchSourceVersion`) }}</label>
			<select :id="`${htmlId}_source`" class="blf-input form-control" :value="modelValue.source || ''" :disabled="disabled" @change="updateSource(($event.target as HTMLSelectElement).value)">
				<option value=""></option>
				<option v-for="field in sourceOptions" :key="field.id" :value="field.id">
					{{ $tAnnotatedFieldDisplayName(field) }}
				</option>
			</select>

			<label>{{ $t(`search.parallel.andCompareWithTargetVersions`) }}</label>
			<div class="blf-targets">
				<button v-for="field in targetOptions" :key="field.id" type="button" :class="{ active: modelValue.targets.includes(field.id) }" :disabled="disabled" @click="toggleTarget(field.id)">
					{{ $tAnnotatedFieldDisplayName(field) }}
				</button>
			</div>

			<label v-if="alignByOptions?.length" :for="`${htmlId}_align`">{{ $t(`search.parallel.alignBy`) }}</label>
			<select
				v-if="alignByOptions?.length"
				:id="`${htmlId}_align`"
				class="blf-input form-control"
				:value="modelValue.alignBy || ''"
				:disabled="disabled"
				@change="updateAlignBy(($event.target as HTMLSelectElement).value)"
			>
				<option value=""></option>
				<option v-for="alignBy in alignByOptions" :key="alignBy" :value="alignBy">
					{{ $tAlignByDisplayName({ value: alignBy }) }}
				</option>
			</select>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue';

import { decodeVariants } from '@/features/form/model/form-utils';

import type { ParallelFieldComponentProps, ParallelFieldConfig, ParallelFieldState } from '../model/controllers/parallel-controller';

const props = defineProps({
	htmlId: {
		type: String,
		required: true,
	},
	modelValue: {
		type: Object as PropType<ParallelFieldState>,
		required: true,
	},
	disabled: {
		type: Boolean,
		default: false,
	},
	variant: {
		type: [String, Array] as PropType<ParallelFieldComponentProps['variant']>,
		default: undefined,
	},
	sourceOptions: {
		type: Array as PropType<ParallelFieldConfig['sourceOptions']>,
		required: true,
	},
	targetOptions: {
		type: Array as PropType<ParallelFieldConfig['targetOptions']>,
		required: true,
	},
	alignByOptions: {
		type: Array as PropType<ParallelFieldConfig['alignByOptions']>,
		default: undefined,
	},
});

const emit = defineEmits<{
	'update:modelValue': [value: ParallelFieldState];
}>();

const fieldClasses = computed(() => ['blf-field', 'blf-parallel-field', decodeVariants(props.variant)]);
const htmlId = computed(() => props.htmlId);
const targetOptions = computed(() => props.targetOptions.filter(field => field.id !== props.modelValue.source));

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
