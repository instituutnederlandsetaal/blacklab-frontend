import { markRaw } from 'vue';

import {
	annotationPosController,
	annotationSelectController,
	annotationTextController,
	ControllerRegistry,
	createFormState,
	createFormSystemRuntime,
	expertQueryController,
	filterAutocompleteController,
	filterCheckboxController,
	filterDateController,
	filterRangeController,
	FormBuilder,
	headingView,
	parallelController,
	filterSelectController,
	registerBuiltinControllers,
	registerBuiltinViews,
	summaryView,
	totalsView,
	type FormRuntimeContext,
	type FormState,
	type FormSystemDefinition,
	type FieldController,
	type PersistableSubmittableFormState,
	withinController,
} from '../index';
import { createAnnotationPosSelectionKey, type AnnotationPosFieldConfig, type AnnotationReference } from '../fields/annotation-pos-field';
import type { MetadataFilterConfig } from '../model/controllers/metadata-filter-controller';
import type { FormContainerNode, FormFieldNode } from '../model/types/form-shape';

import ContainerRendererFilters from '../ui/ContainerRendererFilters.vue';
import { createMockI18n } from '@/shared/i18n';
import type { Tagset } from '@/types/apptypes';

import sampleTagsetJson from './sample-tagset.json';

const translate = createMockI18n().translate;

const languageOptions = [
	{ value: 'en', label: 'English' },
	{ value: 'nl', label: 'Dutch' },
	{ value: 'de', label: 'German' },
	{ value: 'fr', label: 'French' },
];

const posAnnotation: AnnotationReference = {
	id: 'pos',
	defaultDisplayName: 'Part of speech',
	defaultDescription: 'Filter by part of speech and compatible grammatical features.',
};

const posTagset: Tagset = sampleTagsetJson;

function humanizeAnnotationId(value: string): string {
	return value
		.split(/[_-]+/)
		.map(part => (part.toLowerCase() === 'pos' ? 'PoS' : part.charAt(0).toUpperCase() + part.slice(1)))
		.join(' ');
}

const posSubAnnotations = Object.fromEntries(
	Object.keys(posTagset.subAnnotations).map(id => [
		id,
		{
			id,
			defaultDisplayName: humanizeAnnotationId(id),
			defaultDescription: '',
		},
	]),
) satisfies Record<string, AnnotationReference>;

function createAnnotationPosConfig(overrides: Partial<AnnotationPosFieldConfig> = {}): AnnotationPosFieldConfig {
	return {
		annotation: posAnnotation,
		subAnnotations: posSubAnnotations,
		tagset: posTagset,
		showQueryPreview: true,
		...overrides,
	};
}

type MetadataFilterDefinition = {
	buildField: (builder: FormBuilder, id: string, groupId: string) => FormFieldNode<any>;
};

function defineMetadataFilter<Config extends MetadataFilterConfig>(controller: FieldController<string, any, Config>, config: Config): MetadataFilterDefinition {
	return {
		buildField(builder, id, groupId) {
			return builder.newField(id, controller, {
				...config,
				groupId,
			});
		},
	};
}

