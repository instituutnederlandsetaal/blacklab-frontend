import type { Corpus } from '@/app/state/useCorpusContext';
import {
	AnnotationPosField,
	CheckboxField,
	DateField,
	LexiconField,
	ParallelField,
	QueryBuilderField,
	RadioField,
	RangeField,
	RawCqlField,
	SelectField,
	TextField,
	TokenSequenceField,
	WithinField,
	annotationPosController,
	annotationSelectController,
	annotationTextController,
	createFormFieldNode,
	createRangeModeOptions,
	expertQueryController,
	filterCheckboxController,
	filterDateController,
	filterRadioController,
	filterRangeController,
	filterSelectController,
	filterTextController,
	frequencyAnnotationController,
	ngramGroupAnnotationController,
	parallelController,
	parallelSourceController,
	queryBuilderController,
	resultGroupByController,
	resultGroupDisplayModeController,
	tokenSequenceController,
	withinController,
	withinAttributeRangeController,
	withinAttributeSelectController,
	withinAttributeTextController,
	type BaseFieldNode,
	type DateValue,
	type FormFieldNode,
	type FormValue,
	type RangeMode,
	type TokenSequenceCreateField,
} from '@/features/form';
import { createLexiconLookup } from '@/features/form/fields/generic/lexicon-field';
import type { WithinFieldOption } from '@/features/form/fields/within-field';
import type { SearchFormConfiguration } from '@/features/search/model/search-form-configuration';
import type { SearchFormWithinControl } from '@/features/search/model/search-form-customization';
import { createQueryBuilderOptions } from '@/pages/search/model/query-builder-options';
import type { NormalizedAnnotation, NormalizedMetadataField, Tagset } from '@/types/apptypes';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { debugLog } from '@/shared/debug/debug';
import type { Translate } from '@/shared/i18n';
import type { Option, Options, OptionText } from '@/shared/utils/options';

const EXPLORE_NGRAM_MAX_SIZE = 5;

/** A corpus annotation, disambiguated by annotated field where necessary. */
export type SearchFormAnnotationReference = string | { id: string; annotatedFieldId: string };

/** A metadata target ID, optionally accompanied by custom fallback copy. */
export type SearchFormMetadataReference =
	| string
	| {
			id: string;
			defaultDisplayName?: string;
			defaultDescription?: string;
	  };

/**
 * The deliberately small contract shared by detached semantic node constructors.
 *
 * `id` is required because these methods return graph nodes. The other fields are
 * stable search-form semantics, not form-engine construction options. In
 * particular, do not extend this from `FormFieldNodeOptions`: fields such as
 * `inheritedVariant` belong to private composite-field construction.
 */
export type SearchFormNodeOptions<ControlOptions extends object = object> = {
	id: string;
	groupId?: string;
	variant?: BaseFieldNode['variant'];
	showLabel?: boolean;
} & ControlOptions;

export type SearchFormWithinTarget = {
	id: string;
	elementName: string;
	attributeName: string;
	defaultDisplayName?: string;
	defaultDescription?: string;
};

type NgramGroupAnnotationNodeOptions = SearchFormNodeOptions<{
	annotationLabels: Readonly<Record<string, OptionText>>;
	defaultAnnotationId: string | null;
	options: Options;
}>;

type NgramTokenSequenceNodeOptions = SearchFormNodeOptions<{
	defaultFieldId: string;
	defaultLength?: number;
	maxLength?: number;
	minLength?: number;
	selectorOptions: Options;
}>;

type FrequencyAnnotationNodeOptions = SearchFormNodeOptions<{
	annotationLabels: Readonly<Record<string, OptionText>>;
	defaultAnnotationId: string | null;
	options: Options;
}>;

type ParallelQueryNodeOptions = SearchFormNodeOptions<{
	childFieldTemplate: FormFieldNode;
}>;

type ExploreCorporaGroupByNodeOptions = SearchFormNodeOptions<{
	defaultValue: string | null;
	options: Options;
}>;

type ExploreParallelMode = 'frequency' | 'ngram';

/**
 * Reusable, corpus-aware constructors for detached search-form nodes.
 *
 * This contract is deliberately narrower than everything needed to build our
 * own search form. It is the candidate advanced public `api.nodes` surface, so
 * additions here are potential long-term API commitments. Keep built-in page
 * composition and mode-specific plumbing in `BuiltInBlueprintNodeConstructors`.
 * Higher-level customization operations should resolve placement and delegate
 * here rather than reuse these low-level options as their own API.
 */
