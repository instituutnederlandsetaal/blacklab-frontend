import { computed, shallowRef, watch, type ObjectPlugin, type Ref, type ShallowRef } from 'vue';

import type { Corpus } from '@/app/state/useCorpusContext';
import {
	annotationPosController,
	annotationSelectController,
	annotationTextController,
	DateField,
	expertQueryController,
	filterCheckboxController,
	filterDateController,
	filterRadioController,
	filterRangeController,
	filterSelectController,
	filterTextController,
	FormBuilder,
	FormRuntime,
	parallelController,
	type BaseFieldNode,
	type ParallelChildFieldConfig,
	RangeField,
	resultGroupByController,
	resultGroupDisplayModeController,
	type FormFieldNode,
	withinController,
	queryBuilderController,
	QueryBuilderField,
	RawCqlField,
} from '@/features/form';
import { createLexiconLookup } from '@/features/form/fields/generic/lexicon-field';
import type { WithinFieldOption } from '@/features/form/model/controllers/within-controller';
import type { ModuleRootState as ExploreFormState } from '@/features/search/model/form/explore-state';
import type { PatternMode } from '@/features/search/model/form/pattern-state';
import type { SearchFormConfiguration } from '@/features/search/model/search-form-configuration';
import { createSearchFormTotalsFactory } from '@/features/search/model/search-form-totals';
import { createQueryBuilderOptions } from '@/pages/search/model/query-builder-options';
import type { NormalizedAnnotation, NormalizedMetadataField, Tagset } from '@/types/apptypes';
import { corpusCustomizations } from '@/utils/customization';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { getMetadataSubset } from '@/shared/blacklab-helpers/field-groups';
import debug, { debugLog } from '@/shared/debug/debug';
import type { Translate } from '@/shared/i18n';
import { optionValues, type Options } from '@/shared/utils/options';
import useInjectable from '@/shared/utils/useInjectable';

import AnnotationPosField from '@/features/form/fields/AnnotationPosField.vue';
import CheckboxField from '@/features/form/fields/generic/CheckboxField.vue';
import LexiconField from '@/features/form/fields/generic/LexiconField.vue';
import RadioField from '@/features/form/fields/generic/RadioField.vue';
import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';
import ParallelField from '@/features/form/fields/ParallelField.vue';
import WithinField from '@/features/form/fields/WithinField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import HeadingView from '@/features/form/views/HeadingView.vue';
import SummaryView from '@/features/form/views/SummaryView.vue';

// TODO integration customization.ts callback functions

const SEARCH_FORM_ID_PREFIX = 'search.';
const EXPLORE_FORM_ID_PREFIX = 'explore.';
const SIMPLE_SEARCH_VARIANT: NonNullable<BaseFieldNode['variant']> = ['large', 'simple'];

type CreateSearchFormSystemOptions = {
	blacklabApi: BlackLabApi;
	configuration: Ref<SearchFormConfiguration>;
	corpus: Ref<Corpus | undefined>;
	tagset: Ref<Tagset | undefined>;
	translate: Translate;
};

type BuildContext = {
	blacklabApi: BlackLabApi;
	builder: FormBuilder;
	configuration: SearchFormConfiguration;
	corpus: Corpus;
	tagset: Tagset | undefined;
	translate: Translate;
};

const [_searchFormSystemKey, provideSearchFormSystem, useSearchFormSystem] = useInjectable<Readonly<Ref<FormRuntime | null>>>('searchFormSystem');

function toSafeHtmlId(value: string): string {
	return value.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'group';
}

function createAnnotationFieldConfig({ corpus, translate }: BuildContext, annotation: NormalizedAnnotation, variant?: BaseFieldNode['variant'], groupId?: string) {
	return {
		description: () => translate.$tAnnotDescription(annotation),
		displayName: () => translate.$tAnnotDisplayName(annotation),
		groupId,
		textDirection: annotation.isMainAnnotation ? corpus.textDirection : undefined,
		variant,
	};
}

function createAnnotationTextFieldConfig(context: BuildContext, annotation: NormalizedAnnotation, variant?: BaseFieldNode['variant'], groupId?: string) {
	const { blacklabApi, corpus } = context;
	return {
		...createAnnotationFieldConfig(context, annotation, variant, groupId),
		annotationId: annotation.id,
		autocomplete: annotation.uiType !== 'text' ? (term: string) => blacklabApi.getTermAutocomplete(corpus.id, annotation.annotatedFieldId, annotation.id, term) : undefined,
		caseSensitive: annotation.caseSensitive,
	};
}