export const metadataFilters = {
	author: defineMetadataFilter(filterAutocompleteController, {
		id: 'author',
		metadataFieldId: 'author',
		displayName: 'Author',
		description: 'One or more author names.',
		groupId: 'bibliographic',
		autocomplete: async (term: string) => ['Austen', 'Baldwin', 'Brinkman', 'Couperus', 'Diderot', 'Eliot'].filter(value => value.toLowerCase().startsWith(term.toLowerCase())),
	}),
	genre: defineMetadataFilter(filterCheckboxController, {
		id: 'genre',
		metadataFieldId: 'genre',
		displayName: 'Genre',
		groupId: 'bibliographic',
		options: [
			{ value: 'fiction', label: 'Fiction' },
			{ value: 'essay', label: 'Essay' },
			{ value: 'newspaper', label: 'Newspaper' },
		],
	}),
	year: defineMetadataFilter(filterRangeController, {
		id: 'year',
		metadataFieldId: 'year',
		displayName: 'Year',
		groupId: 'bibliographic',
	}),
	language: defineMetadataFilter(filterSelectController, {
		id: 'language',
		metadataFieldId: 'language',
		displayName: 'Language',
		groupId: 'technical',
		multiple: true,
		options: languageOptions,
	}),
	date: defineMetadataFilter(filterDateController, {
		id: 'date',
		metadataFieldId: 'publication_date',
		displayName: 'Publication date',
		groupId: 'technical',
		field: 'date',
		range: true,
		min: '16000101',
		max: '20251231',
	}),
} satisfies Record<string, MetadataFilterDefinition>;

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
			corpus: {
				indexId,
				textDirection: 'ltr',
			},
			translate,
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
		builder.newField('catalog.annotation.word', annotationTextController, {
			annotationId: 'word',
			displayName: 'Word',
			caseSensitive: true,
		}),
		builder.newField('catalog.annotation.pos', annotationPosController, createAnnotationPosConfig()),
		builder.newField('catalog.parallel', parallelController, createParallelConfig()),
		builder.newField('catalog.within', withinController, createWithinConfig()),
		builder.newField('catalog.raw-cql', expertQueryController, {
			label: 'Expert CQL',
			helpUrl: 'https://blacklab.ivdnt.org/guide/corpus-query-language.html',
			rows: 4,
		}),
		builder.newView('catalog.summary', summaryView, { showRaw: true }),
	);

	const filters = builder.newForm('catalog.filter-controllers', { title: 'Filter controllers' });
	filters.addChildren(createFilterContainer(builder, 'catalog'));
	root.addChildren(fields, filters);

	return {
		context,
		definition: builder.build(),
	};
}

export function createAnnotationPosStoryModel(): StoryFormSystemModel {
	const { builder, context } = createStoryBuilder('storybook-pos-tagset');
	const form = builder.newForm('pos-editor.form', { title: 'PoS editor' });

	form.addChildren(
		builder.newView('pos-editor.heading', headingView, {
			title: 'Production tagset PoS editor',
			description: 'Loaded from sample-tagset.json. Open the editor, adjust the PoS value and subtags, and inspect the live query and serialized snapshot.',
		}),
		builder.newField('pos-editor.field', annotationPosController, createAnnotationPosConfig()),
		builder.newView('pos-editor.summary', summaryView, {
			title: 'Live query preview',
			showRaw: true,
		}),
	);

	const definition = builder.build();
	const initialState = createFormState(definition, context);
	initialState.controllerState['pos-editor.field'] = {
		annotationValue: 'NOU-P',
		selected: {
			[createAnnotationPosSelectionKey('NOU-P', 'pos_type', 'per')]: true,
		},
	};

	return {
		context,
		definition,
		initialState,
		initialSubmitted: createFormSystemRuntime(definition, context, initialState).submit('pos-editor.form'),
	};
}

export function createFilterPanelStoryModel(): StoryFormSystemModel {
	const { builder, context } = createStoryBuilder('storybook-filters');
	const root = builder.newForm('filter-panel.form');
	root.addChildren(
		builder.newView('filter-panel.heading', headingView, {
			title: 'Filter search by ...',
			description: 'Specialized container rendering with grouped filter summaries.',
		}),
		createFilterContainer(builder, 'filter-panel'),
		builder.newView('filter-panel.summary', summaryView, { title: 'Live filter query', showRaw: true }),
	);

	const definition = builder.build();
	const initialState = createFormState(definition, context);
	initialState.uiState.activeContainers['filter-panel.filters'] = 'filter-panel.filters.bibliographic';
	initialState.controllerState['filter-panel.filter.author'] = { value: 'Austen', caseSensitive: false };
	initialState.controllerState['filter-panel.filter.genre'] = { fiction: true };
	initialState.controllerState['filter-panel.filter.year'] = { low: '1800', high: '1900' };

	return {
		context,
		definition,
		initialState,
		initialSubmitted: createFormSystemRuntime(definition, context, initialState).submit('filter-panel.form'),
	};
}

