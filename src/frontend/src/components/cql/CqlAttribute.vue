<template>
	<div class="bl-token-attribute" :id="model.id">
		<div class="bl-token-attribute-main">
			<!-- Delete Button -->
			<button type="button" class="btn btn-xs btn-link" :title="$t('search.advanced.queryBuilder.attribute_delete_attribute_button_title').toString()" @click="emit('delete-attribute', model.id)">
				<span class="glyphicon glyphicon-remove text-primary"></span>
			</button>

			<!-- Annotation Type Select -->
			<SelectPicker
				data-attribute-role="type"
				:options="options.annotationOptions"
				hideEmpty
				data-width="75px"
				data-menu-width="auto"
				container="body"
				data-class="btn btn-sm btn-default bl-no-border-radius-right"
				v-model="model.annotationId"
			/>

			<!-- Operator Select -->
			<SelectPicker
				data-attribute-role="operator"
				:options="options.comparatorOptions"
				data-width="50px"
				data-menu-width="auto"
				hideEmpty
				hideCaret
				container="body"
				data-class="btn btn-sm btn-primary bl-no-border-radius"
				v-model="model.comparator"
			/>

			<!-- Regular Input/Select -->
			<button
				v-if="hasUploadedValue"
				type="button"
				data-attribute-role="value"
				class="btn btn-default btn-sm bl-no-border-radius bl-token-attribute-main-input"
				style="text-align: auto"
				:title="$t('search.advanced.queryBuilder.attribute_file_upload_edit_button_title').toString()"
				@click="openModalEditor"
			>
				<span class="glyphicon glyphicon-edit"></span>
				{{ uploadedValuesSummary }}
			</button>
			<!-- Multi-select for known values -->
			<SelectPicker
				v-else-if="currentAnnotation?.values"
				data-attribute-role="value"
				data-width="auto"
				:options="currentAnnotation.values.map(v => ({ ...v, value: escapeRegex(v.value) }))"
				multiple
				searchable
				container="body"
				data-menu-width="auto"
				data-class="btn btn-default btn-sm bl-no-border-radius bl-token-attribute-main-input"
				class="bl-token-attribute-main-input"
				:modelValue="model.values"
				@update:modelValue="model.values = $event || [] /* workaround for querbuilder emitting null sometimes */"
			/>
			<!-- Text input with optional autocomplete for free text -->
			<Autocomplete
				v-else
				data-attribute-role="value"
				type="text"
				data-width="auto"
				data-class="form-control input-sm bl-no-border-radius bl-token-attribute-main-input"
				:dir="options.textDirection"
				:getData="autocomplete"
				useQuoteAsWordBoundary
				v-model="textValue"
			/>

			<!-- File Upload Controls -->

			<label
				v-if="!hasUploadedValue"
				class="btn btn-sm btn-default bl-no-border-radius bl-input-upload-button"
				:title="$t('search.advanced.queryBuilder.attribute_file_upload_button_title').toString()"
			>
				<input type="file" accept="text/*" style="display: none" :title="$t('search.advanced.queryBuilder.attribute_file_upload_button_title')" @change="handleFileUpload" />
				<span class="glyphicon glyphicon-open"></span>
				<span class="sr-only">{{ $t('search.advanced.queryBuilder.attribute_file_upload_button_title').toString() }}</span>
			</label>

			<!-- Add Controls -->
			<CqlAddAttributeButton @click="emit('add-attribute-group', $event)" :options="options" />
		</div>

		<!-- Case Sensitive Checkbox -->
		<label v-if="currentAnnotation && currentAnnotation.caseSensitive" class="bl-token-attribute-case-and-diacritics-sensitive">
			<input type="checkbox" v-model="model.caseSensitive" />
			{{ $t('search.advanced.queryBuilder.attribute_caseAndDiacriticsSensitive') }}
		</label>
		<Modal
			v-if="showModal"
			size="sm"
			:title="$t('search.advanced.queryBuilder.modalEditor_title')"
			:closeMessage="$t('search.advanced.queryBuilder.modalEditor_cancel')"
			:confirmMessage="$t('search.advanced.queryBuilder.modalEditor_save')"
			@close="closeModalEditor"
			@confirm="confirmModalEditor"
		>
			<template #body>
				<textarea v-model="model.uploadedValue" class="form-control" rows="10" style="width: 100%; overflow: auto; resize: none; white-space: pre"></textarea>
			</template>
			<template #footer>
				<button type="button" class="btn btn-danger pull-left" @click="clearModalEditor">
					{{ $t('search.advanced.queryBuilder.modalEditor_clear') }}
				</button>
			</template>
		</Modal>
	</div>
</template>

