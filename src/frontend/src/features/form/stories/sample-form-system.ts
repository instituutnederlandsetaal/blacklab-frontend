import { markRaw } from 'vue';

import {
	annotationController,
	ControllerRegistry,
	createFormState,
	createFormSystemRuntime,
	expertQueryController,
	filterController,
	FormBuilder,
	headingView,
	parallelController,
	registerBuiltinControllers,
	registerBuiltinViews,
	summaryView,
	totalsView,
	type FormRuntimeContext,
	type FormState,
	type FormSystemDefinition,
	type PersistableSubmittableFormState,
	withinController,
} from '../index';
import type { MetadataFilterFieldConfig } from '../model/controllers/metadata-filter-controller';
import type { FormContainerNode, FormFieldNode } from '../model/types/form-shape';

import ContainerRendererFilters from '../ui/ContainerRendererFilters.vue';

const languageOptions = [
	{ value: 'en', label: 'English' },
	{ value: 'nl', label: 'Dutch' },
	{ value: 'de', label: 'German' },
	{ value: 'fr', label: 'French' },
];

export const metadataFilters = {
	author: {
		id: 'author',
		componentName: 'filter-autocomplete',
		defaultDisplayName: 'Author',
		defaultDescription: 'One or more author names.',
		groupId: 'bibliographic',
		metadata: async (term: string) => ['Austen', 'Baldwin', 'Brinkman', 'Couperus', 'Diderot', 'Eliot'].filter(value => value.toLowerCase().startsWith(term.toLowerCase())),
	},
	genre: {
		id: 'genre',
		componentName: 'filter-checkbox',
		defaultDisplayName: 'Genre',
		groupId: 'bibliographic',
		metadata: [
			{ value: 'fiction', label: 'Fiction' },
			{ value: 'essay', label: 'Essay' },
			{ value: 'newspaper', label: 'Newspaper' },
		],
	},
	year: {
		id: 'year',
		componentName: 'filter-range',
		defaultDisplayName: 'Year',
		groupId: 'bibliographic',
	},
	language: {
		id: 'language',
		componentName: 'filter-select',
		defaultDisplayName: 'Language',
		groupId: 'technical',
		metadata: languageOptions,
	},
	date: {
		id: 'date',
		componentName: 'filter-date',
		defaultDisplayName: 'Publication date',
		groupId: 'technical',
		metadata: { field: 'date', range: true, min: '16000101', max: '20251231' },
	},
} satisfies Record<string, MetadataFilterFieldConfig>;

type MetadataFilterId = keyof typeof metadataFilters;

type FilterGroup = {
	id: string;
	title: string;
	subtabs: Array<{
		id: string;
		title?: string;
		fields: MetadataFilterId[];
	}>;
};

export const filterGroups: FilterGroup[] = [
	{
		id: 'bibliographic',
		title: 'Bibliographic',
		subtabs: [
			{
				id: 'identity',
				title: 'Identity',
				fields: ['author', 'genre'],
			},
			{
				id: 'period',
				title: 'Period',
				fields: ['year'],
			},
		],
	},
	{
		id: 'technical',
		title: 'Technical',
		subtabs: [
			{
				id: 'technical-fields',
				fields: ['language', 'date'],
			},
		],
	},
];

export type StoryFormSystemModel = {
	context: FormRuntimeContext;
	definition: FormSystemDefinition;
	initialState?: FormState;
	initialSubmitted?: PersistableSubmittableFormState;
};

function createStoryBuilder(indexId: string) {
	const controllerRegistry = new ControllerRegistry();
	registerBuiltinControllers(controllerRegistry);
	registerBuiltinViews(controllerRegistry);

	return {
		builder: new FormBuilder(controllerRegistry),
		context: {
			controllerRegistry,
			corpus: {
				indexId,
				textDirection: 'ltr',
			},
		} satisfies FormRuntimeContext,
	};
}

export function createSearchFormStoryModel(): StoryFormSystemModel {
	const { builder, context } = createStoryBuilder('storybook-corpus');
	const root = builder.newContainer('search', { title: 'Search', config: { variant: 'tabs' } });
	const shared = createSharedSearchSections(builder, 'search.shared');

	root.addChildren(createSimpleForm(builder, shared), createExtendedForm(builder, shared), createExpertForm(builder, shared));

	return {
		context,
		definition: builder.build(),
	};
}