export function createLegacyFilterComparisonStoryModel(): StoryFormSystemModel {
	const { builder, context } = createStoryBuilder('storybook-legacy-filter-comparison');
	const root = builder.newForm('legacy-filter-comparison.form');
	const tabs = builder.newContainer('legacy-filter-comparison.filters', {
		component: markRaw(ContainerRendererFilters),
		config: { variant: 'small-tabs', combine: 'allOf' },
	});

	const letter = builder.newContainer('legacy-filter-comparison.filters.letter', { title: 'Letter', config: { combine: 'allOf' } });
	letter.addChildren(
		builder.newField('legacy-filter-comparison.filter.year', filterRangeController, {
			id: 'datum_jaar',
			metadataFieldId: 'datum_jaar',
			displayName: 'Year (id: datum_jaar)',
			groupId: letter.id,
		}),
		builder.newField('legacy-filter-comparison.field.type', annotationSelectController, {
			annotationId: 'type_brief',
			displayName: 'Text type (id: type_brief)',
			options: [
				{ value: '', label: 'Text type' },
				{ value: 'personal', label: 'Personal' },
				{ value: 'official', label: 'Official' },
				{ value: 'business', label: 'Business' },
			],
		}),
		builder.newField('legacy-filter-comparison.field.autograph', annotationSelectController, {
			annotationId: 'autograaf',
			displayName: 'Autograph (id: autograaf)',
			options: [
				{ value: '', label: 'Autograph' },
				{ value: 'yes', label: 'Yes' },
				{ value: 'no', label: 'No' },
			],
		}),
		builder.newField('legacy-filter-comparison.field.signature', annotationSelectController, {
			annotationId: 'signatuur',
			displayName: 'Signature (id: signatuur)',
			options: [
				{ value: '', label: 'Signature' },
				{ value: 'signed', label: 'Signed' },
				{ value: 'unsigned', label: 'Unsigned' },
			],
		}),
	);

	const sender = builder.newContainer('legacy-filter-comparison.filters.sender', { title: 'Sender', config: { combine: 'allOf' } });
	sender.addChildren(
		builder.newField('legacy-filter-comparison.sender.name', filterAutocompleteController, {
			id: 'afz_naam',
			metadataFieldId: 'afz_naam',
			displayName: 'Sender (id: afz_naam)',
			groupId: sender.id,
			autocomplete: async (term: string) => ['Anna', 'Brecht', 'Clara', 'Diderik'].filter(value => value.toLowerCase().startsWith(term.toLowerCase())),
		}),
	);

	const addressee = builder.newContainer('legacy-filter-comparison.filters.addressee', { title: 'Addressee', config: { combine: 'allOf' } });
	addressee.addChildren(
		builder.newField('legacy-filter-comparison.addressee.name', filterAutocompleteController, {
			id: 'adr_naam',
			metadataFieldId: 'adr_naam',
			displayName: 'Addressee (id: adr_naam)',
			groupId: addressee.id,
			autocomplete: async (term: string) => ['Beatrix', 'Cornelia', 'Dirk', 'Els'].filter(value => value.toLowerCase().startsWith(term.toLowerCase())),
		}),
	);

	const sentFrom = builder.newContainer('legacy-filter-comparison.filters.sent-from', { title: 'Sent from', config: { combine: 'allOf' } });
	sentFrom.addChildren(
		builder.newField('legacy-filter-comparison.sent-from.place', filterAutocompleteController, {
			id: 'verz_plaats',
			metadataFieldId: 'verz_plaats',
			displayName: 'Sent from (id: verz_plaats)',
			groupId: sentFrom.id,
			autocomplete: async (term: string) => ['Amsterdam', 'Bruges', 'Ghent', 'Leiden'].filter(value => value.toLowerCase().startsWith(term.toLowerCase())),
		}),
	);

	tabs.addChildren(letter, sender, addressee, sentFrom);
	root.addChildren(tabs);

	const definition = builder.build();
	const initialState = createFormState(definition, context);
	initialState.uiState.activeContainers['legacy-filter-comparison.filters'] = letter.id;

	return {
		context,
		definition,
		initialState,
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
		builder.newField('search.simple.word', annotationTextController, {
			annotationId: 'word',
			displayName: 'Word',
			description: 'Search the main annotation.',
			caseSensitive: true,
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
		builder.newField('search.extended.word', annotationTextController, { annotationId: 'word', displayName: 'Word', caseSensitive: true }),
		builder.newField('search.extended.lemma', annotationTextController, { annotationId: 'lemma', displayName: 'Lemma', caseSensitive: true }),
	);
	grammarAnnotations.addChildren(
		builder.newField('search.extended.pos', annotationPosController, createAnnotationPosConfig({ groupId: grammarAnnotations.id })),
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
				const definition = metadataFilters[fieldId];
				subtabContainer.addChildren(definition.buildField(builder, `${prefix}.filter.${fieldId}`, groupContainer.id));
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
