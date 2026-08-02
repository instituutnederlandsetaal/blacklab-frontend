<template>
	<div v-bind="field.rootAttrs">
		<label v-if="showLabel" :for="buttonId" :class="field.labelClass">{{ annotationLabel }}</label>
		<div :class="field.controlsClass">
			<div class="input-group">
				<input :id="buttonId" type="text" :class="['form-control', field.inputClass]" :value="selectionSummary" readonly :placeholder="$t('partOfSpeech.noneSelected')" />
				<div class="input-group-btn">
					<button v-if="hasSelection" type="button" :class="['btn', 'btn-default', field.buttonClass]" :disabled @click="clearSelection">
						<span class="fa fa-times fa-fw"></span>
						<span class="sr-only">{{ $t('partOfSpeech.reset') }}</span>
					</button>
					<button type="button" :class="['btn', 'btn-default', field.buttonClass]" :disabled @click="openEditor">
						<span class="fa fa-pencil fa-fw"></span>
						<span class="sr-only">{{ $t('partOfSpeech.edit') }}</span>
					</button>
				</div>
			</div>

			<small class="help-block">{{ annotationDescription }}</small>
		</div>

		<Modal
			v-if="editorOpen"
			:title="annotationLabel"
			:confirm-message="$t('partOfSpeech.submit')"
			:close-message="$t('partOfSpeech.cancel')"
			:size="modalSize"
			@confirm="commitDraft"
			@close="closeEditor"
		>
			<div class="list-group-container">
				<div class="list-group main">
					<button
						v-for="value in mainValues"
						type="button"
						:key="value.value"
						:class="{
							'list-group-item': true,
							active: draftState[annotation.id]?.[0] === value.value,
						}"
						@click="toggleAnnotationValue(value.value)"
						:disabled
					>
						{{ value.displayName }}
					</button>
				</div>

				<div v-if="currentAnnotationValue" class="category-container">
					<ul v-for="subId in currentAnnotationValue.subAnnotationIds" :key="subId" class="list-group category">
						<li class="list-group-item active category-name">
							{{ subAnnotationLabel(subId) }}
						</li>
						<li class="list-group-item category-value" v-for="subValue in visibleSubAnnotationValues(subId)" :key="subValue.value">
							<label>
								<input type="checkbox" :checked="isDraftSelectionChecked(subId, subValue.value)" @change="handleSelectionChange(subId, subValue.value, $event)" />
								{{ subValue.displayName }}
							</label>
						</li>
					</ul>
					<em v-if="currentAnnotationValue.subAnnotationIds.length === 0">{{ $t('partOfSpeech.noOptions') }}</em>
				</div>
			</div>
			<template v-if="selectionSummary">
				<hr />
				<div>{{ selectionSummary }}</div>
			</template>
			<template #footer>
				<button type="button" class="btn btn-default" @click="resetDraft">
					{{ $t('partOfSpeech.reset') }}
				</button>
			</template>
		</Modal>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { useFieldPresentation } from '@/features/form/fields/field-presentation';

import {
	annotationReferenceLabel,
	cloneAnnotationPosFieldState,
	createDefaultAnnotationPosFieldState,
	findTagsetValue,
	getVisibleSubAnnotationValues,
	summarizeAnnotationPosState,
	type AnnotationPosFieldComponentProps,
	type AnnotationPosFieldState,
} from './annotation-pos-field';

import Modal from '@/shared/ui/Modal.vue';

type AnnotationPosFieldProps = Omit<AnnotationPosFieldComponentProps, 'modelValue'> & {
	modelValue: AnnotationPosFieldState;
};

const props = withDefaults(defineProps<AnnotationPosFieldProps>(), {
	showLabel: true,
	disabled: false,
});

const emit = defineEmits<{
	'update:modelValue': [value: AnnotationPosFieldState];
}>();

const editorOpen = ref(false);
const draftState = ref(cloneAnnotationPosFieldState(props.modelValue));

watch(
	() => props.modelValue,
	value => {
		if (!editorOpen.value) {
			draftState.value = cloneAnnotationPosFieldState(value);
		}
	},
	{ deep: true },
);

