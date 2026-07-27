import { shallowRef, watch, type ObjectPlugin, type Ref, type ShallowRef } from 'vue';

import type { Corpus } from '@/app/state/useCorpusContext';
import {
	createFormFieldNode,
	expertQueryController,
	frequencyAnnotationController,
	FormBuilder,
	FormRuntime,
	ngramGroupAnnotationController,
	parallelController,
	parallelSourceController,
	type BaseFieldNode,
	resultGroupByController,
	resultGroupDisplayModeController,
	tokenSequenceController,
	type FormFieldNode,
	type TokenSequenceCreateField,
	withinController,
	queryBuilderController,
	QueryBuilderField,
	RawCqlField,
	type FormNode,
} from '@/features/form';
import type { WithinFieldOption } from '@/features/form/fields/within-field';
import type { ModuleRootState as ExploreFormState } from '@/features/search/model/form/explore-state';
import type { PatternMode } from '@/features/search/model/form/pattern-state';
import type { SearchFormConfiguration } from '@/features/search/model/search-form-configuration';
import { createSearchFormNodeFactory, type SearchFormNodeFactory } from '@/features/search/model/search-form-node-factory';
import { createSearchFormTotalsFactory } from '@/features/search/model/search-form-totals';
import { createQueryBuilderOptions } from '@/pages/search/model/query-builder-options';
import type { NormalizedAnnotation, NormalizedMetadataField, Tagset } from '@/types/apptypes';
import { corpusCustomizations } from '@/utils/customization';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { getAnnotationSubset, getMetadataSubset } from '@/shared/blacklab-helpers/field-groups';
import debug from '@/shared/debug/debug';
import type { Translate } from '@/shared/i18n';
import { optionValues, type Options } from '@/shared/utils/options';
import useInjectable from '@/shared/utils/useInjectable';

import SelectField from '@/features/form/fields/generic/SelectField.vue';
import ParallelField from '@/features/form/fields/ParallelField.vue';
import TokenSequenceField from '@/features/form/fields/TokenSequenceField.vue';
import WithinField from '@/features/form/fields/WithinField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import HeadingView from '@/features/form/views/HeadingView.vue';
import SummaryView from '@/features/form/views/SummaryView.vue';

// TODO integration customization.ts callback functions

const SEARCH_FORM_ID_PREFIX = 'search.';
const EXPLORE_FORM_ID_PREFIX = 'explore.';
const SIMPLE_SEARCH_VARIANT: NonNullable<BaseFieldNode['variant']> = ['large', 'simple'];
const EXPLORE_NGRAM_MAX_SIZE = 5;

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
	fields: SearchFormNodeFactory;
	translate: Translate;
};

const [_searchFormSystemKey, provideSearchFormSystem, useSearchFormSystem] = useInjectable<Readonly<Ref<FormRuntime | null>>>('searchFormSystem');

function toSafeHtmlId(value: string): string {
	return value.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'group';
}

function createAnnotationField(context: BuildContext, nodeId: string, annotation: NormalizedAnnotation, groupId?: string, variant?: BaseFieldNode['variant']): FormFieldNode {
	return context.fields.annotation(annotation, { id: nodeId, groupId, variant });
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
		variant: 'horizontal',
	});
}

function createFilterField(context: BuildContext, nodeId: string, field: NormalizedMetadataField, groupId?: string): FormFieldNode {
	return context.fields.metadata(field, { id: nodeId, groupId });
}

function createSharedFilters(context: BuildContext): FormNode | null {
	const { blacklabApi, builder, configuration, corpus, translate } = context;
	const filterIds = configuration.metadataFieldIds;
	const groups = corpus.metadataGroups
		.map(group => ({
			fields: group.fields.filter((field): field is NormalizedMetadataField => !!field && filterIds.includes(field.id)),
			group,
		}))
		.filter(({ fields }) => fields.length);

	if (!groups.length) return null;

	const filters = builder.newContainer('shared.filters', ContainerRenderer, {
		variant: groups.length > 1 ? ['tabs', 'tab-badges'] : undefined,
	});

	for (const { fields, group } of groups) {
		const groupContainer = builder.newContainer(`${filters.id}.${toSafeHtmlId(group.id)}`, ContainerRenderer, {
			title: groups.length > 1 ? () => translate.$tMetaGroupName(group) || group.id : undefined,
			variant: groups.length === 1 ? 'list' : undefined,
		});
		for (const field of fields) {
			const nodeId = `${groupContainer.id}.${toSafeHtmlId(field.id)}`;
			const node = builder.getField(nodeId) ?? createFilterField(context, nodeId, field, group.id);
			groupContainer.addChildren(node);
		}
		filters.addChildren(groupContainer);
	}

	return builder.newContainer('shared.filters.wrapper', ContainerRenderer, {}).addChildren(
		builder.newView('shared.filters.heading', HeadingView, { title: () => translate.$t('filter.heading') }),
		filters,
		builder.newView('shared.filters.summary', SummaryView, {
			createTotals: createSearchFormTotalsFactory(corpus, blacklabApi),
			summaryType: 'filter',
		}),
	);
}

