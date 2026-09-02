<template>
	<div class="blf-collocation-pattern-editor" :aria-busy="parsing">
		<div class="btn-group blf-collocation-pattern-modes" role="group" :aria-label="$t('collocations.patternMode')">
			<button
				v-for="mode in modes"
				:key="mode"
				type="button"
				:class="['btn', modelValue.mode === mode ? 'btn-primary active' : 'btn-default']"
				:aria-pressed="modelValue.mode === mode"
				:disabled="disabled || parsing"
				@click="selectMode(mode)"
			>
				{{ $t(`collocations.modes.${mode}`) }}
			</button>
		</div>

		<div v-if="modelValue.mode === 'simple'" class="blf-collocation-simple-pattern">
			<div class="form-group blf-collocation-simple-field">
				<label :for="`${htmlId}_annotation`">{{ $t('collocations.patternAnnotation') }}</label>
				<div class="blf-collocation-simple-control">
					<SelectPicker
						:data-id="`${htmlId}_annotation`"
						:data-name="`${htmlId}_annotation`"
						:options="annotationOptions"
						data-width="auto"
						data-menu-width="grow"
						data-class="btn-default blf-collocation-annotation-button"
						container="body"
						hideEmpty
						:disabled="disabled || parsing"
						:model-value="modelValue.simple.annotationId"
						@update:model-value="changeAnnotation"
					/>
					<FieldRenderer
						:field="simpleField"
						:model-value="modelValue.simple.fieldState"
						:html-id="`${htmlId}_${modelValue.simple.annotationId}`"
						:disabled="disabled || parsing"
						@update:model-value="update({ ...modelValue, simple: { ...modelValue.simple, fieldState: $event } })"
					/>
				</div>
			</div>
		</div>

		<FieldRenderer
			v-else-if="modelValue.mode === 'advanced'"
			:field="advancedField"
			:model-value="modelValue.advanced"
			:html-id="`${htmlId}_advanced`"
			:disabled="disabled || parsing"
			@update:model-value="update({ ...modelValue, advanced: $event as QueryBuilderFieldState })"
		/>

		<FieldRenderer
			v-else
			:field="expertField"
			:model-value="modelValue.expert"
			:html-id="`${htmlId}_expert`"
			:disabled="disabled || parsing"
			@update:model-value="update({ ...modelValue, expert: $event as string })"
		/>

		<p v-if="parsing" class="help-block" aria-live="polite">{{ $t('collocations.preparingAdvanced') }}</p>
		<p v-else-if="parseError" class="text-danger" role="alert">{{ $t('collocations.advancedParseError') }}</p>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import {
	createCollocationSimpleFieldNode,
	type CollocationAnnotationOption,
	type CollocationPatternEditorState,
	type CollocationPatternMode,
	type CollocationPatternRole,
} from '@/features/form/fields/collocation-field';
import type { QueryBuilderFieldState } from '@/features/form/fields/query-builder-field';
import type { TokenSequenceCreateField } from '@/features/form/fields/token-sequence-field';
import { collocationPatternToCql } from '@/features/form/model/controllers/collocation-controller';
import { queryBuilderStateToPattern } from '@/features/form/model/controllers/query-builder-controller';
import { useFormSystemRuntime } from '@/features/form/model/runtime';
import type { FormFieldNode } from '@/features/form/model/types/form-shape';

import FieldRenderer from '@/features/form/ui/FieldRenderer.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

const props = withDefaults(
	defineProps<{
		id: string;
		htmlId: string;
		modelValue: CollocationPatternEditorState;
		role: CollocationPatternRole;
		annotationOptions: CollocationAnnotationOption[];
		createAnnotationField: TokenSequenceCreateField;
		advancedField: FormFieldNode;
		expertField: FormFieldNode;
		parsePattern: (cql: string) => Promise<QueryBuilderFieldState | null>;
		disabled?: boolean;
	}>(),
	{ disabled: false },
);
const emit = defineEmits<{
	'update:modelValue': [value: CollocationPatternEditorState];
}>();

const runtime = useFormSystemRuntime();
const modes: CollocationPatternMode[] = ['simple', 'advanced', 'expert'];
const parsing = ref(false);
const parseError = ref(false);
const simpleField = computed(() => createCollocationSimpleFieldNode(props, props.role, props.modelValue.simple.annotationId));

function update(value: CollocationPatternEditorState) {
	emit('update:modelValue', value);
}

function changeAnnotation(value: string | string[] | null) {
	const annotationId = Array.isArray(value) ? value[0] : value;
	if (!annotationId || annotationId === props.modelValue.simple.annotationId) return;
	const field = createCollocationSimpleFieldNode(props, props.role, annotationId);
	update({
		...props.modelValue,
		simple: {
			annotationId,
			fieldState: field.controller.createDefaultState(field, runtime.value.definition.context),
		},
	});
}

async function selectMode(mode: CollocationPatternMode) {
	if (props.disabled || parsing.value || mode === props.modelValue.mode) return;
	parseError.value = false;
	let next = props.modelValue;

	if (mode === 'advanced' && next.mode === 'simple' && !queryBuilderStateToPattern(next.advanced)) {
		const cql = collocationPatternToCql(props, runtime.value.definition.context, next, props.role);
		if (cql) {
			parsing.value = true;
			try {
				const advanced = await props.parsePattern(cql);
				if (!advanced) {
					parseError.value = true;
					return;
				}
				next = { ...next, advanced };
			} catch {
				parseError.value = true;
				return;
			} finally {
				parsing.value = false;
			}
		}
	}

	if (mode === 'expert' && !next.expert.trim()) {
		next = { ...next, expert: collocationPatternToCql(props, runtime.value.definition.context, next, props.role) };
	}
	update({ ...next, mode });
}
</script>

<style lang="scss" scoped>
.blf-collocation-pattern-editor {
	display: grid;
	gap: 12px;
	min-width: 0;
	max-width: 100%;
}

:deep(.blf-query-builder-field),
:deep(.bl-querybuilder-root),
:deep(.bl-token-container) {
	min-width: 0;
	max-width: 100%;
}

:deep(.bl-token-create) {
	position: sticky;
	right: 0;
	z-index: 1;
}

.blf-collocation-pattern-modes {
	justify-self: start;
}

.blf-collocation-simple-pattern {
	min-width: 0;
}

.blf-collocation-simple-field {
	min-width: 0;
	margin-bottom: 0;
}

.blf-collocation-simple-control {
	display: flex;
	min-width: 0;

	> :deep(.combobox) {
		flex: none;
		max-width: min(40%, 18rem);
	}

	:deep(.blf-collocation-annotation-button) {
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
	}

	> :deep(.blf-field) {
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;

		.form-control,
		.menu-button,
		.input-group > :first-child {
			border-left: 0;
			border-top-left-radius: 0;
			border-bottom-left-radius: 0;
		}
	}
}
</style>