const field = useFieldPresentation(props);
const buttonId = computed(() => `${props.htmlId}_editor`);
const annotationLabel = computed(() => props.displayName ?? annotationReferenceLabel(props.annotation));
const annotationDescription = computed(() => props.description ?? props.annotation.defaultDescription);
const mainValues = computed(() => Object.values(props.tagset.values));
const currentAnnotationValue = computed(() => findTagsetValue(props.tagset, draftState.value[props.annotation.id]?.[0]));
const modalSize = computed(() => props.modalSize ?? 'lg');
const selectionSummary = computed(() => summarizeAnnotationPosState(props, draftState.value));
const hasSelection = computed(() => !!props.modelValue[props.annotation.id]?.[0]);

function openEditor() {
	draftState.value = cloneAnnotationPosFieldState(props.modelValue);
	editorOpen.value = true;
}

function closeEditor() {
	editorOpen.value = false;
	draftState.value = cloneAnnotationPosFieldState(props.modelValue);
}

function commitDraft() {
	emit('update:modelValue', cloneAnnotationPosFieldState(draftState.value));
	editorOpen.value = false;
}

function clearSelection() {
	emit('update:modelValue', createDefaultAnnotationPosFieldState());
	if (editorOpen.value) {
		draftState.value = createDefaultAnnotationPosFieldState();
	}
}

function resetDraft() {
	draftState.value = createDefaultAnnotationPosFieldState();
}

function toggleAnnotationValue(value: string) {
	draftState.value = draftState.value[props.annotation.id]?.[0] === value ? {} : { [props.annotation.id]: [value] };
}

function visibleSubAnnotationValues(subAnnotationId: string) {
	return getVisibleSubAnnotationValues(props.tagset, draftState.value[props.annotation.id]?.[0], subAnnotationId);
}

function subAnnotationLabel(subAnnotationId: string): string {
	const subAnnotation = props.subAnnotations?.[subAnnotationId] ?? {
		id: subAnnotationId,
		defaultDisplayName: subAnnotationId,
		defaultDescription: '',
	};
	return annotationReferenceLabel(subAnnotation);
}

function isDraftSelectionChecked(subAnnotationId: string, subAnnotationValue: string): boolean {
	return draftState.value[subAnnotationId]?.includes(subAnnotationValue) ?? false;
}

function handleSelectionChange(subAnnotationId: string, subAnnotationValue: string, event: Event) {
	const target = event.target as HTMLInputElement;
	const values = draftState.value[subAnnotationId] ?? [];
	const updatedValues = target.checked ? [...new Set([...values, subAnnotationValue])] : values.filter(value => value !== subAnnotationValue);
	if (updatedValues.length) draftState.value[subAnnotationId] = updatedValues;
	else delete draftState.value[subAnnotationId];
}
</script>

<style lang="scss" scoped>
.blf-annotation-pos__controls {
	display: flex;
	gap: 12px;
	align-items: center;
}

.blf-annotation-pos__preview {
	flex: 1 1 auto;
	min-height: 34px;
	padding: 6px 10px;
	border: 1px solid #ccc;
	border-radius: 4px;
	background: #fff;
	line-height: 1.4;
}

.blf-annotation-pos__preview.is-empty {
	color: #777;
	font-style: italic;
}

.blf-annotation-pos__actions {
	display: flex;
	align-items: center;
	gap: 8px;
	flex: none;
}

.list-group-container {
	display: flex;
	flex-wrap: nowrap;

	> .list-group.main,
	> .category-container {
		max-height: calc(100vh - 305px);
		min-height: 200px;
		overflow: auto;
	}
}

.category-container {
	overflow: auto;
	flex-grow: 1;
	display: flex;
	flex-wrap: wrap;

	.list-group {
		margin-right: 12px;
		min-width: 120px;
		> .list-group-item {
			padding: 6px 10px;
		}
	}
}

.list-group {
	padding: 0;

	&.main {
		display: inline-block;
		flex: none;
		flex-basis: auto;
		margin: 0 20px 0 0;
	}

	&.category {
		display: inline-block;
		vertical-align: top;
		white-space: nowrap;
		flex: none;

		label {
			margin: 0;
			padding: 0;
		}
	}
}
</style>