export function createRestoredSearchFormStoryModel(): StoryFormSystemModel {
	const model = createSearchFormStoryModel();
	const initialState = createFormState(model.definition, model.context);

	initialState.uiState.activeContainers.search = 'search.extended';
	initialState.uiState.activeContainers['search.extended.annotations'] = 'search.extended.annotations.main';
	initialState.uiState.activeContainers['search.shared.filters'] = 'search.shared.filters.bibliographic';
	initialState.controllerState['search.shared.parallel'] = { source: 'contents__en', targets: ['contents__nl'], alignBy: 's' };
	initialState.controllerState['search.extended.word'] = { value: 'water', caseSensitive: false };
	initialState.controllerState['search.shared.within'] = { element: 's', attributes: { speaker: 'narrator' } };
	initialState.controllerState['search.shared.filter.genre'] = { fiction: true, essay: false, newspaper: false };

	return {
		...model,
		initialState,
		initialSubmitted: createFormSystemRuntime(model.definition, model.context, initialState).submit('search.extended'),
	};
}

export function createControllerCatalogStoryModel(): StoryFormSystemModel {
	const { builder, context } = createStoryBuilder('storybook-catalog');
	const root = builder.newContainer('catalog', { title: 'Controller Catalog', config: { variant: 'tabs' } });
	const fields = builder.newForm('catalog.fields', { title: 'Built-in fields' });

	fields.addChildren(
		builder.newField('catalog.annotation.word', annotationController, {
			annotationId: 'word',
			displayName: 'Word',
			caseSensitive: true,
			uiType: 'combobox',
		}),
		builder.newField('catalog.annotation.pos', annotationController, {
			annotationId: 'pos',
			displayName: 'Part of speech',
			uiType: 'select',
			options: [
				{ value: 'NOU', label: 'Noun' },
				{ value: 'VRB', label: 'Verb' },
				{ value: 'ADJ', label: 'Adjective' },
			],
		}),
		builder.newField('catalog.parallel', parallelController, createParallelConfig()),
		builder.newField('catalog.within', withinController, createWithinConfig()),
		builder.newField('catalog.raw-cql', expertQueryController, {
			label: 'Expert CQL',
			helpUrl: 'https://blacklab.ivdnt.org/guide/corpus-query-language.html',
			rows: 4,
		}),
		builder.newView('catalog.summary', summaryView, { showRaw: true }),
	);

	const filters = builder.newForm('catalog.filters', { title: 'Filter controllers' });
	filters.addChildren(createFilterContainer(builder, 'catalog'));
	root.addChildren(fields, filters);

	return {
		context,
		definition: builder.build(),
	};
}

export function createFilterPanelStoryModel(): StoryFormSystemModel {
	const { builder, context } = createStoryBuilder('storybook-filters');
	const root = builder.newForm('filter-panel.form', { title: 'Metadata filters' });
	root.addChildren(
		builder.newView('filter-panel.heading', headingView, {
			title: 'Metadata filters',
			description: 'Specialized container rendering with grouped filter summaries.',
		}),
		createFilterContainer(builder, 'filter-panel'),
		builder.newView('filter-panel.summary', summaryView, { title: 'Live filter query', showRaw: true }),
	);

	const definition = builder.build();
	const initialState = createFormState(definition, context);
	initialState.uiState.activeContainers['filter-panel.filters'] = 'filter-panel.filters.bibliographic';
	initialState.controllerState['filter-panel.filter.author'] = 'Austen';
	initialState.controllerState['filter-panel.filter.genre'] = { fiction: true };
	initialState.controllerState['filter-panel.filter.year'] = { low: '1800', high: '1900' };

	return {
		context,
		definition,
		initialState,
		initialSubmitted: createFormSystemRuntime(definition, context, initialState).submit('filter-panel.form'),
	};
}

type SharedSearchSections = {
	filters: FormContainerNode;
	parallel: FormFieldNode<any>;
	within: FormFieldNode<any>;
};

function createSharedSearchSections(builder: FormBuilder, prefix: string): SharedSearchSections {
	return {
		filters: createFilterContainer(builder, prefix),
		parallel: builder.newField(`${prefix}.parallel`, parallelController, createParallelConfig()),
		within: builder.newField(`${prefix}.within`, withinController, createWithinConfig()),
	};
}

function createSimpleForm(builder: FormBuilder, shared: SharedSearchSections) {
	const form = builder.newForm('search.simple', { title: 'Simple' });
	form.addChildren(
		shared.parallel,
		builder.newField('search.simple.word', annotationController, {
			annotationId: 'word',
			displayName: 'Word',
			description: 'Search the main annotation.',
			caseSensitive: true,
			uiType: 'combobox',
			variant: 'large',
		}),
		builder.newView('search.simple.summary', summaryView, { title: 'Live query preview', showRaw: true }),
		builder.newView('search.simple.totals', totalsView, { baseDocuments: 128345, baseTokens: 48291032 }),
	);
	return form;
}