function createExploreCorporaForm({ builder, configuration, corpus, translate }: BuildContext, sharedFilters: FormNode | null): FormNode {
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
		variant: 'horizontal',
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
		variant: 'horizontal',
	});
	const resultPresetFields = builder.newContainer('explore.corpora.result-preset', ContainerRenderer, { variant: 'list' }).addChildren(groupByField, groupDisplayModeField);
	const form = builder.newForm(getNewExploreFormId('corpora'), ContainerRenderer, {
		title: () => translate.$t('explore.corpora.heading'),
		variant: sharedFilters ? 'columns' : undefined,
	});
	form.addChildren(resultPresetFields, sharedFilters);
	return form;
}

function createExploreAnnotationOptions(context: BuildContext, annotationIds: string[], showGroupLabels: boolean): Options {
	const groups = getAnnotationSubset(annotationIds, context.corpus.annotationGroups, context.corpus.allAnnotationsMap, 'Search', context.translate, debug.value, showGroupLabels).filter(
		group => group.options.length,
	);
	return groups.length > 1 ? groups : groups.flatMap(group => group.options);
}

function configuredDefaultValue(configuredValue: string | null, availableValues: string[]): string | null {
	return configuredValue && availableValues.includes(configuredValue) ? configuredValue : (availableValues[0] ?? null);
}

function createAnnotationLabels(context: BuildContext, annotationIds: string[]): Record<string, string> {
	return Object.fromEntries(
		annotationIds
			.map(annotationId => context.corpus.allAnnotationsMap[annotationId])
			.filter((annotation): annotation is NormalizedAnnotation => !!annotation)
			.map(annotation => [annotation.id, context.translate.$tAnnotDisplayName(annotation)]),
	);
}

function createExploreParallelSourceField(context: BuildContext, mode: 'ngram' | 'frequency'): FormFieldNode | null {
	const { builder, corpus, translate } = context;
	if (!corpus.isParallelCorpus) return null;
	const options: Options = corpus.parallelAnnotatedFields.map(field => ({
		value: field.id,
		label: translate.$tAnnotatedFieldDisplayName(field),
	}));
	return builder.newField(`explore.${mode}.source`, parallelSourceController, SelectField, {
		defaultSource: corpus.parallelAnnotatedFields[0]?.id ?? null,
		displayName: () => translate.$t('search.parallel.searchSourceVersion'),
		hideEmpty: true,
		html: true,
		options,
		persistKey: `explore-${mode}-source`,
		variant: mode === 'ngram' ? 'horizontal' : undefined,
	});
}

function createExploreNgramForm(context: BuildContext, sharedFilters: FormNode | null): FormNode | null {
	const { builder, configuration, corpus, translate } = context;
	const selectorOptions = createExploreAnnotationOptions(context, configuration.explore.searchAnnotationIds, false);
	const selectorValues = optionValues(selectorOptions);
	const defaultFieldId = configuredDefaultValue(configuration.explore.defaultSearchAnnotationId, selectorValues);
	const groupOptions = createExploreAnnotationOptions(context, configuration.explore.groupAnnotationIds, configuration.explore.annotationGroupLabelsVisible);
	const groupAnnotationValues = optionValues(groupOptions);
	const defaultGroupAnnotationId = configuredDefaultValue(configuration.explore.defaultGroupAnnotationId, groupAnnotationValues);
	if (!defaultFieldId || !defaultGroupAnnotationId) return null;

	const groupBy = builder.newField('explore.ngram.group-by', ngramGroupAnnotationController, SelectField, {
		annotationLabels: createAnnotationLabels(context, groupAnnotationValues),
		defaultAnnotationId: defaultGroupAnnotationId,
		displayName: () => translate.$t('explore.ngram.ngramType'),
		hideEmpty: true,
		html: true,
		options: groupOptions,
		persistKey: 'explore-ngram-group-by',
		variant: 'horizontal',
	});
	const tokens = builder.newField('explore.ngram.tokens', tokenSequenceController, TokenSequenceField, {
		createField: (options: Parameters<TokenSequenceCreateField>[0]) => {
			const annotation = corpus.allAnnotationsMap[options.annotationId];
			if (!annotation) throw new Error(`Cannot create n-gram token field for unknown annotation '${options.annotationId}'.`);
			return context.fields.annotation(annotation, { ...options, showLabel: false, variant: 'simple' });
		},
		defaultFieldId,
		defaultLength: EXPLORE_NGRAM_MAX_SIZE,
		lengthDisplayName: translate.$t('explore.ngram.ngramSize').toString(),
		maxLength: EXPLORE_NGRAM_MAX_SIZE,
		minLength: 1,
		persistKey: 'explore-ngram-tokens',
		selectorDisplayName: 'Property',
		selectorOptions,
		selectorPlaceholder: 'Property',
	});
	const controls = builder.newContainer('explore.ngram.controls', ContainerRenderer, { variant: 'list' }).addChildren(createExploreParallelSourceField(context, 'ngram'), groupBy, tokens);
	// Keep the five-token row full-width; the shared filters follow underneath.
	const form = builder.newForm(getNewExploreFormId('ngram'), ContainerRenderer, { title: () => translate.$t('explore.ngram.heading') });
	form.addChildren(controls, sharedFilters);
	return form;
}

