import { computed, shallowRef, watchEffect, type ObjectPlugin, type Ref, type ShallowRef } from 'vue';

import { createFilteredResultCountLoader } from '@/api/async/logic/result-count/result-count-from-filters';
import type { SearchPatternMode } from '@/customization-api/external/external-api';
import { createSearchFormCustomizationApi } from '@/customization-api/external/search-form-customization-api';
import type { Customizations } from '@/customization-api/internal/internal-api';
import { searchFormIds as ids } from '@/customization-api/shared/form/ids';
import { createSearchFormNodeConstructors } from '@/customization-api/shared/form/node-constructors';
import type { SearchFormWithinAttribute } from '@/customization-api/shared/form/search-form-overrides';
import {
	FormBuilder,
	FormRuntime,
	CollocationField,
	ParallelField,
	QueryBuilderField,
	RawCqlField,
	SelectField,
	TokenSequenceField,
	WithinField,
	collocationController,
	createCollocationTarget,
	createFormFieldNode,
	expertQueryController,
	frequencyAnnotationController,
	ngramGroupAnnotationController,
	parallelController,
	parallelSourceController,
	queryBuilderController,
	resultGroupByController,
	resultGroupDisplayModeController,
	docsSearchTarget,
	hitsSearchTarget,
	searchTarget,
	tokenSequenceController,
	withinController,
	type FormFieldNode,
	type FormNode,
	type SummaryTotalsController,
	type SummaryTotalsState,
	type TokenSequenceCreateField,
} from '@/features/form';
import type { WithinFieldOption } from '@/features/form/fields/within-field';
import { createQueryBuilderOptions } from '@/pages/search/model/query-builder-options';
import type { Corpus } from '@/types/apptypes';
import type { NormalizedAnnotation, NormalizedMetadataField, Tagset } from '@/types/apptypes';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { getAnnotationSubset, getMetadataSubset } from '@/shared/blacklab-helpers/field-groups';
import { normalizeAnnotationUIType } from '@/shared/blacklab-helpers/normalize/normalize-corpus';
import debug from '@/shared/debug/debug';
import type { Translate } from '@/shared/i18n';
import { optionValues, type Options, type OptionText } from '@/shared/utils/options';
import useInjectable from '@/shared/utils/useInjectable';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import HeadingView from '@/features/form/views/HeadingView.vue';
import SummaryView from '@/features/form/views/SummaryView.vue';

const EXPLORE_NGRAM_MAX_SIZE = 5;

function createSearchFormTotals(corpus: Corpus, blacklab: BlackLabApi): SummaryTotalsController {
	const loader = createFilteredResultCountLoader();
	const state = computed<SummaryTotalsState>(() => {
		if (loader.isError()) return { status: 'error', message: loader.error?.message ?? 'Could not load result totals.' };
		if (!loader.isLoaded()) return { status: 'loading' };

		return {
			status: 'loaded',
			documents: loader.value.numberOfMatchingDocuments,
			tokens: loader.value.tokensInMatchingDocuments,
			totalDocuments: loader.value.totalDocsInIndex,
			totalTokens: loader.value.totalTokensInIndex,
		};
	});

	return {
		state,
		update: ({ filter, searchfield }) =>
			loader.next({
				index: corpus,
				filter,
				annotatedFieldId: searchfield || corpus.mainAnnotatedField,
				blacklab,
			}),
		dispose: () => loader.dispose(),
	};
}

type CreateSearchFormSystemOptions = {
	blacklabApi: BlackLabApi;
	corpus: Ref<Corpus | undefined>;
	customizations: Customizations;
	tagset: Ref<Tagset | undefined>;
	translate: Translate;
};

type BuildContext = {
	blacklabApi: BlackLabApi;
	builder: FormBuilder;
	corpus: Corpus;
	customizations: Customizations;
	nodeConstructors: ReturnType<typeof createSearchFormNodeConstructors>;
	translate: Translate;
};

const [_searchFormSystemKey, provideSearchFormSystem, useSearchFormSystem] = useInjectable<Readonly<Ref<FormRuntime | null>>>('searchFormSystem');

