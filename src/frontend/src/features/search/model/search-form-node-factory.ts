import type { Corpus } from '@/app/state/useCorpusContext';
import {
	annotationPosController,
	annotationSelectController,
	annotationTextController,
	createRangeModeOptions,
	createFormFieldNode,
	filterCheckboxController,
	filterDateController,
	filterRadioController,
	filterRangeController,
	filterSelectController,
	filterTextController,
	withinAttributeRangeController,
	withinAttributeSelectController,
	withinAttributeTextController,
	type BaseFieldNode,
	type FormFieldNodeOptions,
	type FormFieldNode,
} from '@/features/form';
import { createLexiconLookup } from '@/features/form/fields/generic/lexicon-field';
import type { SearchFormConfiguration } from '@/features/search/model/search-form-configuration';
import type { SearchFormWithinAttribute } from '@/features/search/model/search-form-customization';
import type { NormalizedAnnotation, NormalizedMetadataField, Tagset } from '@/types/apptypes';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { debugLog } from '@/shared/debug/debug';
import type { Translate } from '@/shared/i18n';

import AnnotationPosField from '@/features/form/fields/AnnotationPosField.vue';
import CheckboxField from '@/features/form/fields/generic/CheckboxField.vue';
import DateField from '@/features/form/fields/generic/DateField.vue';
import LexiconField from '@/features/form/fields/generic/LexiconField.vue';
import RadioField from '@/features/form/fields/generic/RadioField.vue';
import RangeField from '@/features/form/fields/generic/RangeField.vue';
import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';

type SearchFormFieldOptions = FormFieldNodeOptions & {
	groupId?: string;
	variant?: BaseFieldNode['variant'];
	showLabel?: boolean;
};

export type SearchFormNodeFactory = {
	annotation(annotation: NormalizedAnnotation, options: SearchFormFieldOptions): FormFieldNode;
	metadata(field: NormalizedMetadataField, options: SearchFormFieldOptions): FormFieldNode;
	withinAttribute(attribute: SearchFormWithinAttribute, options: SearchFormFieldOptions): FormFieldNode;
};

export function createSearchFormNodeFactory({
	blacklabApi,
	configuration,
	corpus,
	tagset,
	translate,
}: {
	blacklabApi: BlackLabApi;
	configuration: SearchFormConfiguration;
	corpus: Corpus;
	tagset: Tagset | undefined;
	translate: Translate;
}): SearchFormNodeFactory {
	const modeOptions = createRangeModeOptions(translate);

	function annotationCommon(annotation: NormalizedAnnotation, options: SearchFormFieldOptions) {
		return {
			description: () => translate.$tAnnotDescription(annotation),
			displayName: () => translate.$tAnnotDisplayName(annotation),
			groupId: options.groupId,
			showLabel: options.showLabel,
			textDirection: annotation.isMainAnnotation ? corpus.textDirection : undefined,
			variant: options.variant,
		};
	}

	function annotationText(annotation: NormalizedAnnotation, options: SearchFormFieldOptions) {
		return createFormFieldNode(options, annotationTextController, TextField, {
			...annotationCommon(annotation, options),
			annotationId: annotation.id,
			autocomplete: annotation.uiType !== 'text' ? (term: string) => blacklabApi.getTermAutocomplete(corpus.id, annotation.annotatedFieldId, annotation.id, term) : undefined,
			caseSensitive: annotation.caseSensitive,
		});
	}

	const factory: SearchFormNodeFactory = {
		annotation(annotation, options) {
			const common = annotationCommon(annotation, options);
			if (annotation.uiType === 'pos') {
				if (!tagset) {
					debugLog('form-setup', 'No tagset provided for POS field, but annotation requires it. Falling back to autocomplete.', { annotation, corpus });
					return annotationText(annotation, options);
				}
				return createFormFieldNode(options, annotationPosController, AnnotationPosField, {
					...common,
					annotation,
					showQueryPreview: true,
					subAnnotations: Object.fromEntries(
						[...new Set([...(annotation.subAnnotations ?? []), ...Object.keys(tagset.subAnnotations)])].map(subAnnotationId => {
							const corpusAnnotation = corpus.allAnnotatedFieldsMap[annotation.annotatedFieldId]?.annotations[subAnnotationId];
							const subAnnotation = corpusAnnotation ?? {
								id: subAnnotationId,
								defaultDisplayName: tagset.subAnnotations[subAnnotationId]?.displayName ?? subAnnotationId,
								defaultDescription: '',
							};
							return [
								subAnnotationId,
								{
									...subAnnotation,
									label: () => translate.$tAnnotDisplayName(subAnnotation),
								},
							];
						}),
					),
					tagset,
				});
			}
			if (annotation.uiType === 'select' || annotation.uiType === 'combobox') {
				if (!annotation.values?.length) return annotationText(annotation, options);
				return createFormFieldNode(options, annotationSelectController, SelectField, {
					...common,
					annotationId: annotation.id,
					multiple: true,
					options: annotation.values,
				});
			}
			if (annotation.uiType === 'lexicon') {
				return createFormFieldNode(options, annotationTextController, LexiconField, {
					...common,
					annotationId: annotation.id,
					lookup: createLexiconLookup({
						database: configuration.lexiconDatabase,
						getTermFrequencies: async values => {
							const response = await blacklabApi.getTermFrequencies(corpus.id, annotation.id, values);
							return response.termFreq;
						},
					}),
				});
			}
			return annotationText(annotation, options);
		},

		metadata(field, options) {
			const common = {
				description: () => translate.$tMetaDescription(field),
				displayName: () => translate.$tMetaDisplayName(field),
				groupId: options.groupId,
				metadataFieldId: field.id,
				showLabel: options.showLabel,
				textDirection: corpus.textDirection,
				variant: options.variant,
			};

			if (field.values?.length) {
				const config = { ...common, options: field.values };
				if (field.uiType === 'checkbox') return createFormFieldNode(options, filterCheckboxController, CheckboxField, config);
				if (field.uiType === 'radio') return createFormFieldNode(options, filterRadioController, RadioField, config);
				if (field.uiType === 'select' || field.uiType === 'combobox') return createFormFieldNode(options, filterSelectController, SelectField, { ...config, multiple: true });
			}
			if (field.uiType === 'date') return createFormFieldNode(options, filterDateController, DateField, { ...common, range: true, modeOptions });
			if (field.uiType === 'range') return createFormFieldNode(options, filterRangeController, RangeField, { ...common, inputType: 'number', modeOptions });
			return createFormFieldNode(options, filterTextController, TextField, {
				...common,
				autocomplete: field.uiType !== 'text' ? (term: string) => blacklabApi.getMetadataAutocomplete(corpus.id, field.id, term) : undefined,
			});
		},
		withinAttribute(attribute, options) {
			const common = {
				description: () => translate.$tMetaDescription(attribute),
				displayName: () => translate.$tWithinAttributeDisplayName(attribute.elementName, attribute.attributeName, attribute.defaultDisplayName || attribute.id),
				groupId: options.groupId,
				elementName: attribute.elementName,
				attributeName: attribute.attributeName,
				textDirection: corpus.textDirection,
				variant: options.variant,
			};
			if (typeof attribute.control === 'object') {
				return createFormFieldNode(options, withinAttributeSelectController, SelectField, { ...common, multiple: true, options: attribute.control.options });
			}
			if (attribute.control === 'range') return createFormFieldNode(options, withinAttributeRangeController, RangeField, { ...common, inputType: 'text', modeOptions });
			return createFormFieldNode(options, withinAttributeTextController, TextField, common);
		},
	};
	return factory;
}
