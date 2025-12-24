<template>
	<div class="bl-token-attribute" :id="model.id">
		<div class="bl-token-attribute-main">
			<!-- Delete Button -->
			<button
				type="button"
				class="btn btn-xs btn-link"
				:title="$t('search.advanced.queryBuilder.attribute_delete_attribute_button_title').toString()"
				@click="$emit('delete-attribute', model.id)"
			>
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
			<button v-if="hasUploadedValue"
				type="button"
				data-attribute-role="value"
				class="btn btn-default btn-sm bl-no-border-radius bl-token-attribute-main-input"
				style="text-align: auto;"
				:title="$t('search.advanced.queryBuilder.attribute_file_upload_edit_button_title').toString()"
				@click="openModalEditor"
			>
				<span class="glyphicon glyphicon-edit"></span>
				{{ uploadedValuesSummary }}
			</button>
			<!-- Multi-select for known values -->
			<SelectPicker v-else-if="currentAnnotation?.values"
				data-attribute-role="value"
				:options="currentAnnotation.values.map(v => ({...v, value: escapeRegex(v.value)}))"
				multiple
				searchable
				container="body"
				data-menu-width="auto"
				data-class="btn btn-default btn-sm bl-no-border-radius bl-token-attribute-main-input"
				class="bl-token-attribute-main-input"
				:value="model.values"
				@input="model.values = $event || [] /* workaround for querbuilder emitting null sometimes */"
			/>
			<!-- Text input with optional autocomplete for free text -->
			<Autocomplete v-else
				data-attribute-role="value"
				type="text"
				class="form-control input-sm bl-no-border-radius bl-token-attribute-main-input"
				:dir="textDirection"
				:url="autocompleteUrl"
				useQuoteAsWordBoundary
				v-model="textValue"
			/>

			<!-- File Upload Controls -->

			<label v-if="!hasUploadedValue"
				class="btn btn-sm btn-default bl-no-border-radius bl-input-upload-button"
				:title="$t('search.advanced.queryBuilder.attribute_file_upload_button_title').toString()"
			>
				<input
					type="file"
					accept="text/*"
					style="display: none;"
					:title="$t('search.advanced.queryBuilder.attribute_file_upload_button_title')"
					@change="handleFileUpload"
				>
				<span class="glyphicon glyphicon-open"></span>
				<span class="sr-only">{{ $t('search.advanced.queryBuilder.attribute_file_upload_button_title').toString() }}</span>
			</label>

			<!-- Add Controls -->
			<CqlAddAttributeButton @click="emitAddAttributeGroup($event)" :options="options" />
		</div>

		<!-- Case Sensitive Checkbox -->
		<label v-if="currentAnnotation && currentAnnotation.caseSensitive" class="bl-token-attribute-case-and-diacritics-sensitive">
			<input
				type="checkbox"
				v-model="model.caseSensitive"
			>
			{{ $t('search.advanced.queryBuilder.attribute_caseAndDiacriticsSensitive') }}
		</label>
		<Modal v-if="showModal" size="sm"
			:title="$t('search.advanced.queryBuilder.modalEditor_title')"
			:closeMessage="$t('search.advanced.queryBuilder.modalEditor_cancel')"
			:confirmMessage="$t('search.advanced.queryBuilder.modalEditor_save')"

			@close="closeModalEditor"
			@confirm="confirmModalEditor"
		>
			<template #body>
				<textarea
					v-model="model.uploadedValue"
					class="form-control"
					rows="10"
					style="width:100%;overflow:auto;resize:none;white-space:pre;"
				></textarea>
			</template>
			<template #footer>
				<button
					type="button"
					class="btn btn-danger pull-left"
					@click="clearModalEditor"
				>
					{{ $t('search.advanced.queryBuilder.modalEditor_clear') }}
				</button>
			</template>
		</Modal>
	</div>
</template>

<script lang="ts">
import { NormalizedAnnotation, OptGroup, Option } from '@/types/apptypes';
import { CqlAttributeData, CqlQueryBuilderOptions } from '@/components/cql/cql-types';
import SelectPicker from '@/components/SelectPicker.vue';
import Modal from '@/components/Modal.vue';
import CqlAddAttributeButton from '@/components/cql/CqlAddAttributeButton.vue';
import Autocomplete from '@/components/Autocomplete.vue';
import { blacklabPaths } from '@/api';

import useModel from './useModel';
import { escapeRegex } from '@/utils';


export default useModel<CqlAttributeData>().extend({
	components: {
		CqlAddAttributeButton,
		SelectPicker,
		Modal,
		Autocomplete,
	},
	props: {
		options: { type: Object as () => CqlQueryBuilderOptions, required: true },
	},
	data: () => ({ showModal: false }),
	computed: {
		textDirection(): 'ltr' | 'rtl' { return this.options.textDirection; },
		currentAnnotation(): NormalizedAnnotation | undefined {
			return this.options.allAnnotationsMap[this.model.annotationId];
		},
		autocompleteUrl(): string {
			if (!this.currentAnnotation) return '';
			return blacklabPaths.autocompleteAnnotation(INDEX_ID, this.currentAnnotation.annotatedFieldId, this.currentAnnotation.id);
		},

		hasUploadedValue(): boolean { return !!this.model.uploadedValue },

		uploadedValuesSummary(): string {
			if (!this.hasUploadedValue) return '';
			return `${this.model.values.length} value${this.model.values.length !== 1 ? 's' : ''}`;
		},

		textValue: {
			get(): string {
				return this.model.values.join('|');
			},
			set(value: string) {
				this.model.values = value ? [value] : [''];
			}
		}
	},
	methods: {
		escapeRegex,
		handleTextInput(event: Event) {
			const target = event.target as HTMLInputElement;
			this.model.values = target.value ? [target.value] : [''];
		},

		parseUploadedFile(contents: string): string[] {
			return contents.trim().split(/\s+/g).map(v => v.trim()).filter(line => line);
		},

		handleFileUpload(event: Event) {
			const target = event.target as HTMLInputElement;
			const file = target.files?.[0];
			if (!file) return;

			const reader = new FileReader();
			reader.onload = (e) => {
				const content = e.target?.result as string;
				if (content) {
					// Split by lines and filter out empty lines
					this.model.uploadedValue = content;
					this.model.values = this.parseUploadedFile(content);
				}
			};
			reader.readAsText(file);
		},

		confirmModalEditor() {
			this.model.values = this.parseUploadedFile(this.model.uploadedValue!);
			this.closeModalEditor();
		},
		clearModalEditor() {
			this.model.uploadedValue = undefined;
			this.model.values = [''];
			this.closeModalEditor();
		},
		openModalEditor() { this.showModal = true; },
		closeModalEditor() { this.showModal = false; },

		emitAddAttributeGroup(operator: string) {
			this.$emit('add-attribute-group', operator);
		}
	}
});
</script>

<style lang="scss">

.bl-token-attribute-main {
	display: flex;
	align-items: center;

	// Main input (either button, input, or dropdown)
	@at-root .bl-token-attribute-main-input {
		flex-grow: 1;
		min-width: 125px; // Allow shrinking below content size
		width: 0!important; // Allow shrinking below content size
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
		>input,
		.selectpicker {
			width: 100%!important;
			min-width: 0px!important;
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
	position:absolute;
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