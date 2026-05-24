<template>
	<div class="blf-field blf-annotation-pos" :id="htmlId">
		<label v-if="showLabel" :for="buttonId">{{ fieldLabel }}</label>
		<div class="blf-annotation-pos__controls">
			<div class="blf-annotation-pos__preview" :class="{ 'is-empty': !selectionSummary }">
				{{ selectionSummary || emptySelectionLabel }}
			</div>
			<div class="blf-annotation-pos__actions">
				<button :id="buttonId" type="button" class="btn btn-default" @click="openEditor">{{ editLabel }}</button>
				<button v-if="hasSelection" type="button" class="btn btn-link" @click="clearSelection">{{ resetLabel }}</button>
			</div>
		</div>
		<small v-if="fieldDescription" class="blf-help-text">{{ fieldDescription }}</small>

		<Modal
			v-if="editorOpen"
			:title="fieldLabel"
			:confirm-message="submitLabel"
			:close-message="cancelLabel"
			:size="modalSize"
			@confirm="commitDraft"
			@close="closeEditor"
		>
			<div class="blf-annotation-pos__list-group-container">
				<div class="list-group blf-annotation-pos__main-list">
					<button
						v-for="value in mainValues"
						type="button"
						:key="value.value"
						:class="{
							'list-group-item': true,
							active: draftState.annotationValue === value.value,
						}"
						@click="toggleAnnotationValue(value.value)"
					>
						{{ value.displayName }}
					</button>
				</div>

				<div v-if="currentAnnotationValue" class="blf-annotation-pos__category-container">
					<ul v-for="subId in currentAnnotationValue.subAnnotationIds" :key="subId" class="list-group blf-annotation-pos__category-list">
						<li class="list-group-item active blf-annotation-pos__category-name">
							{{ subAnnotationLabel(subId) }}
						</li>
						<li class="list-group-item blf-annotation-pos__category-value" v-for="subValue in visibleSubAnnotationValues(subId)" :key="subValue.value">
							<label>
								<input
									type="checkbox"
									:checked="isDraftSelectionChecked(currentAnnotationValue.value, subId, subValue.value)"
									@change="handleSelectionChange(currentAnnotationValue.value, subId, subValue.value, $event)"
								/>
								{{ subValue.displayName }}
							</label>
						</li>
					</ul>
					<em v-if="currentAnnotationValue.subAnnotationIds.length === 0">{{ noOptionsLabel }}</em>
				</div>
			</div>

			<template v-if="queryPreview">
				<hr />
				<div>{{ queryPreview }}</div>
			</template>

			<template #footer>
				<button type="button" class="btn btn-default" @click="resetDraft">{{ resetLabel }}</button>
			</template>
		</Modal>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import {
    buildAnnotationPosQueryPreview,
    cloneAnnotationPosFieldState,
    createAnnotationPosSelectionKey,
    createDefaultAnnotationPosFieldState,
    findTagsetValue,
    getVisibleSubAnnotationValues,
    summarizeAnnotationPosState,
    type AnnotationPosFieldConfig,
    type AnnotationPosFieldState,
} from './annotation-pos-field';

import { useI18n } from '@/shared/i18n';
import Modal from '@/shared/ui/Modal.vue';

const props = withDefaults(
	defineProps<{
		config: AnnotationPosFieldConfig;
		modelValue: AnnotationPosFieldState;
		htmlId: string;
		showLabel?: boolean;
	}>(),
	{
		showLabel: true,
	},
);

const emit = defineEmits<{
	'update:modelValue': [value: AnnotationPosFieldState];
}>();

const i18n = useI18n();
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

const buttonId = computed(() => `${props.htmlId}_editor`);
const mainValues = computed(() => Object.values(props.config.tagset.values));
const currentAnnotationValue = computed(() => findTagsetValue(props.config.tagset, draftState.value.annotationValue));
const fieldLabel = computed(() => i18n.$tAnnotDisplayName(props.config.annotation));
const fieldDescription = computed(() => i18n.$td(`index.annotations.${props.config.annotation.id}_description`, props.config.annotation.defaultDescription));
const editLabel = computed(() => i18n.$td('partOfSpeech.edit', 'Edit'));
const resetLabel = computed(() => i18n.$td('partOfSpeech.reset', 'Reset'));
const submitLabel = computed(() => i18n.$td('partOfSpeech.submit', 'Apply'));
const cancelLabel = computed(() => i18n.$td('common.cancel', 'Cancel'));
const emptySelectionLabel = computed(() => i18n.$td('partOfSpeech.noneSelected', 'No part of speech selected'));
const noOptionsLabel = computed(() => i18n.$td('partOfSpeech.noOptions', 'No additional options'));
const modalSize = computed(() => props.config.modalSize ?? 'lg');
const queryPreview = computed(() => (props.config.showQueryPreview === false ? '' : buildAnnotationPosQueryPreview(props.config, draftState.value)));
const selectionSummary = computed(() => summarizeAnnotationPosState(props.config, props.modelValue, i18n));
const hasSelection = computed(() => !!props.modelValue.annotationValue);

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
	draftState.value.annotationValue = draftState.value.annotationValue === value ? null : value;
}

function visibleSubAnnotationValues(subAnnotationId: string) {
	return getVisibleSubAnnotationValues(props.config.tagset, draftState.value.annotationValue, subAnnotationId);
}

function subAnnotationLabel(subAnnotationId: string): string {
	const subAnnotation = props.config.subAnnotations?.[subAnnotationId] ?? {
		id: subAnnotationId,
		defaultDisplayName: subAnnotationId,
		defaultDescription: undefined,
	};
	return i18n.$tAnnotDisplayName(subAnnotation);
}

function isDraftSelectionChecked(annotationValue: string, subAnnotationId: string, subAnnotationValue: string): boolean {
	return !!draftState.value.selected[createAnnotationPosSelectionKey(annotationValue, subAnnotationId, subAnnotationValue)];
}

function handleSelectionChange(annotationValue: string, subAnnotationId: string, subAnnotationValue: string, event: Event) {
	const target = event.target as HTMLInputElement;
	draftState.value.selected[createAnnotationPosSelectionKey(annotationValue, subAnnotationId, subAnnotationValue)] = target.checked;
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

.blf-annotation-pos__list-group-container {
	display: flex;
	flex-wrap: nowrap;
	gap: 20px;

	> .blf-annotation-pos__main-list,
	> .blf-annotation-pos__category-container {
		max-height: calc(100vh - 305px);
		min-height: 200px;
		overflow: auto;
	}
}

.blf-annotation-pos__main-list {
	display: inline-block;
	flex: none;
	margin: 0;
	padding: 0;
	min-width: 200px;
}

.blf-annotation-pos__category-container {
	flex-grow: 1;
	display: flex;
	flex-wrap: wrap;
	overflow: auto;

	.list-group {
		margin-right: 12px;
		min-width: 140px;
	}

	.list-group-item {
		padding: 6px 10px;
	}

	label {
		margin: 0;
		font-weight: 400;
	}

	input {
		margin-right: 8px;
	}
	}

.blf-annotation-pos__category-list {
	display: inline-block;
	vertical-align: top;
	white-space: nowrap;
	padding: 0;
	flex: none;
}

.blf-annotation-pos__category-name {
	font-weight: 600;
}
</style>