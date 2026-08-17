import type {
	SearchFormAnnotationControl,
	SearchFormAnnotationReference,
	SearchFormMetadataReference,
	SearchFormNodeConstructors as PublicSearchFormNodeConstructors,
	SearchFormNodeOptions,
	SearchFormWithinTarget,
} from '@/customization-api/external/external-api';
import {
	AnnotationPosField,
	CheckboxField,
	DateField,
	LexiconField,
	RadioField,
	RangeField,
	SelectField,
	TextField,
	annotationPosController,
	annotationSelectController,
	annotationTextController,
	createFormFieldNode,
	createRangeModeOptions,
	filterCheckboxController,
	filterDateController,
	filterRadioController,
	filterRangeController,
	filterSelectController,
	filterTextController,
	withinAttributeRangeController,
	withinAttributeSelectController,
	withinAttributeTextController,
	type FormFieldNode,
} from '@/features/form';
import { createLexiconLookup } from '@/features/form/fields/generic/lexicon-field';
import type { Corpus } from '@/types/apptypes';
import type { NormalizedAnnotation, NormalizedMetadataField, Tagset } from '@/types/apptypes';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { debugLog } from '@/shared/debug/debug';
import type { Translate } from '@/shared/i18n';

/** Implementations checked against every constructor in the public API. */
type SearchFormNodeConstructorImplementations = {
	[Constructor in keyof PublicSearchFormNodeConstructors]: (...args: Parameters<PublicSearchFormNodeConstructors[Constructor]>) => FormFieldNode;
};

type SearchFormNodeCustomization = {
	searchFormAnnotationControl(annotationId: string, annotatedFieldId?: string): Exclude<SearchFormAnnotationControl, 'auto'> | null;
	searchFormLexiconDatabase(): string;
};