function createAnnotationField(context: BuildContext, nodeId: string, annotation: NormalizedAnnotation, groupId?: string, variant?: BaseFieldNode['variant']): FormFieldNode {
	const { blacklabApi, builder, configuration, corpus, tagset } = context;
	const common = createAnnotationFieldConfig(context, annotation, variant, groupId);
	const textField = () => builder.newField(nodeId, annotationTextController, TextField, createAnnotationTextFieldConfig(context, annotation, variant, groupId));

	if (annotation.uiType === 'pos') {
		if (!tagset) {
			debugLog('form-setup', 'No tagset provided for POS field, but annotation requires it. Falling back to autocomplete.', { annotation, corpus });
			return textField();
		}

		return builder.newField(nodeId, annotationPosController, AnnotationPosField, {
			annotation,
			groupId,
			showQueryPreview: true,
			subAnnotations: Object.fromEntries(
				(annotation.subAnnotations ?? [])
					.map(subAnnotationId => [subAnnotationId, corpus.allAnnotatedFieldsMap[annotation.annotatedFieldId]?.annotations[subAnnotationId]])
					.filter((entry): entry is [string, NormalizedAnnotation] => !!entry[1]),
			),
			tagset,
			variant,
		});
	}
	if (annotation.uiType === 'select' || annotation.uiType === 'combobox') {
		if (!annotation.values?.length) return textField();
		return builder.newField(nodeId, annotationSelectController, SelectField, {
			...common,
			annotationId: annotation.id,
			multiple: true,
			options: annotation.values,
		});
	}
	if (annotation.uiType === 'lexicon') {
		return builder.newField(nodeId, annotationTextController, LexiconField, {
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
	return textField();
}

function createWithinField({ builder, configuration, corpus }: BuildContext): FormFieldNode | null {
	const spans = corpus.relations?.spans;
	if (!configuration.within.enabled || !spans || !Object.keys(spans).length) return null;

	// TODO use customization within.includeSpan. Null or true signifies include, false signifies exclude. If no customization is provided, include all spans.
	const configuredElements = configuration.within.elements.filter(option => !option.value || spans[option.value]);
	const elements = configuredElements.length ? configuredElements : Object.keys(spans).map(value => ({ value, label: value }));
	if (!elements.some(e => !e.value)) elements.unshift({ value: '', label: '' });
	const options = elements.map<WithinFieldOption>(option => ({
		...option,
		// TODO customization within.includeAttribute
		attributes: option.value
			? Object.keys(spans[option.value]?.attributes ?? {}).map(attribute => ({
					value: attribute,
					label: attribute,
				}))
			: [],
	}));

	return builder.newField('shared.within', withinController, WithinField, {
		options,
		sortOptions: !configuredElements.length,
	});
}

function createFilterField({ blacklabApi, builder, corpus, translate }: BuildContext, nodeId: string, field: NormalizedMetadataField, groupId?: string): FormFieldNode {
	const common = {
		description: () => translate.$tMetaDescription(field),
		displayName: () => translate.$tMetaDisplayName(field),
		groupId,
		metadataFieldId: field.id,
		textDirection: corpus.textDirection,
	};

	if (field.values?.length) {
		const options = { ...common, options: field.values };
		if (field.uiType === 'checkbox') return builder.newField(nodeId, filterCheckboxController, CheckboxField, options);
		if (field.uiType === 'radio') return builder.newField(nodeId, filterRadioController, RadioField, options);
		if (field.uiType === 'select' || field.uiType === 'combobox') return builder.newField(nodeId, filterSelectController, SelectField, { ...options, multiple: true });
	}
	if (field.uiType === 'date') {
		return builder.newField(nodeId, filterDateController, DateField, { ...common, range: true });
	}
	if (field.uiType === 'range') return builder.newField(nodeId, filterRangeController, RangeField, { ...common, inputType: 'number' });

	return builder.newField(nodeId, filterTextController, TextField, {
		...common,
		autocomplete: field.uiType !== 'text' ? (term: string) => blacklabApi.getMetadataAutocomplete(corpus.id, field.id, term) : undefined,
	});
}

function createSharedFilters(context: BuildContext): ReturnType<FormBuilder['newContainer']> | null {
	const { blacklabApi, builder, configuration, corpus, translate } = context;
	const filterIds = configuration.metadataFieldIds;
	const groups = corpus.metadataGroups
		.map(group => ({
			fields: group.fields.filter((field): field is NormalizedMetadataField => !!field && filterIds.includes(field.id)),
			group,
		}))
		.filter(({ fields }) => fields.length);

	if (!groups.length) return null;

	const tabs = builder.newContainer('shared.filters', ContainerRenderer, {
		variant: ['tabs', 'tab-badges'],
	});

	for (const { fields, group } of groups) {
		const tab = builder.newContainer(`${tabs.id}.${toSafeHtmlId(group.id)}`, ContainerRenderer, {
			title: () => translate.$tMetaGroupName(group) || group.id,
		});
		for (const field of fields) {
			const nodeId = `${tab.id}.${toSafeHtmlId(field.id)}`;
			const node = builder.getField(nodeId) ?? createFilterField(context, nodeId, field, group.id);
			tab.addChildren(node);
		}
		tabs.addChildren(tab);
	}

	return builder.newContainer('shared.filters.wrapper', ContainerRenderer, {}).addChildren(
		builder.newView('shared.filters.heading', HeadingView, { title: () => translate.$t('filter.heading') }),
		tabs,
		builder.newView('shared.filters.summary', SummaryView, {
			createTotals: createSearchFormTotalsFactory(corpus, blacklabApi),
			summaryType: 'filter',
		}),
	);
}

function createExploreCorporaForm({ builder, configuration, corpus, translate }: BuildContext, sharedFilters: ReturnType<FormBuilder['newContainer']> | null): void {
	const options: Options = getMetadataSubset(
		configuration.explore.corpora.groupMetadataIds,
		corpus.metadataGroups,
		corpus.allMetadataFieldsMap,
		'Group',
		translate,
		debug.value,
		configuration.explore.corpora.metadataGroupLabelsVisible,
		id => corpusCustomizations.search.metadata.showField(id),
	)
		.map(group => ({
			...group,
			options: group.options.map(option => (typeof option === 'string' ? `field:${option}` : { ...option, value: `field:${option.value}` })),
		}))
		.filter(group => group.options.length);
	const availableGroupByValues = optionValues(options);
	const configuredDefault = configuration.explore.corpora.defaultGroupMetadataId ? `field:${configuration.explore.corpora.defaultGroupMetadataId}` : null;
	const defaultGroupBy = configuredDefault && availableGroupByValues.includes(configuredDefault) ? configuredDefault : (availableGroupByValues[0] ?? null);
	const groupByField = builder.newField('explore.corpora.group-by', resultGroupByController, SelectField, {
		displayName: () => translate.$t('explore.corpora.groupBy'),
		options,
		defaultValue: defaultGroupBy,
		html: true,
		hideEmpty: true,
		persistKey: 'explore-corpora-group-by',
	});
	const groupDisplayModeField = builder.newField('explore.corpora.group-display-mode', resultGroupDisplayModeController, SelectField, {
		displayName: () => translate.$t('explore.corpora.showAs.heading'),
		options: [
			{ value: 'table', label: translate.$t('explore.corpora.showAs.table').toString() },
			{ value: 'docs', label: translate.$t('explore.corpora.showAs.docs').toString() },
			{ value: 'tokens', label: translate.$t('explore.corpora.showAs.tokens').toString() },
		],
		defaultValue: 'table',
		html: true,
		hideEmpty: true,
		persistKey: 'explore-corpora-group-display-mode',
	});
	const resultPresetFields = builder.newContainer('explore.corpora.result-preset', ContainerRenderer, { variant: 'list' }).addChildren(groupByField, groupDisplayModeField);
	const form = builder.newForm(getNewExploreFormId('corpora'), ContainerRenderer, { variant: sharedFilters ? 'columns' : undefined });
	form.addChildren(resultPresetFields, sharedFilters);
}

function createExtendedAnnotationTabs(context: BuildContext): ReturnType<FormBuilder['newContainer']> | null {
	const { builder, configuration, corpus, translate } = context;
	const annotationIds = configuration.extendedAnnotationIds;
	const groups = corpus.annotationGroups
		.filter(group => group.annotatedFieldId === corpus.mainAnnotatedField)
		.map(group => ({
			annotations: group.entries
				.map(annotationId => corpus.allAnnotationsMap[annotationId])
				.filter((annotation): annotation is NormalizedAnnotation => !!annotation && !annotation.isInternal && annotationIds.includes(annotation.id)),
			group,
		}))
		.filter(({ annotations }) => annotations.length);

	if (!groups.length) return null;

	const populateTab = (tab: ReturnType<FormBuilder['newContainer']>, annotations: NormalizedAnnotation[], groupId?: string) => {
		for (const annotation of annotations) {
			const nodeId = `${tab.id}.${toSafeHtmlId(annotation.id)}`;
			const node = builder.getField(nodeId) ?? createAnnotationField(context, nodeId, annotation, groupId);
			tab.addChildren(node);
		}
	};

	if (groups.length === 1) {
		const group = groups[0];
		const single = builder.newContainer('search.extended.annotations', ContainerRenderer, {
			variant: 'list',
		});
		populateTab(single, group.annotations, group.group.id);
		return single;
	}

	const tabs = builder.newContainer('search.extended.annotations', ContainerRenderer, {
		variant: 'tabs',
	});

	for (const { annotations, group } of groups) {
		const tab = builder.newContainer(`${tabs.id}.${toSafeHtmlId(group.id)}`, ContainerRenderer, {
			title: () => translate.$tAnnotGroupName(group),
			variant: 'list',
		});
		populateTab(tab, annotations, group.id);
		tabs.addChildren(tab);
	}

	return tabs;
}

function getSimpleSearchAnnotation(corpus: Corpus, configuration: SearchFormConfiguration): NormalizedAnnotation {
	const simpleAnnotationId = configuration.simpleAnnotationId;
	const annotatedFieldId = corpus.isParallelCorpus ? corpus.parallelAnnotatedFields[0]?.id : corpus.mainAnnotatedField;
	const sourceField = annotatedFieldId ?? corpus.mainAnnotatedField;
	const annotation = corpus.allAnnotatedFieldsMap[sourceField]?.annotations[simpleAnnotationId] || corpus.firstMainAnnotation;
	return {
		...annotation,
		annotatedFieldId: corpus.isParallelCorpus ? '' : sourceField,
	};
}

function createParallelQueryField({ builder, configuration, corpus }: BuildContext, id: string, child: ParallelChildFieldConfig): FormFieldNode {
	return builder.newField(id, parallelController, ParallelField, {
		alignByOptions: configuration.alignBy.enabled ? configuration.alignBy.elements : [],
		defaultAlignBy: configuration.alignBy.defaultValue || null,
		defaultSource: corpus.parallelAnnotatedFields[0]?.id ?? null,
		child,
		fieldOptions: corpus.parallelAnnotatedFields,
	});
}

function createQueryField(context: BuildContext, mode: 'simple' | 'advanced' | 'expert', child: ParallelChildFieldConfig, createRegular?: () => FormFieldNode): FormFieldNode {
	if (context.corpus.isParallelCorpus) return createParallelQueryField(context, `search.${mode}.parallel`, child);
	return createRegular?.() ?? context.builder.newField(`search.${mode}.query`, child.controller, child.component, child.config);
}

function createSearchFormDefinition(corpus: Corpus, tagset: Tagset | undefined, configuration: SearchFormConfiguration, blacklabApi: BlackLabApi, translate: Translate): FormBuilder {
	const builder = new FormBuilder({
		corpus: {
			indexId: corpus.id,
			isParallelCorpus: corpus.isParallelCorpus,
			textDirection: corpus.textDirection,
		},
		translate,
	});
	const context: BuildContext = { blacklabApi, builder, configuration, corpus, tagset, translate };
	const annotation = getSimpleSearchAnnotation(corpus, configuration);
	const sharedWithin = createWithinField(context);
	const sharedFilters = createSharedFilters(context);
	const simpleForm = builder.newForm(getNewSearchFormId('simple'), ContainerRenderer, {
		title: () => translate.$t('search.simple.heading'),
	});

	simpleForm.addChildren(
		createQueryField(
			context,
			'simple',
			{
				id: 'query',
				controller: annotationTextController,
				component: TextField,
				config: createAnnotationTextFieldConfig(context, annotation, SIMPLE_SEARCH_VARIANT),
			},
			() => createAnnotationField(context, 'search.simple.annotation', annotation, undefined, SIMPLE_SEARCH_VARIANT),
		),
	);

	const extendedForm = builder.newForm(getNewSearchFormId('extended'), ContainerRenderer, {
		variant: 'columns',
	});
	extendedForm.addChildren(
		builder.newContainer('search.extended.query.wrapper', ContainerRenderer, { variant: 'list' }).addChildren(createExtendedAnnotationTabs(context), sharedWithin),
		sharedFilters,
	);

	const queryBuilderConfig = {
		options: createQueryBuilderOptions({ api: blacklabApi, configuration, index: corpus, translate }),
	};
	const advancedQuery = createQueryField(context, 'advanced', {
		id: 'query',
		controller: queryBuilderController,
		component: QueryBuilderField,
		config: queryBuilderConfig,
	});
	const advancedForm = builder.newForm(getNewSearchFormId('advanced'), ContainerRenderer, { variant: 'list' });
	advancedForm.addChildren(advancedQuery, sharedWithin, sharedFilters);

	const expertConfig = { hideLabel: true };
	const expertQuery = createQueryField(context, 'expert', {
		id: 'query',
		controller: expertQueryController,
		component: RawCqlField,
		config: expertConfig,
	});
	const expertForm = builder.newForm(getNewSearchFormId('expert'), ContainerRenderer, {
		variant: sharedFilters ? 'columns' : undefined,
	});
	expertForm.addChildren(
		builder.newContainer('search.expert.query.wrapper', ContainerRenderer, { variant: 'list' }).addChildren(
			builder.newView('search.expert.query.heading', HeadingView, {
				help: {
					href: 'https://blacklab.ivdnt.org/guide/corpus-query-language.html',
					title: () => translate.$t('widgets.learnMore'),
				},
				title: () => translate.$t('search.expert.corpusQueryLanguage'),
			}),
			expertQuery,
			sharedWithin,
		),
		sharedFilters,
	);

	createExploreCorporaForm(context, sharedFilters);

	return builder;
}

type SearchFormSystemPlugin = ObjectPlugin & {
	runtime: ShallowRef<FormRuntime | null>;
};

const createSearchFormSystem = (options: CreateSearchFormSystemOptions): SearchFormSystemPlugin => {
	const definition = computed(() => {
		const corpus = options.corpus.value;
		if (!corpus) return null;
		const tagset = options.tagset.value;
		const configuration = options.configuration.value;
		return createSearchFormDefinition(corpus, tagset, configuration, options.blacklabApi, options.translate);
	});
	const runtime = shallowRef<FormRuntime | null>(null);
	watch(
		definition,
		currentDefinition => {
			if (!currentDefinition) {
				runtime.value = null;
				return;
			}

			runtime.value = new FormRuntime(currentDefinition);
		},
		{ flush: 'sync', immediate: true },
	);
	return {
		install: app => provideSearchFormSystem(app, runtime),
		runtime,
	};
};

export function hasNewSearchFormForPattern(runtime: FormRuntime | null | undefined, patternMode: PatternMode): boolean {
	return !!runtime?.definition.getForm(getNewSearchFormId(patternMode));
}

export function getNewSearchFormId(patternMode: PatternMode): string {
	return `${SEARCH_FORM_ID_PREFIX}${patternMode}`;
}

export function hasNewExploreFormForMode(runtime: FormRuntime | null | undefined, exploreMode: keyof ExploreFormState): boolean {
	return !!runtime?.definition.getForm(getNewExploreFormId(exploreMode));
}

export function getNewExploreFormId(exploreMode: keyof ExploreFormState): string {
	return `${EXPLORE_FORM_ID_PREFIX}${exploreMode}`;
}

export function getLegacyFormNameFromNewFormId(newFormId: string) {
	return newFormId.startsWith(SEARCH_FORM_ID_PREFIX) ? 'search' : 'explore';
}

export { useSearchFormSystem, createSearchFormSystem };
