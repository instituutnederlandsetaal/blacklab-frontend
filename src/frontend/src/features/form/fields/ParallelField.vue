<template>
	<div :class="fieldClasses">
		<div>
			<div :class="{ 'form-group': true, 'form-group-lg': lg }">
				<label :class="{ 'col-xs-12': !block, 'col-md-3': !block, 'control-label': block }">{{ $t('search.parallel.searchSourceVersion') }}</label>
				<div :class="{ 'col-xs-12': !block, 'col-md-9': !block }">
					<SelectPicker :options="sourceOptions" v-model="sourceModel" data-menu-width="grow" hideEmpty :disabled="disabled" />
					<transition name="flash">
						<span v-if="errorNoParallelSourceVersion" class="error">
							{{ $t('search.parallel.errorNoSourceVersion') }}
						</span>
					</transition>
				</div>
			</div>
			<div :class="{ 'form-group': true, 'form-group-lg': lg }">
				<label :class="{ 'col-xs-12': !block, 'col-md-3': !block, 'control-label': block }">{{ $t('search.parallel.andCompareWithTargetVersions') }}</label>
				<div :class="{ 'col-xs-12': !block, 'col-md-9': !block }">
					<MultiValuePicker :options="targetOptions" v-model="targetModel" />
				</div>
			</div>
			<div v-if="alignByOptions?.length" :class="{ 'form-group': true, 'form-group-lg': lg }">
				<label :class="{ 'col-xs-12': !block, 'col-md-3': !block, 'control-label': block }">{{ $t('search.parallel.alignBy') }}</label>
				<div class="btn-group clearfix" style="display: block" :class="{ 'col-xs-12': !block, 'col-md-9': !block }">
					<button
						v-for="option in alignByPickerOptions"
						type="button"
						:class="['btn', modelValue.alignBy === option.value ? 'active btn-primary' : 'btn-default']"
						:key="option.value"
						:value="option.value"
						:title="option.title || option.value"
						:disabled="disabled"
						@click="updateAlignBy(option.value)"
					>
						{{ option.label || option.value || 'document' }}
					</button>
					<!-- empty value searches across entire documents -->
				</div>
			</div>
		</div>

		<div class="blf-parallel-queries">
			<section class="blf-parallel-query">
				<h4>{{ $t(`search.parallel.searchSourceVersion`) }}</h4>
				<component :is="child.component" v-bind="sourceChildProps" @update:modelValue="updateSourceState" />
			</section>

			<section v-for="field in selectedTargetOptions" :key="field.id" class="blf-parallel-query">
				<h4>{{ $tAnnotatedFieldDisplayName(field) }}</h4>
				<component :is="child.component" v-bind="targetChildProps(field.id)" @update:modelValue="updateTargetState(field.id, $event)" />
			</section>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { decodeVariants } from '@/features/form/model/form-utils';
import { useFormSystemRuntime } from '@/features/form/model/runtime';

import type { ParallelFieldComponentProps, ParallelFieldState } from '../model/controllers/parallel-controller';

import { useI18n } from '@/shared/i18n';
import type { Option } from '@/shared/utils/options';

import MultiValuePicker from '@/shared/ui/MultiValuePicker.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

const props = defineProps<
	ParallelFieldComponentProps & {
		block?: boolean;
		lg?: boolean;
		errorNoParallelSourceVersion?: boolean;
	}
>();
const runtime = useFormSystemRuntime();
const translate = useI18n();

const emit = defineEmits<{
	'update:modelValue': [value: ParallelFieldState];
}>();

const fieldClasses = computed(() => ['blf-field', 'blf-parallel-field', decodeVariants(props.variant)]);
const htmlId = computed(() => props.htmlId);
const sourceOptions = computed<Option[]>(() =>
	props.fieldOptions
		.filter(field => !props.modelValue.targets.includes(field.id))
		.map(field => ({ value: field.id, label: translate.$tAnnotatedFieldDisplayName(field) })),
);
const targetOptions = computed<Option[]>(() =>
	props.fieldOptions.filter(field => field.id !== props.modelValue.source).map(field => ({ value: field.id, label: translate.$tAnnotatedFieldDisplayName(field) })),
);
const alignByPickerOptions = computed<Option[]>(() => (props.alignByOptions ?? []).map(value => ({ value, label: translate.$tAlignByDisplayName({ value }) })));
const selectedTargetOptions = computed(() => props.modelValue.targets.map(target => props.fieldOptions.find(field => field.id === target) ?? { id: target }));
const sourceChildProps = computed(() => ({
	...props.child.config,
	id: `${props.id}.source.${props.child.id}`,
	htmlId: `${htmlId.value}_source_${props.child.id}`,
	modelValue: props.modelValue.sourceState ?? createDefaultChildState('source'),
	disabled: props.disabled,
	variant: props.variant,
}));
const sourceModel = computed({
	get: () => props.modelValue.source ?? '',
	set: updateSource,
});
const targetModel = computed<string[]>({
	get: () => props.modelValue.targets,
	set: updateTargets,
});

function updateSource(source: string) {
	emit('update:modelValue', {
		...props.modelValue,
		source: source || null,
		targets: props.modelValue.targets.filter(target => target !== source),
	});
}

function updateTargets(targets: string[] | null) {
	const selectedTargets = (targets ?? []).filter(target => target !== props.modelValue.source);
	const targetStates = { ...props.modelValue.targetStates };
	for (const target of selectedTargets) {
		targetStates[target] ??= createDefaultChildState(target);
	}
	emit('update:modelValue', {
		...props.modelValue,
		targets: selectedTargets,
		targetStates,
	});
}

function updateAlignBy(alignBy: string) {
	emit('update:modelValue', { ...props.modelValue, alignBy: alignBy || null });
}

function updateSourceState(sourceState: unknown) {
	emit('update:modelValue', { ...props.modelValue, sourceState });
}

function updateTargetState(target: string, targetState: unknown) {
	emit('update:modelValue', {
		...props.modelValue,
		targetStates: {
			...props.modelValue.targetStates,
			[target]: targetState,
		},
	});
}

function targetChildProps(target: string) {
	return {
		...props.child.config,
		id: `${props.id}.${target}.${props.child.id}`,
		htmlId: `${htmlId.value}_target_${safeHtmlId(target)}_${props.child.id}`,
		modelValue: props.modelValue.targetStates[target] ?? createDefaultChildState(target),
		disabled: props.disabled,
		variant: props.variant,
	};
}

function createDefaultChildState(role: string) {
	return props.child.controller.createDefaultState(
		{
			...props.child.config,
			id: `${props.id}.${role}.${props.child.id}`,
			kind: 'field',
			variant: props.variant,
		},
		runtime.context,
	);
}

function safeHtmlId(value: string) {
	return value.replace(/[^\w-]+/g, '_') || 'target';
}
</script>

<style lang="scss" scoped>
label {
	font-weight: bold;
}

.error {
	color: red;
	margin: 0.5em 0 0 1em;
	font-weight: bold;
}

.blf-parallel-queries {
	display: grid;
	gap: 12px;
	margin-top: 12px;
}

.blf-parallel-query {
	h4 {
		font-size: 1rem;
		font-weight: 600;
		margin: 0 0 6px;
	}
}

@keyframes flash {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.1;
	}
}

.flash-enter-active {
	animation: flash 0.5s ease-in-out 2;
}
</style>