/** Creates form field constructors for the current corpus. */
export function createSearchFormNodeConstructors({
	blacklabApi,
	corpus,
	customizations,
	tagset,
	translate,
}: {
	blacklabApi: BlackLabApi;
	corpus: Corpus;
	customizations: SearchFormNodeCustomization;
	tagset: Tagset | undefined;
	translate: Translate;
}): SearchFormNodeConstructorImplementations {
	const modeOptions = createRangeModeOptions(translate);

	function resolveAnnotation(reference: SearchFormAnnotationReference): NormalizedAnnotation {
		const annotation = typeof reference === 'string' ? corpus.allAnnotationsMap[reference] : corpus.allAnnotatedFieldsMap[reference.annotatedFieldId]?.annotations[reference.id];
		if (!annotation) {
			const target = typeof reference === 'string' ? reference : `${reference.annotatedFieldId}:${reference.id}`;
			throw new Error(`Cannot create annotation field for unknown corpus annotation '${target}'.`);
		}
		return annotation;
	}

	function resolveMetadataField(fieldId: string): NormalizedMetadataField {
		const field = corpus.allMetadataFieldsMap[fieldId];
		if (!field) throw new Error(`Cannot create metadata field for unknown corpus field '${fieldId}'.`);
		return field;
	}

	function resolveSemanticField(field: SearchFormMetadataReference) {
		return typeof field === 'string' ? (corpus.allMetadataFieldsMap[field] ?? { id: field }) : field;
	}

	function semanticFieldId(field: SearchFormMetadataReference) {
		return typeof field === 'string' ? field : field.id;
	}

	function annotationCommon(annotation: NormalizedAnnotation, options: SearchFormNodeOptions) {
		return {
			description: () => translate.$tAnnotDescription(annotation),
			displayName: () => translate.$tAnnotDisplayName(annotation),
			groupId: options.groupId,
			showLabel: options.showLabel,
			textDirection: annotation.isMainAnnotation ? corpus.textDirection : undefined,
			variant: options.variant,
		};
	}

	function metadataCommon(field: SearchFormMetadataReference, options: SearchFormNodeOptions) {
		const semanticField = resolveSemanticField(field);
		return {
			description: () => translate.$tMetaDescription(semanticField),
			displayName: () => translate.$tMetaDisplayName(semanticField),
			groupId: options.groupId,
			showLabel: options.showLabel,
			textDirection: corpus.textDirection,
			variant: options.variant,
		};
	}

	function withinCommon(attribute: SearchFormWithinTarget, options: SearchFormNodeOptions) {
		return {
			description: () => translate.$tMetaDescription(attribute),
			displayName: () => translate.$tWithinAttributeDisplayName(attribute.elementName, attribute.attributeName, attribute.defaultDisplayName || attribute.id),
			groupId: options.groupId,
			elementName: attribute.elementName,
			attributeName: attribute.attributeName,
			showLabel: options.showLabel,
			textDirection: corpus.textDirection,
			variant: options.variant,
		};
	}

	const nodes: SearchFormNodeConstructorImplementations = {
		annotation(reference, options) {
			const annotation = resolveAnnotation(reference);
			const target: SearchFormAnnotationReference = { id: annotation.id, annotatedFieldId: annotation.annotatedFieldId };
			const configuredControl = customizations.searchFormAnnotationControl(annotation.id, annotation.annotatedFieldId) ?? customizations.searchFormAnnotationControl(annotation.id);
			if (configuredControl === 'text') return nodes.annotationText(target, options);
			if (configuredControl === 'autocomplete') return nodes.annotationAutocomplete(target, options);
			if (configuredControl === 'select') return nodes.annotationSelect(target, options);
			if (configuredControl === 'lexicon') return nodes.annotationLexicon(target, options);
			if (configuredControl === 'pos') {
				if (tagset) return nodes.annotationPos(target, options);
				debugLog('form-setup', 'No tagset provided for configured POS field. Falling back to autocomplete.', { annotation, corpus });
				return nodes.annotationAutocomplete(target, options);
			}
			if (annotation.uiType === 'pos') {
				if (tagset) return nodes.annotationPos(target, options);
				debugLog('form-setup', 'No tagset provided for POS field, but annotation requires it. Falling back to autocomplete.', { annotation, corpus });
				return nodes.annotationAutocomplete(target, options);
			}
			if (annotation.uiType === 'select' || annotation.uiType === 'combobox') {
				return annotation.values?.length ? nodes.annotationSelect(target, options) : nodes.annotationAutocomplete(target, options);
			}
			if (annotation.uiType === 'lexicon') return nodes.annotationLexicon(target, options);
			return nodes.annotationText(target, options);
		},

		annotationText(reference, options) {
			const annotation = resolveAnnotation(reference);
			return createFormFieldNode(options.id, annotationTextController, TextField, {
				...annotationCommon(annotation, options),
				annotationId: annotation.id,
				caseSensitive: annotation.caseSensitive,
			});
		},

		annotationAutocomplete(reference, options) {
			const annotation = resolveAnnotation(reference);
			return createFormFieldNode(options.id, annotationTextController, TextField, {
				...annotationCommon(annotation, options),
				annotationId: annotation.id,
				autocomplete: (term: string) => blacklabApi.getTermAutocomplete(corpus.id, annotation.annotatedFieldId, annotation.id, term),
				caseSensitive: annotation.caseSensitive,
			});
		},

		annotationSelect(reference, options) {
			const annotation = resolveAnnotation(reference);
			return createFormFieldNode(options.id, annotationSelectController, SelectField, {
				...annotationCommon(annotation, options),
				annotationId: annotation.id,
				multiple: true,
				options: options.options ?? annotation.values ?? [],
			});
		},

		annotationPos(reference, options) {
			const annotation = resolveAnnotation(reference);
			if (!tagset) throw new Error(`Cannot create POS annotation field '${annotation.id}' without a tagset.`);
			return createFormFieldNode(options.id, annotationPosController, AnnotationPosField, {
				...annotationCommon(annotation, options),
				annotationId: annotation.id,
				subAnnotationLabels: Object.fromEntries(
					[...new Set([...(annotation.subAnnotations ?? []), ...Object.keys(tagset.subAnnotations)])].map(subAnnotationId => {
						const corpusAnnotation = corpus.allAnnotatedFieldsMap[annotation.annotatedFieldId]?.annotations[subAnnotationId];
						return [
							subAnnotationId,
							() => translate.$tAnnotDisplayName(corpusAnnotation ?? { id: subAnnotationId, defaultDisplayName: tagset.subAnnotations[subAnnotationId]?.displayName ?? subAnnotationId }),
						];
					}),
				),
				tagset,
			});
		},

		annotationLexicon(reference, options) {
			const annotation = resolveAnnotation(reference);
			return createFormFieldNode(options.id, annotationTextController, LexiconField, {
				...annotationCommon(annotation, options),
				annotationId: annotation.id,
				lookup: createLexiconLookup({
					database: customizations.searchFormLexiconDatabase(),
					getTermFrequencies: async values => {
						const response = await blacklabApi.getTermFrequencies(corpus.id, annotation.id, values);
						return response.termFreq;
					},
				}),
			});
		},

		metadata(fieldId, options) {
			const field = resolveMetadataField(fieldId);
			if (field.values?.length) {
				const choiceOptions = { ...options, options: field.values };
				if (field.uiType === 'checkbox') return nodes.metadataCheckbox(field, choiceOptions);
				if (field.uiType === 'radio') return nodes.metadataRadio(field, choiceOptions);
				if (field.uiType === 'select' || field.uiType === 'combobox') return nodes.metadataSelect(field, choiceOptions);
			}
			if (field.uiType === 'date') return nodes.metadataDate(field, options);
			if (field.uiType === 'range') return nodes.metadataRange(field, options);
			return field.uiType === 'text' ? nodes.metadataText(field, options) : nodes.metadataAutocomplete(field, options);
		},

		metadataText(field, options) {
			return createFormFieldNode(options.id, filterTextController, TextField, {
				...metadataCommon(field, options),
				metadataFieldId: options.metadataFieldId ?? semanticFieldId(field),
			});
		},

		metadataAutocomplete(field, options) {
			const metadataFieldId = options.metadataFieldId ?? semanticFieldId(field);
			return createFormFieldNode(options.id, filterTextController, TextField, {
				...metadataCommon(field, options),
				autocomplete: (term: string) => blacklabApi.getMetadataAutocomplete(corpus.id, metadataFieldId, term),
				metadataFieldId,
			});
		},

		metadataSelect(field, options) {
			return createFormFieldNode(options.id, filterSelectController, SelectField, {
				...metadataCommon(field, options),
				metadataFieldId: options.metadataFieldId ?? semanticFieldId(field),
				multiple: true,
				options: options.options ?? [],
			});
		},

		metadataCheckbox(field, options) {
			return createFormFieldNode(options.id, filterCheckboxController, CheckboxField, {
				...metadataCommon(field, options),
				metadataFieldId: options.metadataFieldId ?? semanticFieldId(field),
				options: options.options ?? [],
			});
		},

		metadataRadio(field, options) {
			return createFormFieldNode(options.id, filterRadioController, RadioField, {
				...metadataCommon(field, options),
				metadataFieldId: options.metadataFieldId ?? semanticFieldId(field),
				options: options.options ?? [],
			});
		},

		metadataRange(field, options) {
			return createFormFieldNode(options.id, filterRangeController, RangeField, {
				...metadataCommon(field, options),
				highPlaceholder: options.highPlaceholder,
				inputType: options.inputType ?? 'number',
				lowPlaceholder: options.lowPlaceholder,
				metadataFieldId: options.metadataFieldId ?? semanticFieldId(field),
				mode: options.mode,
				modeOptions,
				showMode: options.showMode,
			});
		},

		metadataDate(field, options) {
			return createFormFieldNode(options.id, filterDateController, DateField, {
				...metadataCommon(field, options),
				max: options.max,
				metadataFieldId: options.metadataFieldId ?? semanticFieldId(field),
				min: options.min,
				mode: options.mode,
				modeOptions,
				range: options.range ?? true,
			});
		},

		metadataMultiFieldRange(field, options) {
			return createFormFieldNode(options.id, filterRangeController, RangeField, {
				...metadataCommon(field, options),
				fromField: options.fromField,
				highPlaceholder: options.highPlaceholder,
				inputType: options.inputType ?? 'number',
				lowPlaceholder: options.lowPlaceholder,
				mode: options.mode,
				modeOptions,
				showMode: options.showMode ?? true,
				toField: options.toField,
			});
		},

		metadataMultiFieldDate(field, options) {
			return createFormFieldNode(options.id, filterDateController, DateField, {
				...metadataCommon(field, options),
				fromField: options.fromField,
				max: options.max,
				min: options.min,
				mode: options.mode ?? undefined,
				modeOptions,
				range: options.range ?? true,
				toField: options.toField,
			});
		},

		withinAttribute(attribute, options) {
			const { control, ...nodeOptions } = options;
			if (typeof control === 'object') return nodes.withinSelect(attribute, { ...nodeOptions, options: control.options });
			if (control === 'range') return nodes.withinRange(attribute, nodeOptions);
			return nodes.withinText(attribute, nodeOptions);
		},

		withinText(attribute, options) {
			return createFormFieldNode(options.id, withinAttributeTextController, TextField, withinCommon(attribute, options));
		},

		withinSelect(attribute, options) {
			return createFormFieldNode(options.id, withinAttributeSelectController, SelectField, {
				...withinCommon(attribute, options),
				multiple: true,
				options: options.options ?? [],
			});
		},

		withinRange(attribute, options) {
			return createFormFieldNode(options.id, withinAttributeRangeController, RangeField, {
				...withinCommon(attribute, options),
				highPlaceholder: options.highPlaceholder,
				inputType: options.inputType ?? 'text',
				lowPlaceholder: options.lowPlaceholder,
				mode: options.mode,
				modeOptions,
				showMode: options.showMode,
			});
		},
	};

	return nodes;
}