export type SearchFormNodeConstructors = {
	/** Select the corpus-configured annotation control. */
	annotation(annotation: SearchFormAnnotationReference, options: SearchFormNodeOptions): FormFieldNode;
	annotationText(annotation: SearchFormAnnotationReference, options: SearchFormNodeOptions): FormFieldNode;
	annotationAutocomplete(annotation: SearchFormAnnotationReference, options: SearchFormNodeOptions): FormFieldNode;
	annotationSelect(annotation: SearchFormAnnotationReference, options: SearchFormNodeOptions<{ options?: Options }>): FormFieldNode;
	annotationPos(annotation: SearchFormAnnotationReference, options: SearchFormNodeOptions): FormFieldNode;
	annotationLexicon(annotation: SearchFormAnnotationReference, options: SearchFormNodeOptions): FormFieldNode;

	/** Select the corpus-configured metadata control. */
	metadata(fieldId: string, options: SearchFormNodeOptions): FormFieldNode;
	metadataText(field: SearchFormMetadataReference, options: SearchFormNodeOptions<{ metadataFieldId?: string }>): FormFieldNode;
	metadataAutocomplete(field: SearchFormMetadataReference, options: SearchFormNodeOptions<{ metadataFieldId?: string }>): FormFieldNode;
	metadataSelect(field: SearchFormMetadataReference, options: SearchFormNodeOptions<{ metadataFieldId?: string; options?: Options }>): FormFieldNode;
	metadataCheckbox(field: SearchFormMetadataReference, options: SearchFormNodeOptions<{ metadataFieldId?: string; options?: Option[] }>): FormFieldNode;
	metadataRadio(field: SearchFormMetadataReference, options: SearchFormNodeOptions<{ metadataFieldId?: string; options?: Option[] }>): FormFieldNode;
	metadataRange(
		field: SearchFormMetadataReference,
		options: SearchFormNodeOptions<{
			metadataFieldId?: string;
			inputType?: 'text' | 'number';
			lowPlaceholder?: FormValue<string>;
			highPlaceholder?: FormValue<string>;
			mode?: RangeMode | null;
			showMode?: boolean;
		}>,
	): FormFieldNode;
	metadataDate(
		field: SearchFormMetadataReference,
		options: SearchFormNodeOptions<{ metadataFieldId?: string; min?: string | Date | DateValue; max?: string | Date | DateValue; mode?: RangeMode; range?: boolean }>,
	): FormFieldNode;
	metadataMultiFieldRange(
		field: SearchFormMetadataReference,
		options: SearchFormNodeOptions<{
			fromField: string;
			toField: string;
			inputType?: 'text' | 'number';
			lowPlaceholder?: FormValue<string>;
			highPlaceholder?: FormValue<string>;
			mode?: RangeMode | null;
			showMode?: boolean;
		}>,
	): FormFieldNode;
	metadataMultiFieldDate(
		field: SearchFormMetadataReference,
		options: SearchFormNodeOptions<{
			fromField: string;
			toField: string;
			min?: string | Date | DateValue;
			max?: string | Date | DateValue;
			mode?: RangeMode;
			range?: boolean;
		}>,
	): FormFieldNode;

	/** Select the configured within-attribute control. */
	withinAttribute(attribute: SearchFormWithinTarget, options: SearchFormNodeOptions<{ control: SearchFormWithinControl }>): FormFieldNode;
	withinText(attribute: SearchFormWithinTarget, options: SearchFormNodeOptions): FormFieldNode;
	withinSelect(attribute: SearchFormWithinTarget, options: SearchFormNodeOptions<{ options?: Options }>): FormFieldNode;
	withinRange(
		attribute: SearchFormWithinTarget,
		options: SearchFormNodeOptions<{
			inputType?: 'text' | 'number';
			lowPlaceholder?: FormValue<string>;
			highPlaceholder?: FormValue<string>;
			mode?: RangeMode | null;
			showMode?: boolean;
		}>,
	): FormFieldNode;
};

/**
 * Constructors used only while assembling the application's built-in form
 * blueprint. They share the implementation closure with the reusable node
 * constructors, but they are not a second public abstraction layer.
 *
 * These methods expose current layout decisions and preprocessed builder data
 * (for example child templates and Explore-specific options). Keep this type
 * private so those implementation details do not accidentally become part of
 * the customization contract.
 */