function createSharedFilters(context: BuildContext): FormNode | null {
	const { blacklabApi, builder, corpus, customizations, nodeConstructors, translate } = context;
	const spanFilters = customizations.searchFormSpanFilters();
	const metadataFieldIds = customizations.searchFormMetadataFieldIds();
	const groupIds = [...new Set([...corpus.metadataGroups.map(group => group.id), ...spanFilters.map(attribute => attribute.groupId ?? 'Filters')])];
	const groups = groupIds
		.map(id => {
			const metadataGroup = corpus.metadataGroups.find(group => group.id === id);
			const entries: Array<NormalizedMetadataField | SearchFormWithinAttribute> =
				metadataGroup?.fields.filter((field): field is NormalizedMetadataField => !!field && metadataFieldIds.includes(field.id)) ?? [];
			for (const attribute of spanFilters.filter(attribute => (attribute.groupId ?? 'Filters') === id)) {
				const existing = entries.findIndex(entry => entry.id === attribute.id);
				if (existing !== -1) entries.splice(existing, 1);
				const before = attribute.insertBefore
					? entries.findIndex(
							entry =>
								entry.id === attribute.insertBefore || ('elementName' in entry ? ids.withinFilter(entry.elementName, entry.attributeName) : ids.metadataFilter(entry)) === attribute.insertBefore,
						)
					: -1;
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
			const node =
				builder.getField(nodeId) ??
				('elementName' in entry
					? nodeConstructors.withinAttribute(entry, { control: entry.control, id: nodeId, groupId: group.id })
					: nodeConstructors.metadata(entry.id, { id: nodeId, groupId: group.id }));
			groupContainer.addChildren(node);
		}
		filters.addChildren(groupContainer);
	}

	return builder.newContainer(ids.sharedFiltersRegion(), ContainerRenderer, {}).addChildren(
		builder.newView(ids.sharedFiltersHeading(), HeadingView, { title: () => translate.$t('filter.heading') }),
		filters,
		builder.newView(ids.sharedFiltersSummary(), SummaryView, {
			createTotals: () => createSearchFormTotals(corpus, blacklabApi),
		}),
	);
}

function createExploreCorporaForm({ builder, corpus, customizations, translate }: BuildContext, sharedFilters: FormNode | null): FormNode {
	const options: Options = getMetadataSubset(
		customizations.searchFormExploreGroupMetadataIds(),
		corpus.metadataGroups,
		corpus.allMetadataFieldsMap,
		'Group',
		translate,
		debug,
		customizations.searchFormExploreMetadataGroupLabelsVisible(),
	)
		.map(group => ({
			...group,
			options: group.options.map(option => (typeof option === 'string' ? `field:${option}` : { ...option, value: `field:${option.value}` })),
		}))
		.filter(group => group.options.length);
	const availableGroupByValues = optionValues(options);
	const defaultGroupBy = customizations.searchFormExploreDefaultGroupMetadataId(availableGroupByValues);
	const groupByField = createFormFieldNode(ids.exploreCorporaGroupBy(), resultGroupByController, SelectField, {
		defaultValue: defaultGroupBy,
		displayName: () => translate.$t('explore.corpora.groupBy'),
		hideEmpty: true,
		html: true,
		options,
		persistKey: 'explore-corpora-group-by',
		variant: 'horizontal',
	});
	const groupDisplayModeField = createFormFieldNode(ids.exploreCorporaGroupDisplayMode(), resultGroupDisplayModeController, SelectField, {
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
		variant: 'horizontal',
	});
	const resultPresetFields = builder.newContainer(ids.exploreCorporaResultPreset(), ContainerRenderer, { variant: 'list' }).addChildren(groupByField, groupDisplayModeField);
	const form = builder.newForm(ids.exploreForm('corpora'), ContainerRenderer, {
		target: docsSearchTarget,
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

function createAnnotationLabels(context: BuildContext, annotationIds: string[]): Record<string, OptionText> {
	return Object.fromEntries(
		annotationIds
			.map(annotationId => context.corpus.allAnnotationsMap[annotationId])
			.filter((annotation): annotation is NormalizedAnnotation => !!annotation)
			.map(annotation => [annotation.id, () => context.translate.$tAnnotDisplayName(annotation)]),
	);
}

function createCollocationsSection(context: BuildContext, sharedFilters: FormNode | null, annotations: NormalizedAnnotation[], mainAnnotationId: string): FormNode {
	const { builder, translate } = context;
	const field = createFormFieldNode(ids.collocationsField(), collocationController, CollocationField, {
		annotationOptions: annotations.map(annotation => ({
			value: annotation.id,
			label: () => translate.$tAnnotDisplayName(annotation).toString(),
		})),
		defaultAnnotation: mainAnnotationId,
	});
	const form = builder
		.newForm(ids.collocationsForm(), ContainerRenderer, {
			target: createCollocationTarget(mainAnnotationId),
			variant: sharedFilters ? 'columns' : undefined,
		})
		.addChildren(field, sharedFilters);

	return builder
		.newContainer(ids.collocationsSection(), ContainerRenderer, { title: () => translate.$t('queryForm.collocations'), variant: 'list' })
		.addChildren(builder.newView(ids.collocationsSectionHeading(), HeadingView, { title: () => translate.$t('collocations.heading') }), form);
}

function createExploreParallelSource(context: BuildContext, mode: 'frequency' | 'ngram'): FormFieldNode | null {
	const { corpus, translate } = context;
	if (!corpus.isParallelCorpus) return null;
	return createFormFieldNode(ids.exploreParallelSource(mode), parallelSourceController, SelectField, {
		defaultSource: corpus.parallelAnnotatedFields[0]?.id ?? null,
		displayName: () => translate.$t('search.parallel.searchSourceVersion'),
		hideEmpty: true,
		html: true,
		options: corpus.parallelAnnotatedFields.map(field => ({
			value: field.id,
			label: () => translate.$tAnnotatedFieldDisplayName(field),
		})),
		persistKey: `explore-${mode}-source`,
		variant: mode === 'ngram' ? 'horizontal' : undefined,
	});
}

function createExploreNgramForm(context: BuildContext, sharedFilters: FormNode | null): FormNode | null {
	const { builder, customizations, nodeConstructors, translate } = context;
	const selectorOptions = createExploreAnnotationOptions(context, customizations.searchFormExploreSearchAnnotationIds(), false);
	const selectorValues = optionValues(selectorOptions);
	const defaultFieldId = customizations.searchFormExploreDefaultSearchAnnotationId(selectorValues);
	const groupOptions = createExploreAnnotationOptions(context, customizations.searchFormExploreGroupAnnotationIds(), customizations.searchFormExploreAnnotationGroupLabelsVisible());
	const groupAnnotationValues = optionValues(groupOptions);
	const defaultGroupAnnotationId = customizations.searchFormExploreDefaultGroupAnnotationId(groupAnnotationValues);
	if (!defaultFieldId || !defaultGroupAnnotationId) return null;

	const groupBy = createFormFieldNode(ids.exploreNgramGroupBy(), ngramGroupAnnotationController, SelectField, {
		annotationLabels: createAnnotationLabels(context, groupAnnotationValues),
		defaultAnnotationId: defaultGroupAnnotationId,
		displayName: () => translate.$t('explore.ngram.ngramType'),
		hideEmpty: true,
		html: true,
		options: groupOptions,
		persistKey: 'explore-ngram-group-by',
	});
	const tokens = createFormFieldNode(ids.exploreNgramTokens(), tokenSequenceController, TokenSequenceField, {
		createField: (fieldOptions: Parameters<TokenSequenceCreateField>[0]) => {
			const annotation = context.corpus.allAnnotationsMap[fieldOptions.annotationId];
			if (!annotation) throw new Error(`Cannot create n-gram token field for unknown annotation '${fieldOptions.annotationId}'.`);
			return nodeConstructors.annotation({ id: annotation.id, annotatedFieldId: annotation.annotatedFieldId }, { id: fieldOptions.id, showLabel: false, variant: 'simple' });
		},
		defaultFieldId,
		defaultLength: EXPLORE_NGRAM_MAX_SIZE,
		lengthDisplayName: () => translate.$t('explore.ngram.ngramSize'),
		maxLength: EXPLORE_NGRAM_MAX_SIZE,
		minLength: 1,
		persistKey: 'explore-ngram-tokens',
		selectorDisplayName: () => translate.$t('results.table.property'),
		selectorOptions,
		selectorPlaceholder: () => translate.$t('results.table.property'),
	});
	const controls = builder.newContainer(ids.exploreControls('ngram'), ContainerRenderer, { variant: 'list' }).addChildren(createExploreParallelSource(context, 'ngram'), groupBy, tokens);
	// Keep the five-token row full-width; the shared filters follow underneath.
	const form = builder.newForm(ids.exploreForm('ngram'), ContainerRenderer, { target: hitsSearchTarget, title: () => translate.$t('explore.ngram.heading') });
	form.addChildren(controls, sharedFilters);
	return form;
}

function createExploreFrequencyForm(context: BuildContext, sharedFilters: FormNode | null): FormNode | null {
	const { builder, customizations, translate } = context;
	const options = createExploreAnnotationOptions(context, customizations.searchFormExploreGroupAnnotationIds(), customizations.searchFormExploreAnnotationGroupLabelsVisible());
	const defaultAnnotationId = customizations.searchFormExploreDefaultGroupAnnotationId(optionValues(options));
	if (!defaultAnnotationId) return null;
	const annotation = createFormFieldNode(ids.exploreFrequencyAnnotation(), frequencyAnnotationController, SelectField, {
		annotationLabels: createAnnotationLabels(context, optionValues(options)),
		defaultAnnotationId,
		displayName: () => translate.$t('explore.frequency.frequencyType'),
		hideEmpty: true,
		html: true,
		options,
		persistKey: 'explore-frequency-annotation',
	});
	const controls = builder.newContainer(ids.exploreControls('frequency'), ContainerRenderer, { variant: 'list' }).addChildren(createExploreParallelSource(context, 'frequency'), annotation);
	const form = builder.newForm(ids.exploreForm('frequency'), ContainerRenderer, {
		target: hitsSearchTarget,
		title: () => translate.$t('explore.frequency.heading'),
		variant: sharedFilters ? 'columns' : undefined,
	});
	form.addChildren(controls, sharedFilters);
	return form;
}

function createExtendedAnnotationTabs(context: BuildContext): FormNode | null {
	const { builder, corpus, customizations, translate } = context;
	const annotationIds = customizations.searchFormExtendedAnnotationIds();
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
			const node =
				builder.getField(nodeId) ?? context.nodeConstructors.annotation({ id: annotation.id, annotatedFieldId: annotation.annotatedFieldId }, { id: nodeId, groupId, variant: 'horizontal' });
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

function queryFieldId(context: BuildContext, mode: SearchPatternMode): string {
	return context.corpus.isParallelCorpus ? ids.queryFieldTemplate(mode) : ids.queryField(mode);
}

function wrapParallel(context: BuildContext, mode: SearchPatternMode, field: FormFieldNode): FormFieldNode {
	const { corpus, customizations, translate } = context;
	if (!corpus.isParallelCorpus) return field;
	return createFormFieldNode(ids.queryField(mode), parallelController, ParallelField, {
		alignByOptions: customizations.searchFormAlignByEnabled()
			? customizations.searchFormAlignByElements().map(option => ({
					...option,
					label: () => translate.$tAlignByDisplayName(option),
				}))
			: [],
		childFieldTemplate: field,
		defaultAlignBy: customizations.searchFormAlignByDefault(),
		defaultSource: corpus.parallelAnnotatedFields[0]?.id ?? null,
		fieldOptions: corpus.parallelAnnotatedFields.map(field => ({
			...field,
			label: () => translate.$tAnnotatedFieldDisplayName(field),
		})),
	});
}

function createSearchFormDefinition(corpus: Corpus, tagset: Tagset | undefined, blacklabApi: BlackLabApi, translate: Translate, customizations: Customizations): FormBuilder {
	// This mutation is legacy compatibility only. New customization APIs configure
	// the form projection without changing normalized corpus data.
	corpus.allAnnotatedFields.forEach(field => {
		Object.values(field.annotations).forEach(annotation => {
			const uiType = customizations.searchFormAnnotationUiType(annotation.annotatedFieldId, annotation.id);
			if (uiType) {
				annotation.uiType = uiType;
				annotation.uiType = normalizeAnnotationUIType(annotation);
			}
		});
	});

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

	const nodeConstructors = createSearchFormNodeConstructors({ blacklabApi, corpus, customizations, tagset, translate });
	const context: BuildContext = { blacklabApi, builder, corpus, customizations, nodeConstructors, translate };
	let sharedWithin: FormFieldNode | null = null;
	const spans = corpus.relations.spans;
	if (customizations.searchFormWithinEnabled() && spans && Object.keys(spans).length) {
		const resolvedWithin = customizations.searchFormWithinOptions();
		const withinOptions = resolvedWithin.options.map<WithinFieldOption>(option => ({
			...option,
			label: () => translate.$tWithinElementDisplayName(option),
			attributes: option.value
				? customizations.searchFormWithinAttributes(option.value).map(attribute => ({
						value: attribute,
						label: () => translate.$tWithinAttributeDisplayName(option.value, attribute),
					}))
				: [],
		}));
		sharedWithin = createFormFieldNode(ids.withinField(), withinController, WithinField, {
			options: withinOptions,
			sortOptions: resolvedWithin.sorted,
			variant: 'horizontal',
		});
	}
	const sharedFilters = createSharedFilters(context);

	patternFormsContainer.addChildren(
		createSimplePatternForm(context, customizations.searchFormSimpleAnnotation()),
		createExtendedPatternForm(context, sharedWithin, sharedFilters),
		customizations.searchFormAdvancedEnabled() ? createAdvancedPatternForm(context, sharedWithin, sharedFilters) : null,
		createExpertPatternForm(context, sharedWithin, sharedFilters),
	);

	exploreFormsContainer.addChildren(createExploreCorporaForm(context, sharedFilters), createExploreNgramForm(context, sharedFilters), createExploreFrequencyForm(context, sharedFilters));

	const mainAnnotatedField = corpus.allAnnotatedFieldsMap[corpus.mainAnnotatedField];
	const mainAnnotation = mainAnnotatedField?.annotations[mainAnnotatedField.mainAnnotationId];
	const collocationAnnotations = Object.values(mainAnnotatedField?.annotations ?? {}).filter(annotation => !annotation.isInternal && annotation.hasForwardIndex);
	root.addChildren(
		mainAnnotatedField && mainAnnotation && collocationAnnotations.includes(mainAnnotation)
			? createCollocationsSection(context, sharedFilters, collocationAnnotations, mainAnnotatedField.mainAnnotationId)
			: null,
	);
	customizations.customizeSearchForm(createSearchFormCustomizationApi({ builder, corpus, nodeConstructors, translate }));

	return builder;
}

type SearchFormSystemPlugin = ObjectPlugin & {
	runtime: ShallowRef<FormRuntime | null>;
};

const createSearchFormSystem = (options: CreateSearchFormSystemOptions): SearchFormSystemPlugin => {
	const runtime = shallowRef<FormRuntime | null>(null);
	watchEffect(
		() => {
			const corpus = options.corpus.value;
			// Localized graph values are deferred getters. Keep locale and debug out of
			// the structural dependencies so they update labels without replacing the
			// live form session and all of its state.
			runtime.value = corpus ? new FormRuntime(createSearchFormDefinition(corpus, options.tagset.value, options.blacklabApi, options.translate, options.customizations)) : null;
		},
		{ flush: 'sync' },
	);
	return {
		install: app => provideSearchFormSystem(app, runtime),
		runtime,
	};
};

function createExpertPatternForm(context: BuildContext, sharedWithin: FormFieldNode | null, sharedFilters: FormNode | null) {
	const { translate, builder } = context;
	const expertQuery = wrapParallel(
		context,
		'expert',
		createFormFieldNode(queryFieldId(context, 'expert'), expertQueryController, RawCqlField, {
			hideLabel: true,
		}),
	);
	const expertForm = builder.newForm(ids.searchForm('expert'), ContainerRenderer, {
		target: searchTarget,
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
		target: searchTarget,
		title: () => context.translate.$t('search.advanced.heading'),
		variant: 'list',
	});
	const advancedQuery = wrapParallel(
		context,
		'advanced',
		createFormFieldNode(queryFieldId(context, 'advanced'), queryBuilderController, QueryBuilderField, {
			options: createQueryBuilderOptions(context),
		}),
	);
	advancedForm.addChildren(advancedQuery, sharedWithin, sharedFilters);
	return advancedForm;
}

function createExtendedPatternForm(context: BuildContext, sharedWithin: FormFieldNode | null, sharedFilters: FormNode | null) {
	const extendedForm = context.builder.newForm(ids.searchForm('extended'), ContainerRenderer, {
		target: searchTarget,
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
	const simpleForm = context.builder.newForm(ids.searchForm('simple'), ContainerRenderer, {
		target: searchTarget,
		title: () => context.translate.$t('search.simple.heading'),
	});
	const simpleQuery = wrapParallel(
		context,
		'simple',
		context.nodeConstructors.annotation({ id: annotation.id, annotatedFieldId: annotation.annotatedFieldId }, { id: queryFieldId(context, 'simple'), variant: ['large', 'simple'] }),
	);
	simpleForm.addChildren(simpleQuery);
	return simpleForm;
}

export { useSearchFormSystem, createSearchFormSystem };
