<template>
	<div v-bind="field.rootAttrs">
		<div :class="field.formGroupClass">
			<label class="control-label" :for="`${htmlId}_picker`">{{ $t('search.parallel.searchSourceVersion') }}</label>
			<SelectPicker :options="sourceOptions" v-model="sourceModel" data-menu-width="grow" hideEmpty :disabled :data-id="`${htmlId}_picker`" />
			<transition name="flash">
				<span v-if="errorNoParallelSourceVersion" class="error">
					{{ $t('search.parallel.errorNoSourceVersion') }}
				</span>
			</transition>
		</div>

		<section class="blf-parallel-query" v-if="sourceModel">
			<h4>{{ $t(`search.parallel.searchSourceVersion`) }}</h4>
			<FieldRenderer
				:field="childFieldTemplate"
				:html-id="`${htmlId}_source_${safeHtmlId(sourceModel ?? 'none')}`"
				:disabled
				:model-value="getValueForChildState(sourceModel)"
				@update:model-value="setValueForChildState(sourceModel, $event)"
			/>
		</section>
		<span v-else class="error">{{ $t('search.parallel.errorNoSourceVersion') }}</span>

		<div :class="field.formGroupClass">
			<label class="control-label">{{ $t('search.parallel.andCompareWithTargetVersions') }}</label>
			<MultiValuePicker :options="targetOptions" v-model="targetModel" :disabled />
		</div>
		<section v-for="target in selectedTargetOptions" :key="target.id" class="blf-parallel-query">
			<h4>{{ $tAnnotatedFieldDisplayName(target) }}</h4>
			<FieldRenderer
				:field="childFieldTemplate"
				:model-value="getValueForChildState(target.id)"
				:html-id="`${htmlId}_target_${safeHtmlId(target.id)}`"
				:disabled
				@update:model-value="setValueForChildState(target.id, $event)"
			/>
		</section>

		<div v-if="alignByOptions?.length" :class="field.formGroupClass">
			<label class="control-label">{{ $t('search.parallel.alignBy') }}</label>
			<div :class="['btn-group', field.buttonGroupClass]" style="display: block">
				<button
					v-for="option in alignByPickerOptions"
					type="button"
					:class="['btn', alignByModel === option.value ? 'active btn-primary' : 'btn-default']"
					:key="option.value"
					:value="option.value"
					:title="option.title || option.value"
					:disabled
					@click="alignByModel = option.value"
				>
					{{ option.label || option.value || 'document' }}
				</button>
				<!-- empty value searches across entire documents -->
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useFieldPresentation } from '@/features/form/fields/field-presentation';
import { createDefaultParallelChildState, type ParallelFieldComponentProps, type ParallelFieldState } from '@/features/form/fields/parallel-field';
import { useFormSystemRuntime } from '@/features/form/model/runtime';

import { useI18n } from '@/shared/i18n';
import { isSimpleOption, type Option } from '@/shared/utils/options';

import FieldRenderer from '@/features/form/ui/FieldRenderer.vue';
import MultiValuePicker from '@/shared/ui/MultiValuePicker.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

const props = defineProps<ParallelFieldComponentProps>();
const runtime = useFormSystemRuntime();
const translate = useI18n();

const emit = defineEmits<{
	'update:modelValue': [value: ParallelFieldState];
}>();

const field = useFieldPresentation(props, { formGroup: false, rootClass: 'blf-parallel-field' });
const sourceOptions = computed<Option[]>(() =>
	props.fieldOptions.filter(option => !props.modelValue.targets.includes(option.id)).map(option => ({ value: option.id, label: translate.$tAnnotatedFieldDisplayName(option) })),
);
const targetOptions = computed<Option[]>(() =>
	props.fieldOptions.filter(option => option.id !== props.modelValue.source).map(option => ({ value: option.id, label: translate.$tAnnotatedFieldDisplayName(option) })),
);
const alignByPickerOptions = computed<Option[]>(() =>
	(props.alignByOptions ?? []).map(option => {
		const normalized = isSimpleOption(option) ? { value: option } : option;
		return {
			...normalized,
			label: translate.$tAlignByDisplayName(normalized),
		};
	}),
);
const selectedTargetOptions = computed(() => props.modelValue.targets.map(target => props.fieldOptions.find(option => option.id === target) ?? { id: target }));

/** The source selected source field, as model */
const sourceModel = computed<string | null>({
	get: () => props.modelValue.source,
	set: (source: string | null) => {
		const childStates = { ...props.modelValue.childStates };
		if (source != null) childStates[source] ??= createDefaultParallelChildState(props, runtime.value.definition.context);
		emit('update:modelValue', {
			...props.modelValue,
			source,
			targets: props.modelValue.targets.filter(target => target !== source),
			childStates,
		});
	},
});
const targetModel = computed<string[]>({
	get: () => props.modelValue.targets,
	set: (targets: string[]) => {
		const selectedTargets = [...new Set(targets.filter(target => target !== props.modelValue.source))];
		const childStates = { ...props.modelValue.childStates };
		for (const target of selectedTargets) childStates[target] ??= createDefaultParallelChildState(props, runtime.value.definition.context);
		emit('update:modelValue', {
			...props.modelValue,
			targets: selectedTargets,
			childStates,
		});
	},
});

const alignByModel = computed<string | null>({
	get: () => props.modelValue.alignBy,
	set: (alignBy: string | null) => {
		emit('update:modelValue', { ...props.modelValue, alignBy });
	},
});

function getValueForChildState(stateKey: string) {
	return props.modelValue.childStates[stateKey] ?? null;
}
function setValueForChildState(stateKey: string, value: unknown) {
	emit('update:modelValue', {
		...props.modelValue,
		childStates: {
			...props.modelValue.childStates,
			[stateKey]: value,
		},
	});
}

function safeHtmlId(value: string) {
	return value.replace(/[^\w-]+/g, '_') || 'target';
}
</script>

<style lang="scss" scoped>
label {
	font-weight: bold;
}

.blf-parallel-field {
	text-align: left;
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