function createExploreFrequencyForm(context: BuildContext, sharedFilters: FormNode | null): FormNode | null {
	const { builder, configuration, translate } = context;
	const options = createExploreAnnotationOptions(context, configuration.explore.groupAnnotationIds, configuration.explore.annotationGroupLabelsVisible);
	const defaultAnnotationId = configuredDefaultValue(configuration.explore.defaultGroupAnnotationId, optionValues(options));
	if (!defaultAnnotationId) return null;
	const annotation = builder.newField('explore.frequency.annotation', frequencyAnnotationController, SelectField, {
		annotationLabels: createAnnotationLabels(context, optionValues(options)),
		defaultAnnotationId,
		displayName: () => translate.$t('explore.frequency.frequencyType'),
		hideEmpty: true,
		html: true,
		options,
		persistKey: 'explore-frequency-annotation',
	});
	const controls = builder.newContainer('explore.frequency.controls', ContainerRenderer, { variant: 'list' }).addChildren(createExploreParallelSourceField(context, 'frequency'), annotation);
	const form = builder.newForm(getNewExploreFormId('frequency'), ContainerRenderer, {
		title: () => translate.$t('explore.frequency.heading'),
		variant: sharedFilters ? 'columns' : undefined,
	});
	form.addChildren(controls, sharedFilters);
	return form;
}

function createExtendedAnnotationTabs(context: BuildContext): FormNode | null {
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
			const node = builder.getField(nodeId) ?? createAnnotationField(context, nodeId, annotation, groupId, 'horizontal');
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
		variant: 'small-tabs',
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
		annotatedFieldId: sourceField,
	};
}

function createParallelQueryField({ builder, configuration, corpus }: BuildContext, id: string, childFieldTemplate: FormFieldNode): FormFieldNode {
	return builder.newField(id, parallelController, ParallelField, {
		alignByOptions: configuration.alignBy.enabled ? configuration.alignBy.elements : [],
		defaultAlignBy: configuration.alignBy.defaultValue || null,
		defaultSource: corpus.parallelAnnotatedFields[0]?.id ?? null,
		childFieldTemplate,
		fieldOptions: corpus.parallelAnnotatedFields,
	});
}

function wrapParallel(context: BuildContext, field: FormFieldNode): FormFieldNode {
	if (context.corpus.isParallelCorpus) return createParallelQueryField(context, `${field.id}.parallel`, field);
	return field;
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

	// top-level
	const root = builder.newContainer('root', ContainerRenderer, { variant: ['tabs', 'panel-tabs'], class: 'tabs-primary text-primary' });
	const patternFormsContainer = builder.newContainer('patterns.forms', ContainerRenderer, { variant: ['tabs'] });
	const exploreFormsContainer = builder.newContainer('explore.forms', ContainerRenderer, { variant: ['tabs'] });

	// One container + heading for forms and explore both
	root.addChildren(
		builder
			.newContainer('patterns', ContainerRenderer, { title: () => translate.$t('queryForm.search'), variant: 'list' })
			.addChildren(builder.newView('patterns.heading', HeadingView, { title: () => translate.$t('search.heading') }), patternFormsContainer),
		builder
			.newContainer('explore', ContainerRenderer, { title: () => translate.$t('queryForm.explore'), variant: 'list' })
			.addChildren(builder.newView('explore.heading', HeadingView, { title: () => translate.$t('explore.heading') }), exploreFormsContainer),
	);

	const fields = createSearchFormNodeFactory({ blacklabApi, configuration, corpus, tagset, translate });
	const context: BuildContext = { blacklabApi, builder, configuration, corpus, fields, translate };
	const sharedWithin = createWithinField(context);
	const sharedFilters = createSharedFilters(context);

	patternFormsContainer.addChildren(
		createSimplePatternForm(context, getSimpleSearchAnnotation(corpus, configuration)),
		createExtendedPatternForm(context, sharedWithin, sharedFilters),
		configuration.queryBuilder.enabled ? createAdvancedPatternForm(context, sharedWithin, sharedFilters) : null,
		createExpertPatternForm(context, sharedWithin, sharedFilters),
	);

	exploreFormsContainer.addChildren(createExploreCorporaForm(context, sharedFilters), createExploreNgramForm(context, sharedFilters), createExploreFrequencyForm(context, sharedFilters));

	return builder;
}

