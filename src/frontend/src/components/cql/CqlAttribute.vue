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
				:options="annotationOptions"
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
				:options="operatorOptions"
				data-width="50px"
				data-menu-width="auto"
				hideEmpty
				container="body"
				data-class="btn btn-sm btn-primary bl-selectpicker-hide-caret bl-no-border-radius"
				v-model="model.operator"
			/>

			<!-- Regular Input/Select -->
			<button v-if="hasUploadedValue" 
				type="button" 
				class="btn btn-default btn-sm bl-no-border-radius" 
				:title="$t('search.advanced.queryBuilder.attribute_file_upload_edit_button_title').toString()"
				@click="openModalEditor"
			>
				{{ uploadedValuesSummary }}
			</button>
			<!-- Multi-select for known values -->
			<SelectPicker
				v-else-if="currentAnnotation?.values"
				:options="currentAnnotation.values"
				multiple
				searchable
				data-class="btn btn-default btn-sm bl-no-border-radius-right"
				container="body"
				v-model="model.values"
			/>
			<!-- Text input for free text -->
			<input
				v-else
				type="text"
				class="form-control input-sm bl-no-border-radius-right"
				:dir="textDirection"
				v-model="textValue"
				@input="handleTextInput"
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
			<div class="dropup bl-create-attribute-dropdown">
				<button 
					type="button" 
					class="btn btn-sm btn-default dropdown-toggle" 
					data-toggle="dropdown" 
					:title="$t('search.advanced.queryBuilder.attribute_create_button_title').toString()"
				>
					<span class="glyphicon glyphicon-plus"></span>&#8203;
				</button>
				<ul class="dropdown-menu">
					<li v-for="operator in operatorOptions" :key="operator.value">
						<a 
							href="#" 
							@click.prevent="emitAddAttributeGroup(operator.value)"
						>
							<span class="glyphicon glyphicon-plus-sign text-success"></span> 
							{{ operator.label }}
						</a>
					</li>
				</ul>
			</div>
		
		</div>

		<!-- Case Sensitive Checkbox -->
		<div v-if="currentAnnotation && currentAnnotation.caseSensitive" class="bl-token-attribute-case-and-diacritics-sensitive">
			<div class="checkbox">
				<label>
					<input 
						type="checkbox" 
						v-model="model.caseSensitive"
					>
					{{ $t('search.advanced.queryBuilder.attribute_caseAndDiacriticsSensitive') }}
				</label>
			</div>
		</div>
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
import Vue from 'vue';
import { NormalizedAnnotation, OptGroup, Option } from '@/types/apptypes';
import { CqlAttributeData, CqlComparator, CqlOperator, DEFAULT_OPERATORS } from '@/components/cql/cql-types';
import { Options } from '@/components/SelectPicker.vue';
import SelectPicker from '@/components/SelectPicker.vue';
import Modal from '@/components/Modal.vue';

import useModel from './useModel';

import * as UIStore from '@/store/search/ui';
import * as CorpusStore from '@/store/search/corpus';
import { getAnnotationSubset } from '@/utils';


export default useModel<CqlAttributeData>().extend({
	components: {
		SelectPicker,
		Modal
	},
	data: () => ({ showModal: false }),
	computed: {
		textDirection: CorpusStore.get.textDirection,
		currentAnnotation(): NormalizedAnnotation | undefined { return CorpusStore.get.allAnnotationsMap()[this.model.annotationId]; },

		annotationOptions(): Options {
			const annotationGroups = getAnnotationSubset(
				UIStore.getState().search.advanced.searchAnnotationIds,
				CorpusStore.get.annotationGroups(),
				CorpusStore.get.allAnnotationsMap(),
				'Search',
				this,
				this.textDirection,
				false,
				false
			);
			return annotationGroups.length > 1 ? annotationGroups : annotationGroups.flatMap(g => g.options);
		},

		operatorOptions(): Option[] { 
			return DEFAULT_OPERATORS.map<Option>(op => ({
				label: this.$td(`search.advanced.queryBuilder.boolean_operators.${op.label}`, op.label),
				value: op.operator,
			}));
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
			this.$emit('add-attribute-group', operator, this.model);
		}
	}
});
</script>

<style lang="scss" scoped>

</style>