type BuiltInBlueprintNodeConstructors = {
	ngramGroupAnnotation(options: NgramGroupAnnotationNodeOptions): FormFieldNode;
	ngramTokens(options: NgramTokenSequenceNodeOptions): FormFieldNode;
	frequencyAnnotation(options: FrequencyAnnotationNodeOptions): FormFieldNode;
	exploreCorporaGroupBy(options: ExploreCorporaGroupByNodeOptions): FormFieldNode;
	exploreCorporaGroupDisplayMode(options: SearchFormNodeOptions): FormFieldNode;
	exploreParallelSource(mode: ExploreParallelMode, options: SearchFormNodeOptions): FormFieldNode | null;
	within(options: SearchFormNodeOptions): FormFieldNode | null;
	queryBuilder(options: SearchFormNodeOptions): FormFieldNode;
	expertQuery(options: SearchFormNodeOptions): FormFieldNode;
	parallelQuery(options: ParallelQueryNodeOptions): FormFieldNode;
};

export function createSearchFormNodeConstructors({
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
}) {
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

	function optionalPresentation(options: SearchFormNodeOptions) {
		return {
			...(options.groupId === undefined ? {} : { groupId: options.groupId }),
			...(options.showLabel === undefined ? {} : { showLabel: options.showLabel }),
			...(options.variant === undefined ? {} : { variant: options.variant }),
		};
	}

	const nodes: SearchFormNodeConstructors = {
		annotation(reference, options) {
			const annotation = resolveAnnotation(reference);
			const target: SearchFormAnnotationReference = { id: annotation.id, annotatedFieldId: annotation.annotatedFieldId };
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
					database: configuration.lexiconDatabase,
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

	const blueprint: BuiltInBlueprintNodeConstructors = {
		within(options) {
			const spans = corpus.relations?.spans;
			if (!configuration.within.enabled || !spans || !Object.keys(spans).length) return null;

			const includeElement = configuration.customization.within.includeElement ?? (() => true);
			const includeAttribute = configuration.customization.within.includeAttribute ?? (() => false);
			const configuredElements = configuration.within.elements.filter(option => !option.value || (spans[option.value] && includeElement(option.value)));
			const elements = configuredElements.length
				? configuredElements
				: Object.keys(spans)
						.filter(includeElement)
						.map(value => ({ value, label: value }));
			if (!elements.some(element => !element.value)) elements.unshift({ value: '', label: '' });
			const withinOptions = elements.map<WithinFieldOption>(option => ({
				...option,
				label: () => translate.$tWithinElementDisplayName(option),
				attributes: option.value
					? Object.keys(spans[option.value]?.attributes ?? {})
							.filter(attribute => includeAttribute(option.value, attribute))
							.map(attribute => ({
								value: attribute,
								label: () => translate.$tWithinAttributeDisplayName(option.value, attribute),
							}))
					: [],
			}));

			return createFormFieldNode(options.id, withinController, WithinField, {
				options: withinOptions,
				sortOptions: !configuredElements.length,
				variant: options.variant ?? 'horizontal',
			});
		},

		ngramGroupAnnotation(options) {
			return createFormFieldNode(options.id, ngramGroupAnnotationController, SelectField, {
				// ...optionalPresentation(options),
				annotationLabels: options.annotationLabels,
				defaultAnnotationId: options.defaultAnnotationId,
				displayName: () => translate.$t('explore.ngram.ngramType'),
				hideEmpty: true,
				html: true,
				options: options.options,
				persistKey: 'explore-ngram-group-by',
			});
		},

		ngramTokens(options) {
			return createFormFieldNode(options.id, tokenSequenceController, TokenSequenceField, {
				...optionalPresentation(options),
				createField: (fieldOptions: Parameters<TokenSequenceCreateField>[0]) => {
					const annotation = corpus.allAnnotationsMap[fieldOptions.annotationId];
					if (!annotation) throw new Error(`Cannot create n-gram token field for unknown annotation '${fieldOptions.annotationId}'.`);
					return nodes.annotation({ id: annotation.id, annotatedFieldId: annotation.annotatedFieldId }, { id: fieldOptions.id, showLabel: false, variant: 'simple' });
				},
				defaultFieldId: options.defaultFieldId,
				defaultLength: options.defaultLength ?? EXPLORE_NGRAM_MAX_SIZE,
				lengthDisplayName: () => translate.$t('explore.ngram.ngramSize'),
				maxLength: options.maxLength ?? EXPLORE_NGRAM_MAX_SIZE,
				minLength: options.minLength ?? 1,
				persistKey: 'explore-ngram-tokens',
				selectorDisplayName: () => translate.$t('results.table.property'),
				selectorOptions: options.selectorOptions,
				selectorPlaceholder: () => translate.$t('results.table.property'),
			});
		},

		frequencyAnnotation(options) {
			return createFormFieldNode(options.id, frequencyAnnotationController, SelectField, {
				...optionalPresentation(options),
				annotationLabels: options.annotationLabels,
				defaultAnnotationId: options.defaultAnnotationId,
				displayName: () => translate.$t('explore.frequency.frequencyType'),
				hideEmpty: true,
				html: true,
				options: options.options,
				persistKey: 'explore-frequency-annotation',
			});
		},

		exploreCorporaGroupBy(options) {
			return createFormFieldNode(options.id, resultGroupByController, SelectField, {
				defaultValue: options.defaultValue,
				displayName: () => translate.$t('explore.corpora.groupBy'),
				hideEmpty: true,
				html: true,
				options: options.options,
				persistKey: 'explore-corpora-group-by',
				variant: options.variant ?? 'horizontal',
			});
		},

		exploreCorporaGroupDisplayMode(options) {
			return createFormFieldNode(options.id, resultGroupDisplayModeController, SelectField, {
				defaultValue: 'table',
				displayName: () => translate.$t('explore.corpora.showAs.heading'),
				hideEmpty: true,
				html: true,
				options: [
					{ value: 'table', label: () => translate.$t('explore.corpora.showAs.table') },
					{ value: 'docs', label: () => translate.$t('explore.corpora.showAs.docs') },
					{ value: 'tokens', label: () => translate.$t('explore.corpora.showAs.tokens') },
				],
				persistKey: 'explore-corpora-group-display-mode',
				variant: options.variant ?? 'horizontal',
			});
		},

		exploreParallelSource(mode, options) {
			if (!corpus.isParallelCorpus) return null;
			return createFormFieldNode(options.id, parallelSourceController, SelectField, {
				defaultSource: corpus.parallelAnnotatedFields[0]?.id ?? null,
				displayName: () => translate.$t('search.parallel.searchSourceVersion'),
				hideEmpty: true,
				html: true,
				options: corpus.parallelAnnotatedFields.map(field => ({
					value: field.id,
					label: () => translate.$tAnnotatedFieldDisplayName(field),
				})),
				persistKey: `explore-${mode}-source`,
				variant: options.variant ?? (mode === 'ngram' ? 'horizontal' : undefined),
			});
		},

		queryBuilder(options) {
			return createFormFieldNode(options.id, queryBuilderController, QueryBuilderField, {
				...optionalPresentation(options),
				options: createQueryBuilderOptions({ blacklabApi, configuration, corpus, translate }),
			});
		},

		expertQuery(options) {
			return createFormFieldNode(options.id, expertQueryController, RawCqlField, {
				...optionalPresentation(options),
				hideLabel: true,
			});
		},

		parallelQuery(options) {
			return createFormFieldNode(options.id, parallelController, ParallelField, {
				...optionalPresentation(options),
				alignByOptions: configuration.alignBy.enabled
					? configuration.alignBy.elements.map(option => ({
							...option,
							label: () => translate.$tAlignByDisplayName(option),
						}))
					: [],
				childFieldTemplate: options.childFieldTemplate,
				defaultAlignBy: configuration.alignBy.defaultValue || null,
				defaultSource: corpus.parallelAnnotatedFields[0]?.id ?? null,
				fieldOptions: corpus.parallelAnnotatedFields.map(field => ({
					...field,
					label: () => translate.$tAnnotatedFieldDisplayName(field),
				})),
			});
		},
	};
	// The namespaces express API stability, not different construction
	// mechanisms: both collections create the same FormFieldNode type and share
	// the dependencies captured above. Only `nodes` is intended for eventual
	// exposure; `blueprint` remains an implementation detail of the builder.
	return { blueprint, nodes };
}
