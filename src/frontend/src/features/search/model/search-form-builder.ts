import { shallowRef, watch, type ObjectPlugin, type Ref, type ShallowRef } from 'vue';

import type { Corpus } from '@/app/state/useCorpusContext';
import { FormBuilder, FormRuntime, type BaseFieldNode, type FormFieldNode, type FormNode } from '@/features/form';
import type { PatternMode } from '@/features/search/model/form/pattern-state';
import type { SearchFormConfiguration } from '@/features/search/model/search-form-configuration';
import { runSearchFormCustomizations, searchFormCustomizationCallbacks, type SearchFormCustomizationCallback, type SearchFormWithinAttribute } from '@/features/search/model/search-form-customization';
import { searchFormIds as ids } from '@/features/search/model/search-form-ids';
import { createSearchFormNodeConstructors } from '@/features/search/model/search-form-node-factory';
import { createSearchFormTotalsFactory } from '@/features/search/model/search-form-totals';
import type { NormalizedAnnotation, NormalizedMetadataField, Tagset } from '@/types/apptypes';
import { corpusCustomizations } from '@/utils/customization';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { getAnnotationSubset, getMetadataSubset } from '@/shared/blacklab-helpers/field-groups';
import debug from '@/shared/debug/debug';
import type { Translate } from '@/shared/i18n';
import { optionValues, type Options, type OptionText } from '@/shared/utils/options';
import useInjectable from '@/shared/utils/useInjectable';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import HeadingView from '@/features/form/views/HeadingView.vue';
import SummaryView from '@/features/form/views/SummaryView.vue';

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
	nodeConstructors: ReturnType<typeof createSearchFormNodeConstructors>;
	translate: Translate;
};

const [_searchFormSystemKey, provideSearchFormSystem, useSearchFormSystem] = useInjectable<Readonly<Ref<FormRuntime | null>>>('searchFormSystem');

/** Construct annotation nodes from normalized corpus references through the shared factory. */
function createAnnotationField(context: BuildContext, nodeId: string, annotation: NormalizedAnnotation, groupId?: string, variant?: BaseFieldNode['variant']): FormFieldNode {
	return context.nodeConstructors.nodes.annotation({ id: annotation.id, annotatedFieldId: annotation.annotatedFieldId }, { id: nodeId, groupId, variant });
}

function createFilterField(context: BuildContext, nodeId: string, field: NormalizedMetadataField, groupId?: string): FormFieldNode {
	return context.nodeConstructors.nodes.metadata(field.id, { id: nodeId, groupId });
}

function createWithinFilterField(context: BuildContext, nodeId: string, attribute: SearchFormWithinAttribute, groupId?: string): FormFieldNode {
	const { attributeName, defaultDescription, defaultDisplayName, elementName, id } = attribute;
	return context.nodeConstructors.nodes.withinAttribute({ attributeName, defaultDescription, defaultDisplayName, elementName, id }, { control: attribute.control, id: nodeId, groupId });
}

function createSharedFilters(context: BuildContext): FormNode | null {
	const { blacklabApi, builder, configuration, corpus, translate } = context;
	const groupIds = [...new Set([...corpus.metadataGroups.map(group => group.id), ...configuration.customization.withinAttributes.map(attribute => attribute.groupId ?? 'Filters')])];
	const groups = groupIds
		.map(id => {
			const metadataGroup = corpus.metadataGroups.find(group => group.id === id);
			const entries: Array<NormalizedMetadataField | SearchFormWithinAttribute> =
				metadataGroup?.fields.filter((field): field is NormalizedMetadataField => !!field && configuration.metadataFieldIds.includes(field.id)) ?? [];
			for (const attribute of configuration.customization.withinAttributes.filter(attribute => (attribute.groupId ?? 'Filters') === id)) {
				const existing = entries.findIndex(entry => entry.id === attribute.id);
				if (existing !== -1) entries.splice(existing, 1);
				const before = attribute.insertBefore ? entries.findIndex(entry => entry.id === attribute.insertBefore) : -1;
				entries.splice(before === -1 ? entries.length : before, 0, attribute);
			}
			return { id, entries, metadataGroup };
		})
		.filter(group => group.entries.length);

	if (!groups.length) return null;

	const filters = builder.newContainer(ids.sharedFilters(), ContainerRenderer, {
		variant: groups.length > 1 ? ['tabs', 'tab-badges'] : undefined,
	});

	for (const group of groups) {
		const groupContainer = builder.newContainer(ids.filterTab(group.metadataGroup ?? group.id), ContainerRenderer, {
			title: groups.length > 1 ? () => translate.$tMetaGroupName(group.metadataGroup ?? group.id) || group.id : undefined,
			variant: groups.length === 1 ? 'list' : undefined,
		});
		for (const entry of group.entries) {
			const nodeId = 'elementName' in entry ? ids.withinFilter(entry.elementName, entry.attributeName) : ids.metadataFilter(entry);
			const node = builder.getField(nodeId) ?? ('elementName' in entry ? createWithinFilterField(context, nodeId, entry, group.id) : createFilterField(context, nodeId, entry, group.id));
			groupContainer.addChildren(node);
		}
		filters.addChildren(groupContainer);
	}

	return builder.newContainer(ids.sharedFiltersRegion(), ContainerRenderer, {}).addChildren(
		builder.newView(ids.sharedFiltersHeading(), HeadingView, { title: () => translate.$t('filter.heading') }),
		filters,
		builder.newView(ids.sharedFiltersSummary(), SummaryView, {
			createTotals: createSearchFormTotalsFactory(corpus, blacklabApi),
			summaryType: 'filter',
		}),
	);
}