<script setup lang="ts">
import { useVModel } from '@vueuse/core';
import { computed, ref } from 'vue';

import type { CqlAnnotationCombinator, CqlAttributeData, CqlQueryBuilderOptions } from '@/components/cql/cql-types';

import { useBlackLabApi } from '@/shared/api';
// import useModel from './useModel';
import { escapeRegex } from '@/shared/utils/string-utils';

import CqlAddAttributeButton from '@/components/cql/CqlAddAttributeButton.vue';
import Autocomplete from '@/shared/ui/Autocomplete.vue';
import Modal from '@/shared/ui/Modal.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

const props = defineProps<{
	options: CqlQueryBuilderOptions;
	modelValue: CqlAttributeData;
}>();
const emit = defineEmits<{
	'update:modelValue': [value: CqlAttributeData];
	'add-attribute-group': [operator: CqlAnnotationCombinator];
	'delete-attribute': [id: string];
}>();

const model = useVModel(props, 'modelValue', emit, {
	deep: true,
	passive: true,
	clone: true,
});

const blacklab = useBlackLabApi();

const showModal = ref(false);
const currentAnnotation = computed(() => props.options.allAnnotationsMap[model.value.annotationId]);

function autocomplete(term: string) {
	if (!currentAnnotation.value) return Promise.resolve([]);
	return blacklab.getTermAutocomplete(props.options.indexId, currentAnnotation.value.annotatedFieldId, currentAnnotation.value.id, term);
}
const hasUploadedValue = computed(() => !!model.value.uploadedValue);
const uploadedValuesSummary = computed(() => {
	if (!hasUploadedValue.value) return '';
	return `${model.value.values.length} value${model.value.values.length !== 1 ? 's' : ''}`;
});
const textValue = computed({
	get(): string {
		return model.value.values.join('|');
	},
	set(value: string) {
		model.value.values = value ? [value] : [''];
	},
});

function parseUploadedFile(contents: string): string[] {
	return contents
		.trim()
		.split(/\s+/g)
		.map(v => v.trim())
		.filter(line => line);
}
function handleFileUpload(event: Event) {
	const target = event.target as HTMLInputElement;
	const file = target.files?.[0];
	if (!file) return;

	const reader = new FileReader();
	reader.onload = e => {
		const content = e.target?.result as string;
		if (content) {
			// Split by lines and filter out empty lines
			model.value.uploadedValue = content;
			model.value.values = parseUploadedFile(content);
		}
	};
	reader.readAsText(file);
}

function confirmModalEditor() {
	model.value.values = parseUploadedFile(model.value.uploadedValue!);
	closeModalEditor();
}
function clearModalEditor() {
	model.value.uploadedValue = undefined;
	model.value.values = [''];
	closeModalEditor();
}
function openModalEditor() {
	showModal.value = true;
}
function closeModalEditor() {
	showModal.value = false;
}
</script>

<style lang="scss">
.bl-token-attribute-main {
	display: flex;
	align-items: center;

	// Main input (either button, input, or dropdown)
	@at-root .bl-token-attribute-main-input {
		flex-grow: 1;
		min-width: 125px; // Allow shrinking below content size
		width: 0 !important; // Allow shrinking below content size
	}
}

.bl-token-attribute-case-and-diacritics-sensitive {
	font-weight: normal;
	padding: 5px 0 0 24px;
}

.bl-token-attribute-main-input-container {
	flex-grow: 1;
	display: inline-block;
	min-width: 110px;
	width: 0;

	> .bl-token-attribute-main-input {
		width: 100%;
		display: flex;
		> input,
		.selectpicker {
			width: 100% !important;
			min-width: 0px !important;
		}
	}
}

.bl-input-upload-button {
	border-left: none;
}

/* Some weirdness going on here, we essentially move the actual
element out of its parent, hide the overflow, and fill the entire container with padding
This fixes issues like browsers overriding the cursor etc.*/
.bl-input-upload {
	position: absolute;
	width: 100%;
	height: 100%;
	margin: 0px;
	padding: 0px;
	padding-left: 100%;
	opacity: 0;
	left: 0;
	top: 0;
	z-index: 10;
	overflow: hidden;
	cursor: pointer;
}
.bl-no-border-radius {
	border-radius: 0px;
}
.bl-no-border-radius-right {
	border-top-right-radius: 0;
	border-bottom-right-radius: 0;
}
.bl-no-border-radius-left {
	border-top-left-radius: 0;
	border-bottom-left-radius: 0;
}

.bl-token-attribute .bl-create-attribute-dropdown button {
	border-left: 0;
	border-top-left-radius: 0;
	border-bottom-left-radius: 0;
}
</style>