type SearchFormSystemPlugin = ObjectPlugin & {
	runtime: ShallowRef<FormRuntime | null>;
};

const createSearchFormSystem = (options: CreateSearchFormSystemOptions): SearchFormSystemPlugin => {
	const runtime = shallowRef<FormRuntime | null>(null);
	watch(
		[options.corpus, options.tagset, options.configuration],
		([corpus, tagset, configuration]) => {
			if (!corpus) {
				runtime.value = null;
				return;
			}

			// Building the definition reads translations for option labels. Keep those
			// reads out of the structural dependencies: a locale change must update the
			// rendered labels, not replace the live form session and all of its state.
			runtime.value = new FormRuntime(createSearchFormDefinition(corpus, tagset, configuration, options.blacklabApi, options.translate));
		},
		{ flush: 'sync', immediate: true },
	);
	return {
		install: app => provideSearchFormSystem(app, runtime),
		runtime,
	};
};

// Kept while the legacy search-form hosts still select individual new-form roots.
export function hasNewSearchFormForPattern(runtime: FormRuntime | null | undefined, patternMode: PatternMode): boolean {
	return !!runtime?.definition.getForm(getNewSearchFormId(patternMode));
}

function createExpertPatternForm(context: BuildContext, sharedWithin: FormFieldNode | null, sharedFilters: FormNode | null) {
	const { translate, builder } = context;
	const expertConfig = { hideLabel: true };
	const expertQuery = wrapParallel(context, createFormFieldNode('search.expert.query', expertQueryController, RawCqlField, expertConfig));
	const expertForm = builder.newForm(getNewSearchFormId('expert'), ContainerRenderer, {
		title: () => translate.$t('search.expert.heading'),
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
	return expertForm;
}

function createAdvancedPatternForm(context: BuildContext, sharedWithin: FormFieldNode | null, sharedFilters: FormNode | null) {
	const queryBuilderConfig = { options: createQueryBuilderOptions(context) };
	const advancedForm = context.builder.newForm(getNewSearchFormId('advanced'), ContainerRenderer, {
		title: () => context.translate.$t('search.advanced.heading'),
		variant: 'list',
	});
	const advancedQuery = wrapParallel(context, createFormFieldNode('search.advanced.query', queryBuilderController, QueryBuilderField, queryBuilderConfig));
	advancedForm.addChildren(advancedQuery, sharedWithin, sharedFilters);
	return advancedForm;
}

function createExtendedPatternForm(context: BuildContext, sharedWithin: FormFieldNode | null, sharedFilters: FormNode | null) {
	const extendedForm = context.builder.newForm(getNewSearchFormId('extended'), ContainerRenderer, {
		title: () => context.translate.$t('search.extended.heading'),
		variant: 'columns',
	});
	extendedForm.addChildren(
		context.builder.newContainer('search.extended.query.wrapper', ContainerRenderer, { variant: 'list' }).addChildren(createExtendedAnnotationTabs(context), sharedWithin),
		sharedFilters,
	);
	return extendedForm;
}

function createSimplePatternForm(context: BuildContext, annotation: NormalizedAnnotation) {
	const simpleForm = context.builder.newForm(getNewSearchFormId('simple'), ContainerRenderer, { title: () => context.translate.$t('search.simple.heading') });
	const simpleQuery = wrapParallel(context, createAnnotationField(context, 'search.simple.query', annotation, undefined, SIMPLE_SEARCH_VARIANT));
	simpleForm.addChildren(simpleQuery);
	return simpleForm;
}

export function getNewSearchFormId(patternMode: PatternMode): string {
	return `${SEARCH_FORM_ID_PREFIX}${patternMode}`;
}

// Kept while the legacy search-form hosts still select individual new-form roots.
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