function createExploreCorporaForm({ builder, configuration, corpus, nodeConstructors, translate }: BuildContext, sharedFilters: FormNode | null): FormNode {
	const options: Options = getMetadataSubset(
		configuration.explore.corpora.groupMetadataIds,
		corpus.metadataGroups,
		corpus.allMetadataFieldsMap,
		'Group',
		translate,
		debug,
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
	const groupByField = nodeConstructors.blueprint.exploreCorporaGroupBy({
		defaultValue: defaultGroupBy,
		id: ids.exploreCorporaGroupBy(),
		options,
	});
	const groupDisplayModeField = nodeConstructors.blueprint.exploreCorporaGroupDisplayMode({ id: ids.exploreCorporaGroupDisplayMode() });
	const resultPresetFields = builder.newContainer(ids.exploreCorporaResultPreset(), ContainerRenderer, { variant: 'list' }).addChildren(groupByField, groupDisplayModeField);
	const form = builder.newForm(ids.exploreForm('corpora'), ContainerRenderer, {
		title: () => translate.$t('explore.corpora.heading'),
		variant: sharedFilters ? 'columns' : undefined,
	});
	form.addChildren(resultPresetFields, sharedFilters);
	return form;
}

function createExploreAnnotationOptions(context: BuildContext, annotationIds: string[], showGroupLabels: boolean): Options {
	const groups = getAnnotationSubset(annotationIds, context.corpus.annotationGroups, context.corpus.allAnnotationsMap, 'Search', context.translate, debug, showGroupLabels).filter(
		group => group.options.length,
	);
	return groups.length > 1 ? groups : groups.flatMap(group => group.options);
}

function configuredDefaultValue(configuredValue: string | null, availableValues: string[]): string | null {
	return configuredValue && availableValues.includes(configuredValue) ? configuredValue : (availableValues[0] ?? null);
}

function createAnnotationLabels(context: BuildContext, annotationIds: string[]): Record<string, OptionText> {
	return Object.fromEntries(
		annotationIds
			.map(annotationId => context.corpus.allAnnotationsMap[annotationId])
			.filter((annotation): annotation is NormalizedAnnotation => !!annotation)
			.map(annotation => [annotation.id, () => context.translate.$tAnnotDisplayName(annotation)]),
	);
}

function createExploreNgramForm(context: BuildContext, sharedFilters: FormNode | null): FormNode | null {
	const { builder, configuration, nodeConstructors, translate } = context;
	const selectorOptions = createExploreAnnotationOptions(context, configuration.explore.searchAnnotationIds, false);
	const selectorValues = optionValues(selectorOptions);
	const defaultFieldId = configuredDefaultValue(configuration.explore.defaultSearchAnnotationId, selectorValues);
	const groupOptions = createExploreAnnotationOptions(context, configuration.explore.groupAnnotationIds, configuration.explore.annotationGroupLabelsVisible);
	const groupAnnotationValues = optionValues(groupOptions);
	const defaultGroupAnnotationId = configuredDefaultValue(configuration.explore.defaultGroupAnnotationId, groupAnnotationValues);
	if (!defaultFieldId || !defaultGroupAnnotationId) return null;

	const groupBy = nodeConstructors.blueprint.ngramGroupAnnotation({
		annotationLabels: createAnnotationLabels(context, groupAnnotationValues),
		defaultAnnotationId: defaultGroupAnnotationId,
		id: ids.exploreNgramGroupBy(),
		options: groupOptions,
		variant: 'horizontal',
	});
	const tokens = nodeConstructors.blueprint.ngramTokens({
		defaultFieldId,
		id: ids.exploreNgramTokens(),
		selectorOptions,
	});
	const controls = builder
		.newContainer(ids.exploreControls('ngram'), ContainerRenderer, { variant: 'list' })
		.addChildren(nodeConstructors.blueprint.exploreParallelSource('ngram', { id: ids.exploreParallelSource('ngram') }), groupBy, tokens);
	// Keep the five-token row full-width; the shared filters follow underneath.
	const form = builder.newForm(ids.exploreForm('ngram'), ContainerRenderer, { title: () => translate.$t('explore.ngram.heading') });
	form.addChildren(controls, sharedFilters);
	return form;
}

function createExploreFrequencyForm(context: BuildContext, sharedFilters: FormNode | null): FormNode | null {
	const { builder, configuration, nodeConstructors, translate } = context;
	const options = createExploreAnnotationOptions(context, configuration.explore.groupAnnotationIds, configuration.explore.annotationGroupLabelsVisible);
	const defaultAnnotationId = configuredDefaultValue(configuration.explore.defaultGroupAnnotationId, optionValues(options));
	if (!defaultAnnotationId) return null;
	const annotation = nodeConstructors.blueprint.frequencyAnnotation({
		annotationLabels: createAnnotationLabels(context, optionValues(options)),
		defaultAnnotationId,
		id: ids.exploreFrequencyAnnotation(),
		options,
	});
	const controls = builder
		.newContainer(ids.exploreControls('frequency'), ContainerRenderer, { variant: 'list' })
		.addChildren(nodeConstructors.blueprint.exploreParallelSource('frequency', { id: ids.exploreParallelSource('frequency') }), annotation);
	const form = builder.newForm(ids.exploreForm('frequency'), ContainerRenderer, {
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
			const nodeId = ids.annotationField('extended', annotation.annotatedFieldId, annotation);
			const node = builder.getField(nodeId) ?? createAnnotationField(context, nodeId, annotation, groupId, 'horizontal');
			tab.addChildren(node);
		}
	};

	if (groups.length === 1) {
		const group = groups[0];
		const single = builder.newContainer(ids.annotationTabs(), ContainerRenderer, {
			variant: 'list',
		});
		populateTab(single, group.annotations, group.group.id);
		return single;
	}

	const tabs = builder.newContainer(ids.annotationTabs(), ContainerRenderer, {
		variant: 'small-tabs',
	});

	for (const { annotations, group } of groups) {
		const tab = builder.newContainer(ids.annotationTab(group), ContainerRenderer, {
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

function queryFieldId(context: BuildContext, mode: PatternMode): string {
	return context.corpus.isParallelCorpus ? ids.queryFieldTemplate(mode) : ids.queryField(mode);
}

function wrapParallel(context: BuildContext, mode: PatternMode, field: FormFieldNode): FormFieldNode {
	if (context.corpus.isParallelCorpus) return context.nodeConstructors.blueprint.parallelQuery({ childFieldTemplate: field, id: ids.queryField(mode) });
	return field;
}

function createSearchFormDefinition(
	corpus: Corpus,
	tagset: Tagset | undefined,
	configuration: SearchFormConfiguration,
	blacklabApi: BlackLabApi,
	translate: Translate,
	callbacks: readonly SearchFormCustomizationCallback[],
): FormBuilder {
	const builder = new FormBuilder({
		corpus: {
			indexId: corpus.id,
			isParallelCorpus: corpus.isParallelCorpus,
			textDirection: corpus.textDirection,
		},
		translate,
	});

	// top-level
	const root = builder.newContainer(ids.root(), ContainerRenderer, { variant: ['tabs', 'panel-tabs'], class: 'tabs-primary text-primary' });
	const patternFormsContainer = builder.newContainer(ids.searchFormsContainer(), ContainerRenderer, { variant: ['tabs'] });
	const exploreFormsContainer = builder.newContainer(ids.exploreFormsContainer(), ContainerRenderer, { variant: ['tabs'] });

	// One container + heading for forms and explore both
	root.addChildren(
		builder
			.newContainer(ids.searchSection(), ContainerRenderer, { title: () => translate.$t('queryForm.search'), variant: 'list' })
			.addChildren(builder.newView(ids.searchSectionHeading(), HeadingView, { title: () => translate.$t('search.heading') }), patternFormsContainer),
		builder
			.newContainer(ids.exploreSection(), ContainerRenderer, { title: () => translate.$t('queryForm.explore'), variant: 'list' })
			.addChildren(builder.newView(ids.exploreSectionHeading(), HeadingView, { title: () => translate.$t('explore.heading') }), exploreFormsContainer),
	);

	const nodeConstructors = createSearchFormNodeConstructors({ blacklabApi, configuration, corpus, tagset, translate });
	const context: BuildContext = { blacklabApi, builder, configuration, corpus, nodeConstructors, translate };
	const sharedWithin = nodeConstructors.blueprint.within({ id: ids.withinField() });
	const sharedFilters = createSharedFilters(context);

	patternFormsContainer.addChildren(
		createSimplePatternForm(context, getSimpleSearchAnnotation(corpus, configuration)),
		createExtendedPatternForm(context, sharedWithin, sharedFilters),
		configuration.queryBuilder.enabled ? createAdvancedPatternForm(context, sharedWithin, sharedFilters) : null,
		createExpertPatternForm(context, sharedWithin, sharedFilters),
	);

	exploreFormsContainer.addChildren(createExploreCorporaForm(context, sharedFilters), createExploreNgramForm(context, sharedFilters), createExploreFrequencyForm(context, sharedFilters));
	runSearchFormCustomizations(
		{
			...nodeConstructors.nodes,
			corpus,
			graph: builder,
			ids,
			newContainer: (id, config = {}) => builder.newContainer(id, ContainerRenderer, config),
			newForm: (id, config = {}) => builder.newForm(id, ContainerRenderer, config),
			tagset,
			translate,
		},
		callbacks,
	);

	return builder;
}

type SearchFormSystemPlugin = ObjectPlugin & {
	runtime: ShallowRef<FormRuntime | null>;
};

const createSearchFormSystem = (options: CreateSearchFormSystemOptions): SearchFormSystemPlugin => {
	const runtime = shallowRef<FormRuntime | null>(null);
	watch(
		[options.corpus, options.tagset, options.configuration, searchFormCustomizationCallbacks],
		([corpus, tagset, configuration, callbacks]) => {
			if (!corpus) {
				runtime.value = null;
				return;
			}

			// Localized graph values are deferred getters. Keep locale and debug out of
			// the structural dependencies so they update labels without replacing the
			// live form session and all of its state.
			runtime.value = new FormRuntime(createSearchFormDefinition(corpus, tagset, configuration, options.blacklabApi, options.translate, callbacks));
		},
		{ flush: 'sync', immediate: true },
	);
	return {
		install: app => provideSearchFormSystem(app, runtime),
		runtime,
	};
};

function createExpertPatternForm(context: BuildContext, sharedWithin: FormFieldNode | null, sharedFilters: FormNode | null) {
	const { translate, builder } = context;
	const expertQuery = wrapParallel(context, 'expert', context.nodeConstructors.blueprint.expertQuery({ id: queryFieldId(context, 'expert') }));
	const expertForm = builder.newForm(ids.searchForm('expert'), ContainerRenderer, {
		title: () => translate.$t('search.expert.heading'),
		variant: sharedFilters ? 'columns' : undefined,
	});

	expertForm.addChildren(
		builder.newContainer(ids.queryRegion('expert'), ContainerRenderer, { variant: 'list' }).addChildren(
			builder.newView(ids.queryHeading('expert'), HeadingView, {
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
	const advancedForm = context.builder.newForm(ids.searchForm('advanced'), ContainerRenderer, {
		title: () => context.translate.$t('search.advanced.heading'),
		variant: 'list',
	});
	const advancedQuery = wrapParallel(context, 'advanced', context.nodeConstructors.blueprint.queryBuilder({ id: queryFieldId(context, 'advanced') }));
	advancedForm.addChildren(advancedQuery, sharedWithin, sharedFilters);
	return advancedForm;
}

function createExtendedPatternForm(context: BuildContext, sharedWithin: FormFieldNode | null, sharedFilters: FormNode | null) {
	const extendedForm = context.builder.newForm(ids.searchForm('extended'), ContainerRenderer, {
		title: () => context.translate.$t('search.extended.heading'),
		variant: 'columns',
	});
	extendedForm.addChildren(
		context.builder.newContainer(ids.queryRegion('extended'), ContainerRenderer, { variant: 'list' }).addChildren(createExtendedAnnotationTabs(context), sharedWithin),
		sharedFilters,
	);
	return extendedForm;
}

function createSimplePatternForm(context: BuildContext, annotation: NormalizedAnnotation) {
	const simpleForm = context.builder.newForm(ids.searchForm('simple'), ContainerRenderer, { title: () => context.translate.$t('search.simple.heading') });
	const simpleQuery = wrapParallel(context, 'simple', createAnnotationField(context, queryFieldId(context, 'simple'), annotation, undefined, SIMPLE_SEARCH_VARIANT));
	simpleForm.addChildren(simpleQuery);
	return simpleForm;
}

export { useSearchFormSystem, createSearchFormSystem };