function createExtendedForm(builder: FormBuilder, shared: SharedSearchSections) {
	const form = builder.newForm('search.extended', { title: 'Extended' });
	const body = builder.newContainer('search.extended.body', { class: 'blf-columns' });
	const patternColumn = builder.newContainer('search.extended.pattern', { title: 'Pattern' });
	const annotationTabs = builder.newContainer('search.extended.annotations', { config: { variant: 'tabs' } });
	const mainAnnotations = builder.newContainer('search.extended.annotations.main', { title: 'Main', config: { combine: 'allOf' } });
	const grammarAnnotations = builder.newContainer('search.extended.annotations.grammar', { title: 'Grammar', config: { combine: 'allOf' } });

	mainAnnotations.addChildren(
		builder.newField('search.extended.word', annotationController, { annotationId: 'word', displayName: 'Word', caseSensitive: true, uiType: 'combobox' }),
		builder.newField('search.extended.lemma', annotationController, { annotationId: 'lemma', displayName: 'Lemma', caseSensitive: true, uiType: 'combobox' }),
	);
	grammarAnnotations.addChildren(
		builder.newField('search.extended.pos', annotationController, {
			annotationId: 'pos',
			displayName: 'Part of speech',
			uiType: 'select',
			options: [
				{ value: 'NOU', label: 'Noun' },
				{ value: 'VRB', label: 'Verb' },
				{ value: 'ADJ', label: 'Adjective' },
			],
		}),
	);
	annotationTabs.addChildren(mainAnnotations, grammarAnnotations);
	patternColumn.addChildren(shared.parallel, annotationTabs, shared.within);

	const filterColumn = builder.newContainer('search.extended.filters.column', { title: 'Filters' });
	filterColumn.addChildren(
		shared.filters,
		builder.newView('search.extended.filterSummary', summaryView, { title: 'Filter summary', showRaw: true }),
		builder.newView('search.extended.filterTotals', totalsView, { baseDocuments: 128345, baseTokens: 48291032 }),
	);

	body.addChildren(patternColumn, filterColumn);
	form.addChildren(body);
	return form;
}

function createExpertForm(builder: FormBuilder, shared: SharedSearchSections) {
	const form = builder.newForm('search.expert', { title: 'Expert' });
	const body = builder.newContainer('search.expert.body', { class: 'blf-columns' });
	const queryColumn = builder.newContainer('search.expert.query');
	const filtersColumn = builder.newContainer('search.expert.filters.column', { title: 'Filters' });

	queryColumn.addChildren(
		shared.parallel,
		builder.newField('search.expert.querybox', expertQueryController, {
			label: 'Corpus Query Language',
			rows: 8,
			helpUrl: 'https://blacklab.ivdnt.org/guide/corpus-query-language.html',
		}),
		shared.within,
	);
	filtersColumn.addChildren(shared.filters, builder.newView('search.expert.summary', summaryView, { title: 'Submitted shape', showRaw: true }));
	body.addChildren(queryColumn, filtersColumn);
	form.addChildren(body);
	return form;
}

function createFilterContainer(builder: FormBuilder, prefix: string) {
	const tabs = builder.newContainer(`${prefix}.filters`, {
		class: 'blf-filter-panel',
		component: markRaw(ContainerRendererFilters),
		config: { variant: 'small-tabs', combine: 'allOf' },
	});

	for (const group of filterGroups) {
		const groupContainer = builder.newContainer(`${prefix}.filters.${group.id}`, { title: group.title, config: { combine: 'allOf' } });
		for (const subtab of group.subtabs) {
			const subtabContainer = builder.newContainer(`${prefix}.filters.${group.id}.${subtab.id}`, { title: subtab.title, config: { combine: 'allOf' } });
			for (const fieldId of subtab.fields) {
				subtabContainer.addChildren(
					builder.newField(`${prefix}.filter.${fieldId}`, filterController, {
						...metadataFilters[fieldId],
						groupId: groupContainer.id,
					}),
				);
			}
			groupContainer.addChildren(subtabContainer);
		}
		tabs.addChildren(groupContainer);
	}

	return tabs;
}

function createParallelConfig() {
	return {
		sourceOptions: languageOptions.map(option => ({ ...option, value: `contents__${option.value}` })),
		targetOptions: languageOptions.map(option => ({ ...option, value: `contents__${option.value}` })),
		alignByOptions: [
			{ value: 's', label: 'Sentence' },
			{ value: 'p', label: 'Paragraph' },
		],
	};
}

function createWithinConfig() {
	return {
		options: [
			{ value: '', label: 'Document' },
			{ value: 's', label: 'Sentence', attributes: [{ value: 'speaker', label: 'Speaker' }] },
			{ value: 'p', label: 'Paragraph' },
		],
	};
}
