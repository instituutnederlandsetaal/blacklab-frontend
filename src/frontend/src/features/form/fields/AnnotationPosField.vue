<template>
	<div :class="fieldClasses" :id="htmlId">
		<label v-if="showLabel" :for="buttonId">{{ $tAnnotDisplayName(annotation) }}</label>
		<div class="blf-annotation-pos__controls">
			<div class="blf-annotation-pos__preview" :class="{ 'is-empty': !selectionSummary }">
				{{ selectionSummary || $t('partOfSpeech.noneSelected') }}
			</div>
			<div class="blf-annotation-pos__actions">
				<button :id="buttonId" type="button" class="btn btn-default" @click="openEditor">
					{{ $t('partOfSpeech.edit') }}
				</button>
				<button v-if="hasSelection" type="button" class="btn btn-link" @click="clearSelection">
					{{ $t('partOfSpeech.reset') }}
				</button>
			</div>
		</div>
		<small class="blf-help-text">{{ $tAnnotDescription(annotation) }}</small>

		<Modal
			v-if="editorOpen"
			:title="$tAnnotDisplayName(annotation)"
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
							active: draftState.annotationValue === value.value,
						}"
						@click="toggleAnnotationValue(value.value)"
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
								<input
									type="checkbox"
									:checked="isDraftSelectionChecked(currentAnnotationValue.value, subId, subValue.value)"
									@change="handleSelectionChange(currentAnnotationValue.value, subId, subValue.value, $event)"
								/>
								{{ subValue.displayName }}
							</label>
						</li>
					</ul>
					<em v-if="currentAnnotationValue.subAnnotationIds.length === 0">{{ $t('partOfSpeech.noOptions') }}</em>
				</div>
			</div>

			<template v-if="queryPreview">
				<hr />
				<div>{{ queryPreview }}</div>
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

import { decodeVariants } from '@/features/form/model/form-utils';
import type { ImplicitFieldComponentProps } from '@/features/form/model/types';

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

const props = withDefaults(defineProps<ImplicitFieldComponentProps<AnnotationPosFieldState> & AnnotationPosFieldConfig & { showLabel?: boolean }>(), {
	showLabel: true,
});

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
const fieldClasses = computed(() => ['blf-field', 'blf-annotation-pos', decodeVariants(props.variant)]);
const mainValues = computed(() => Object.values(props.tagset.values));
const currentAnnotationValue = computed(() => findTagsetValue(props.tagset, draftState.value.annotationValue));
const modalSize = computed(() => props.modalSize ?? 'lg');
const queryPreview = computed(() => (props.showQueryPreview === false ? '' : buildAnnotationPosQueryPreview(props, draftState.value)));
const selectionSummary = computed(() => summarizeAnnotationPosState(props, props.modelValue, i18n));
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
	return getVisibleSubAnnotationValues(props.tagset, draftState.value.annotationValue, subAnnotationId);
}

function subAnnotationLabel(subAnnotationId: string): string {
	const subAnnotation = props.subAnnotations?.[subAnnotationId] ?? {
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
