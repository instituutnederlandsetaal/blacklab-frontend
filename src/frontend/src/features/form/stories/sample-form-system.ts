import { markRaw } from 'vue';

import type { Tagset } from '@/types/apptypes';

import { createAnnotationPosSelectionKey, type AnnotationPosFieldConfig, type AnnotationReference } from '../fields/annotation-pos-field';
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
import type { MetadataFilterConfig } from '../model/controllers/metadata-filter-controller';
import type { FormContainerNode, FormFieldNode } from '../model/types/form-shape';
import sampleTagsetJson from './sample-tagset.json';

import { createMockI18n } from '@/shared/i18n';

import ContainerRendererFilters from '../ui/ContainerRendererFilters.vue';

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

const posSubAnnotations = Object.keys(posTagset.subAnnotations).reduce<Record<string, AnnotationReference>>((annotations, id) => {
	annotations[id] = {
		id,
		defaultDisplayName: id
			.split(/[_-]+/)
			.map(part => (part.toLowerCase() === 'pos' ? 'PoS' : part.charAt(0).toUpperCase() + part.slice(1)))
			.join(' '),
		defaultDescription: '',
	};
	return annotations;
}, {});

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
	const shared: SharedSearchSections = {
		filters: createFilterContainer(builder, 'search.shared'),
		parallel: builder.newField('search.shared.parallel', parallelController, createParallelConfig()),
		within: builder.newField('search.shared.within', withinController, createWithinConfig()),
	};

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
	const fields = builder
		.newForm('catalog.fields', { title: 'Built-in fields' })
		.addField('catalog.annotation.word', annotationTextController, {
			annotationId: 'word',
			displayName: 'Word',
			caseSensitive: true,
		})
		.addField('catalog.annotation.pos', annotationPosController, createAnnotationPosConfig())
		.addField('catalog.parallel', parallelController, createParallelConfig())
		.addField('catalog.within', withinController, createWithinConfig())
		.addField('catalog.raw-cql', expertQueryController, {
			label: 'Expert CQL',
			helpUrl: 'https://blacklab.ivdnt.org/guide/corpus-query-language.html',
			rows: 4,
		})
		.addChildren(builder.newView('catalog.summary', summaryView, { showRaw: true }));

	const filters = builder.newForm('catalog.filter-controllers', { title: 'Filter controllers' }).addChildren(createFilterContainer(builder, 'catalog'));
	root.addChildren(fields, filters);

	return {
		context,
		definition: builder.build(),
	};
}

export function createAnnotationPosStoryModel(): StoryFormSystemModel {
	const { builder, context } = createStoryBuilder('storybook-pos-tagset');
	builder
		.newForm('pos-editor.form', { title: 'PoS editor' })
		.addView('pos-editor.form.heading', headingView, {
			title: 'Production tagset PoS editor',
			description: 'Loaded from sample-tagset.json. Open the editor, adjust the PoS value and subtags, and inspect the live query and serialized snapshot.',
		})
		.addField('pos-editor.field', annotationPosController, createAnnotationPosConfig())
		.addView('pos-editor.summary', summaryView, {
			title: 'Live query preview',
			showRaw: true,
		});

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
	builder
		.newForm('filter-panel.form')
		.addChildren(
			builder.newView('filter-panel.heading', headingView, {
				title: 'Filter search by ...',
				description: 'Specialized container rendering with grouped filter summaries.',
			}),
		)
		.addChildren(createFilterContainer(builder, 'filter-panel'))
		.addChildren(builder.newView('filter-panel.summary', summaryView, { title: 'Live filter query', showRaw: true }));

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
	letter
		.newField('legacy-filter-comparison.filter.year', filterRangeController, {
			id: 'datum_jaar',
			metadataFieldId: 'datum_jaar',
			displayName: 'Year (id: datum_jaar)',
			groupId: letter.id,
		})
		.newField('legacy-filter-comparison.field.type', annotationSelectController, {
			annotationId: 'type_brief',
			displayName: 'Text type (id: type_brief)',
			options: [
				{ value: '', label: 'Text type' },
				{ value: 'personal', label: 'Personal' },
				{ value: 'official', label: 'Official' },
				{ value: 'business', label: 'Business' },
			],
		})
		.newField('legacy-filter-comparison.field.autograph', annotationSelectController, {
			annotationId: 'autograaf',
			displayName: 'Autograph (id: autograaf)',
			options: [
				{ value: '', label: 'Autograph' },
				{ value: 'yes', label: 'Yes' },
				{ value: 'no', label: 'No' },
			],
		})
		.newField('legacy-filter-comparison.field.signature', annotationSelectController, {
			annotationId: 'signatuur',
			displayName: 'Signature (id: signatuur)',
			options: [
				{ value: '', label: 'Signature' },
				{ value: 'signed', label: 'Signed' },
				{ value: 'unsigned', label: 'Unsigned' },
			],
		});

	const sender = builder.newContainer('legacy-filter-comparison.filters.sender', { title: 'Sender', config: { combine: 'allOf' } });
	sender.newField('legacy-filter-comparison.sender.name', filterAutocompleteController, {
		id: 'afz_naam',
		metadataFieldId: 'afz_naam',
		displayName: 'Sender (id: afz_naam)',
		groupId: sender.id,
		autocomplete: async (term: string) => ['Anna', 'Brecht', 'Clara', 'Diderik'].filter(value => value.toLowerCase().startsWith(term.toLowerCase())),
	});

	const addressee = builder.newContainer('legacy-filter-comparison.filters.addressee', { title: 'Addressee', config: { combine: 'allOf' } });
	addressee.newField('legacy-filter-comparison.addressee.name', filterAutocompleteController, {
		id: 'adr_naam',
		metadataFieldId: 'adr_naam',
		displayName: 'Addressee (id: adr_naam)',
		groupId: addressee.id,
		autocomplete: async (term: string) => ['Beatrix', 'Cornelia', 'Dirk', 'Els'].filter(value => value.toLowerCase().startsWith(term.toLowerCase())),
	});

	const sentFrom = builder.newContainer('legacy-filter-comparison.filters.sent-from', { title: 'Sent from', config: { combine: 'allOf' } });
	sentFrom.newField('legacy-filter-comparison.sent-from.place', filterAutocompleteController, {
		id: 'verz_plaats',
		metadataFieldId: 'verz_plaats',
		displayName: 'Sent from (id: verz_plaats)',
		groupId: sentFrom.id,
		autocomplete: async (term: string) => ['Amsterdam', 'Bruges', 'Ghent', 'Leiden'].filter(value => value.toLowerCase().startsWith(term.toLowerCase())),
	});

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

type StandaloneFieldStoryInput<Config extends object, State> = {
	indexId: string;
	formId: string;
	title: string;
	description: string;
	controller: FieldController<string, State, Config>;
	config: Config;
	initialState?: State;
};

function createStandaloneFieldStoryModel<Config extends object, State>(input: StandaloneFieldStoryInput<Config, State>): StoryFormSystemModel {
	const { builder, context } = createStoryBuilder(input.indexId);
	const fieldId = `${input.formId}.field`;
	const form = builder
		.newForm(input.formId, { title: input.title })
		.addChildren(
			builder.newView(`${input.formId}.heading`, headingView, {
				title: input.title,
				description: input.description,
			}),
		)
		.addField(fieldId, input.controller, input.config)
		.addChildren(
			builder.newView(`${input.formId}.summary`, summaryView, {
				title: 'Live query preview',
				showRaw: true,
			}),
		);

	const definition = builder.build();
	const initialState = createFormState(definition, context);
	if (input.initialState !== undefined) {
		initialState.controllerState[fieldId] = input.initialState;
	}

	return {
		context,
		definition,
		initialState,
		initialSubmitted: createFormSystemRuntime(definition, context, initialState).submit(form.id),
	};
}

export function createParallelFieldStoryModel(): StoryFormSystemModel {
	return createStandaloneFieldStoryModel({
		indexId: 'storybook-parallel-field',
		formId: 'parallel-field.form',
		title: 'Parallel field',
		description: 'Standalone source, target, and alignment controls using the built-in parallel controller.',
		controller: parallelController,
		config: createParallelConfig(),
		initialState: {
			source: 'contents__en',
			targets: ['contents__nl'],
			alignBy: 's',
		},
	});
}

export function createWithinFieldStoryModel(): StoryFormSystemModel {
	return createStandaloneFieldStoryModel({
		indexId: 'storybook-within-field',
		formId: 'within-field.form',
		title: 'Within field',
		description: 'Segmented scope controls with optional inline attribute fields.',
		controller: withinController,
		config: createWithinConfig(),
		initialState: {
			element: 's',
			attributes: { speaker: 'narrator' },
		},
	});
}

export function createExpertQueryFieldStoryModel(): StoryFormSystemModel {
	return createStandaloneFieldStoryModel({
		indexId: 'storybook-expert-query-field',
		formId: 'expert-query-field.form',
		title: 'Expert query field',
		description: 'Raw CQL entry with the same live summary and serialization used by the full form runtime.',
		controller: expertQueryController,
		config: {
			label: 'Corpus Query Language',
			helpUrl: 'https://blacklab.ivdnt.org/guide/corpus-query-language.html',
			rows: 6,
		},
		initialState: {
			query: '[lemma="water"]',
			targetQueries: [],
		},
	});
}

export function createContainerTypesStoryModel(): StoryFormSystemModel {
	const { builder, context } = createStoryBuilder('storybook-container-types');
	const form = builder.newForm('container-types.form', { title: 'Container types' });

	const listContainer = builder
		.newContainer('container-types.list', {
			title: 'List container',
			config: { combine: 'allOf' },
		})
		.newField('container-types.list.word', annotationTextController, {
			annotationId: 'word',
			displayName: 'Word',
			placeholder: 'List child field',
			caseSensitive: true,
		})
		.newField('container-types.list.lemma', annotationTextController, {
			annotationId: 'lemma',
			displayName: 'Lemma',
			placeholder: 'Second list child',
			caseSensitive: true,
		});

	const tabbedContainer = builder.newContainer('container-types.tabs', {
		title: 'Tabbed container',
		config: { variant: 'tabs' },
	});
	const patternTab = builder.newContainer('container-types.tabs.pattern', { title: 'Pattern', config: { combine: 'allOf' } });
	patternTab
		.newField('container-types.tabs.pattern.word', annotationTextController, {
			annotationId: 'word',
			displayName: 'Word',
			caseSensitive: true,
		})
		.newField('container-types.tabs.pattern.pos', annotationPosController, createAnnotationPosConfig({ groupId: patternTab.id }));
	const scopeTab = builder
		.newContainer('container-types.tabs.scope', { title: 'Scope', config: { combine: 'allOf' } })
		.newField('container-types.tabs.scope.parallel', parallelController, createParallelConfig())
		.newField('container-types.tabs.scope.within', withinController, createWithinConfig());
	tabbedContainer.addChildren(patternTab, scopeTab);

	const smallTabsContainer = builder.newContainer('container-types.small-tabs', {
		title: 'Small tabs container',
		config: { variant: 'small-tabs' },
	});
	const metadataTab = builder.newContainer('container-types.small-tabs.metadata', { title: 'Metadata', config: { combine: 'allOf' } });
	metadataTab.addChildren(
		metadataFilters.author.buildField(builder, 'container-types.small-tabs.filter.author', metadataTab.id),
		metadataFilters.genre.buildField(builder, 'container-types.small-tabs.filter.genre', metadataTab.id),
	);
	const datesTab = builder.newContainer('container-types.small-tabs.dates', { title: 'Dates', config: { combine: 'allOf' } });
	datesTab.addChildren(
		metadataFilters.year.buildField(builder, 'container-types.small-tabs.filter.year', datesTab.id),
		metadataFilters.date.buildField(builder, 'container-types.small-tabs.filter.date', datesTab.id),
	);
	smallTabsContainer.addChildren(metadataTab, datesTab);

	const filterRendererWrapper = builder
		.newContainer('container-types.filter-renderer', {
			title: 'Custom filter renderer',
			config: { combine: 'allOf' },
		})
		.addChildren(createFilterContainer(builder, 'container-types.custom'));

	form.addChildren(
		builder.newView('container-types.heading', headingView, {
			title: 'Container presentations',
			description: 'The same form tree can render as a list, large tabs, compact tabs, or through a custom filter container component.',
		}),
		listContainer,
		tabbedContainer,
		smallTabsContainer,
		filterRendererWrapper,
	);

	const definition = builder.build();
	const initialState = createFormState(definition, context);
	initialState.uiState.activeContainers[tabbedContainer.id] = patternTab.id;
	initialState.uiState.activeContainers[smallTabsContainer.id] = metadataTab.id;
	initialState.uiState.activeContainers['container-types.custom.filters'] = 'container-types.custom.filters.bibliographic';
	initialState.controllerState['container-types.custom.filter.author'] = { value: 'Austen', caseSensitive: false };
	initialState.controllerState['container-types.custom.filter.genre'] = { fiction: true, essay: false, newspaper: false };

	return {
		context,
		definition,
		initialState,
		initialSubmitted: createFormSystemRuntime(definition, context, initialState).submit(form.id),
	};
}

export function createViewStoryModel(): StoryFormSystemModel {
	const { builder, context } = createStoryBuilder('storybook-views');
	const root = builder.newContainer('view-catalog', {
		title: 'Built-in views',
		config: { variant: 'tabs' },
	});

	const headingForm = builder.newForm('view-catalog.heading', { title: 'Heading' }).addChildren(
		builder.newView('view-catalog.heading.demo', headingView, {
			title: 'Heading view',
			description: 'Static titles and descriptions for form sections, placeholders, or explanatory copy.',
		}),
	);

	const summaryForm = builder
		.newForm('view-catalog.summary', { title: 'Summary' })
		.addChildren(
			builder.newView('view-catalog.summary.heading', headingView, {
				title: 'Summary view',
				description: 'Reflects the compiled query and summary entries for the active form.',
			}),
		)
		.addField('view-catalog.summary.word', annotationTextController, {
			annotationId: 'word',
			displayName: 'Word',
			caseSensitive: true,
		})
		.addField('view-catalog.summary.pos', annotationPosController, createAnnotationPosConfig())
		.addChildren(
			builder.newView('view-catalog.summary.output', summaryView, {
				title: 'Compiled summary',
				showRaw: true,
			}),
		);

	const totalsForm = builder
		.newForm('view-catalog.totals', { title: 'Totals' })
		.addChildren(
			builder.newView('view-catalog.totals.heading', headingView, {
				title: 'Totals view',
				description: 'Uses the active form state to estimate the scoped document and token totals.',
			}),
		)
		.addField('view-catalog.totals.parallel', parallelController, createParallelConfig())
		.addField('view-catalog.totals.within', withinController, createWithinConfig())
		.addChildren(
			builder.newView('view-catalog.totals.output', totalsView, {
				title: 'Estimated totals',
				baseDocuments: 128345,
				baseTokens: 48291032,
			}),
		);

	root.addChildren(headingForm, summaryForm, totalsForm);

	const definition = builder.build();
	const initialState = createFormState(definition, context);
	initialState.uiState.activeContainers[root.id] = summaryForm.id;
	initialState.controllerState['view-catalog.summary.word'] = { value: 'water', caseSensitive: false };
	initialState.controllerState['view-catalog.summary.pos'] = {
		annotationValue: 'NOU-P',
		selected: {
			[createAnnotationPosSelectionKey('NOU-P', 'pos_type', 'per')]: true,
		},
	};
	initialState.controllerState['view-catalog.totals.parallel'] = {
		source: 'contents__en',
		targets: ['contents__nl'],
		alignBy: 's',
	};
	initialState.controllerState['view-catalog.totals.within'] = {
		element: 's',
		attributes: { speaker: 'narrator' },
	};

	return {
		context,
		definition,
		initialState,
		initialSubmitted: createFormSystemRuntime(definition, context, initialState).submit(summaryForm.id),
	};
}

export function createFullFormStoryModel(): StoryFormSystemModel {
	const { builder, context } = createStoryBuilder('storybook-full-form');
	const root = builder.newContainer('app', {
		config: { variant: 'tabs' },
	});
	const sharedFilters = createFilterContainer(builder, 'app.shared');
	const searchModes = createAppSearchModesContainer(builder, sharedFilters);
	const exploreModes = createAppExploreModesContainer(builder, sharedFilters);

	root.addChildren(searchModes, exploreModes);

	const definition = builder.build();
	const initialState = createFormState(definition, context);
	initialState.uiState.activeContainers[root.id] = searchModes.id;
	initialState.uiState.activeContainers[searchModes.id] = 'app.search.simple';
	initialState.uiState.activeContainers[exploreModes.id] = 'app.explore.documents';
	initialState.uiState.activeContainers['app.search.extended.annotations'] = 'app.search.extended.annotations.main';
	initialState.uiState.activeContainers['app.shared.filters'] = 'app.shared.filters.bibliographic';
	initialState.controllerState['app.shared.filter.author'] = { value: 'Austen', caseSensitive: false };
	initialState.controllerState['app.shared.filter.genre'] = { fiction: true, essay: false, newspaper: false };
	initialState.controllerState['app.shared.filter.language'] = ['en', 'nl'];
	initialState.controllerState['app.search.simple.parallel'] = {
		source: 'contents__en',
		targets: ['contents__nl'],
		alignBy: 's',
	};
	initialState.controllerState['app.search.simple.word'] = { value: 'water', caseSensitive: false };
	initialState.controllerState['app.search.simple.within'] = {
		element: 's',
		attributes: { speaker: 'narrator' },
	};
	initialState.controllerState['app.search.extended.parallel'] = {
		source: 'contents__en',
		targets: ['contents__de'],
		alignBy: 'p',
	};
	initialState.controllerState['app.search.extended.word'] = { value: 'water', caseSensitive: false };
	initialState.controllerState['app.search.extended.lemma'] = { value: 'ship', caseSensitive: false };
	initialState.controllerState['app.search.extended.pos'] = {
		annotationValue: 'NOU-P',
		selected: {
			[createAnnotationPosSelectionKey('NOU-P', 'pos_type', 'per')]: true,
		},
	};
	initialState.controllerState['app.search.extended.within'] = {
		element: 'p',
		attributes: {},
	};
	initialState.controllerState['app.search.advanced.preview'] = {
		query: '[word="water"][]{0,2}[lemma="ship"]',
		targetQueries: [],
	};
	initialState.controllerState['app.search.expert.querybox'] = {
		query: '[lemma="water"] within <s/>',
		targetQueries: [],
	};
	initialState.controllerState['app.search.expert.parallel'] = {
		source: 'contents__en',
		targets: ['contents__fr'],
		alignBy: 's',
	};
	initialState.controllerState['app.search.expert.within'] = {
		element: 's',
		attributes: {},
	};
	initialState.controllerState['app.explore.documents.groupBy'] = ['author'];
	initialState.controllerState['app.explore.documents.showAs'] = ['documents'];
	initialState.controllerState['app.explore.ngram.size'] = { low: '2', high: '3' };
	initialState.controllerState['app.explore.ngram.property'] = ['lemma'];
	initialState.controllerState['app.explore.ngram.seed'] = { value: 'water', caseSensitive: false };
	initialState.controllerState['app.explore.frequency.parallel'] = {
		source: 'contents__en',
		targets: ['contents__nl'],
		alignBy: 's',
	};
	initialState.controllerState['app.explore.frequency.annotation'] = ['pos'];
	initialState.controllerState['app.explore.frequency.seed'] = { value: 'ship', caseSensitive: false };

	return {
		context,
		definition,
		initialState,
		initialSubmitted: createFormSystemRuntime(definition, context, initialState).submit('app.search.simple'),
	};
}

type SharedSearchSections = {
	filters: FormContainerNode;
	parallel: FormFieldNode<any>;
	within: FormFieldNode<any>;
};

function createSimpleForm(builder: FormBuilder, shared: SharedSearchSections) {
	return builder
		.newForm('search.simple', { title: 'Simple' })
		.addChildren(shared.parallel)
		.addField('search.simple.word', annotationTextController, {
			annotationId: 'word',
			displayName: 'Word',
			description: 'Search the main annotation.',
			caseSensitive: true,
			variant: 'large',
		})
		.addChildren(
			builder.newView('search.simple.summary', summaryView, { title: 'Live query preview', showRaw: true }),
			builder.newView('search.simple.totals', totalsView, { baseDocuments: 128345, baseTokens: 48291032 }),
		);
}

function createExtendedForm(builder: FormBuilder, shared: SharedSearchSections) {
	const body = builder.newContainer('search.extended.body', { class: 'blf-columns' });
	const patternColumn = builder.newContainer('search.extended.pattern', { title: 'Pattern' });
	const annotationTabs = builder.newContainer('search.extended.annotations', { config: { variant: 'tabs' } });
	const mainAnnotations = builder
		.newContainer('search.extended.annotations.main', { title: 'Main', config: { combine: 'allOf' } })
		.newField('search.extended.word', annotationTextController, { annotationId: 'word', displayName: 'Word', caseSensitive: true })
		.newField('search.extended.lemma', annotationTextController, { annotationId: 'lemma', displayName: 'Lemma', caseSensitive: true });
	const grammarAnnotations = builder.newContainer('search.extended.annotations.grammar', { title: 'Grammar', config: { combine: 'allOf' } });
	grammarAnnotations.newField('search.extended.pos', annotationPosController, createAnnotationPosConfig({ groupId: grammarAnnotations.id }));
	annotationTabs.addChildren(mainAnnotations, grammarAnnotations);
	patternColumn.addChildren(shared.parallel, annotationTabs, shared.within);

	const filterColumn = builder
		.newContainer('search.extended.filters.column', { title: 'Filters' })
		.addChildren(
			shared.filters,
			builder.newView('search.extended.filterSummary', summaryView, { title: 'Filter summary', showRaw: true }),
			builder.newView('search.extended.filterTotals', totalsView, { baseDocuments: 128345, baseTokens: 48291032 }),
		);

	body.addChildren(patternColumn, filterColumn);
	return builder.newForm('search.extended', { title: 'Extended' }).addChildren(body);
}

function createExpertForm(builder: FormBuilder, shared: SharedSearchSections) {
	const queryColumn = builder
		.newContainer('search.expert.query')
		.addChildren(shared.parallel)
		.newField('search.expert.querybox', expertQueryController, {
			label: 'Corpus Query Language',
			rows: 8,
			helpUrl: 'https://blacklab.ivdnt.org/guide/corpus-query-language.html',
		})
		.addChildren(shared.within);
	const filtersColumn = builder
		.newContainer('search.expert.filters.column', { title: 'Filters' })
		.addChildren(shared.filters, builder.newView('search.expert.summary', summaryView, { title: 'Submitted shape', showRaw: true }));
	const body = builder.newContainer('search.expert.body', { class: 'blf-columns' }).addChildren(queryColumn, filtersColumn);
	return builder.newForm('search.expert', { title: 'Expert' }).addChildren(body);
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

function createSharedFilterColumn(builder: FormBuilder, prefix: string, sharedFilters: FormContainerNode) {
	return builder.newContainer(`${prefix}.filters`, { title: 'Shared filters' }).addChildren(
		sharedFilters,
		builder.newView(`${prefix}.filters.summary`, summaryView, {
			title: 'Shared filter summary',
			showRaw: true,
		}),
		builder.newView(`${prefix}.filters.totals`, totalsView, {
			title: 'Estimated totals',
			baseDocuments: 128345,
			baseTokens: 48291032,
		}),
	);
}

function createAppSearchModesContainer(builder: FormBuilder, sharedFilters: FormContainerNode) {
	return builder
		.newContainer('app.search', {
			title: 'Search',
			config: { variant: 'tabs' },
		})
		.addChildren(
			createAppSimpleSearchForm(builder, sharedFilters),
			createAppExtendedSearchForm(builder, sharedFilters),
			createAppAdvancedSearchForm(builder, sharedFilters),
			createAppExpertSearchForm(builder, sharedFilters),
		);
}

function createAppExploreModesContainer(builder: FormBuilder, sharedFilters: FormContainerNode) {
	return builder
		.newContainer('app.explore', {
			title: 'Explore',
			config: { variant: 'tabs' },
		})
		.addChildren(createAppDocumentsExploreForm(builder, sharedFilters), createAppNgramExploreForm(builder, sharedFilters), createAppFrequencyExploreForm(builder, sharedFilters));
}

function createAppSimpleSearchForm(builder: FormBuilder, sharedFilters: FormContainerNode) {
	const queryColumn = builder.newContainer('app.search.simple.query');
	queryColumn.addChildren(
		builder.newView('app.search.simple.heading', headingView, {
			title: 'Simple search',
			description: 'This form combines the new simple and large variants on built-in fields while keeping the shared filters alongside it.',
		}),
	);
	queryColumn
		.newField('app.search.simple.parallel', parallelController, {
			...createParallelConfig(),
			label: 'Parallel search',
			variant: 'simple',
		})
		.newField('app.search.simple.word', annotationTextController, {
			annotationId: 'word',
			displayName: 'Word or phrase',
			description: 'Large primary input rendered with the simple shell.',
			placeholder: 'Type a word, lemma, or phrase',
			caseSensitive: true,
			variant: ['simple', 'large'],
		})
		.newField('app.search.simple.within', withinController, {
			...createWithinConfig(),
			label: 'Scope',
			variant: 'simple',
		});
	queryColumn.addChildren(
		builder.newView('app.search.simple.summary', summaryView, {
			title: 'Live query preview',
			showRaw: true,
		}),
	);

	return builder
		.newForm('app.search.simple', { title: 'Simple' })
		.addChildren(builder.newContainer('app.search.simple.body', { class: 'blf-columns' }).addChildren(queryColumn, createSharedFilterColumn(builder, 'app.search.simple', sharedFilters)));
}

function createAppExtendedSearchForm(builder: FormBuilder, sharedFilters: FormContainerNode) {
	const patternColumn = builder.newContainer('app.search.extended.pattern', { title: 'Pattern' });
	const annotationTabs = builder.newContainer('app.search.extended.annotations', { config: { variant: 'tabs' } });
	const mainAnnotations = builder
		.newContainer('app.search.extended.annotations.main', { title: 'Main', config: { combine: 'allOf' } })
		.newField('app.search.extended.word', annotationTextController, {
			annotationId: 'word',
			displayName: 'Word',
			caseSensitive: true,
		})
		.newField('app.search.extended.lemma', annotationTextController, {
			annotationId: 'lemma',
			displayName: 'Lemma',
			caseSensitive: true,
		});
	const grammarAnnotations = builder.newContainer('app.search.extended.annotations.grammar', { title: 'Grammar', config: { combine: 'allOf' } });
	grammarAnnotations.newField('app.search.extended.pos', annotationPosController, createAnnotationPosConfig({ groupId: grammarAnnotations.id }));
	annotationTabs.addChildren(mainAnnotations, grammarAnnotations);

	patternColumn.addChildren(
		builder.newField('app.search.extended.parallel', parallelController, createParallelConfig()),
		annotationTabs,
		builder.newField('app.search.extended.within', withinController, createWithinConfig()),
		builder.newView('app.search.extended.summary', summaryView, {
			title: 'Compiled query',
			showRaw: true,
		}),
	);

	return builder
		.newForm('app.search.extended', { title: 'Extended' })
		.addChildren(builder.newContainer('app.search.extended.body', { class: 'blf-columns' }).addChildren(patternColumn, createSharedFilterColumn(builder, 'app.search.extended', sharedFilters)));
}

function createAppAdvancedSearchForm(builder: FormBuilder, sharedFilters: FormContainerNode) {
	const queryColumn = builder.newContainer('app.search.advanced.query');
	queryColumn.addChildren(
		builder.newView('app.search.advanced.heading', headingView, {
			title: 'Advanced query builder',
			description: 'Placeholder for the advanced builder surface. The story still shows how it will live inside the same search tab stack with the shared filters.',
		}),
	);
	queryColumn.newField('app.search.advanced.preview', expertQueryController, {
		label: 'Planned advanced output',
		rows: 5,
	});
	queryColumn.addChildren(
		builder.newView('app.search.advanced.summary', summaryView, {
			title: 'Current placeholder state',
			showRaw: true,
		}),
	);

	return builder
		.newForm('app.search.advanced', { title: 'Advanced (todo)' })
		.addChildren(builder.newContainer('app.search.advanced.body', { class: 'blf-columns' }).addChildren(queryColumn, createSharedFilterColumn(builder, 'app.search.advanced', sharedFilters)));
}

function createAppExpertSearchForm(builder: FormBuilder, sharedFilters: FormContainerNode) {
	const queryColumn = builder.newContainer('app.search.expert.query');
	queryColumn
		.newField('app.search.expert.parallel', parallelController, createParallelConfig())
		.newField('app.search.expert.querybox', expertQueryController, {
			label: 'Corpus Query Language',
			rows: 8,
			helpUrl: 'https://blacklab.ivdnt.org/guide/corpus-query-language.html',
		})
		.newField('app.search.expert.within', withinController, createWithinConfig());
	queryColumn.addChildren(
		builder.newView('app.search.expert.summary', summaryView, {
			title: 'Submitted shape',
			showRaw: true,
		}),
	);

	return builder
		.newForm('app.search.expert', { title: 'Expert' })
		.addChildren(builder.newContainer('app.search.expert.body', { class: 'blf-columns' }).addChildren(queryColumn, createSharedFilterColumn(builder, 'app.search.expert', sharedFilters)));
}

function createAppDocumentsExploreForm(builder: FormBuilder, sharedFilters: FormContainerNode) {
	const queryColumn = builder.newContainer('app.explore.documents.query');
	queryColumn.addChildren(
		builder.newView('app.explore.documents.heading', headingView, {
			title: 'Documents explore mode',
			description: 'Mirrors the explore tab with document grouping and presentation controls next to the same shared filters.',
		}),
	);
	queryColumn
		.newField('app.explore.documents.groupBy', filterSelectController, {
			id: 'documents-group-by',
			metadataFieldId: 'documents_group_by',
			displayName: 'Group documents by',
			groupId: 'app.explore.documents',
			options: [
				{ value: 'author', label: 'Author' },
				{ value: 'genre', label: 'Genre' },
				{ value: 'year', label: 'Year' },
			],
		})
		.newField('app.explore.documents.showAs', filterSelectController, {
			id: 'documents-show-as',
			metadataFieldId: 'documents_show_as',
			displayName: 'Show as',
			groupId: 'app.explore.documents',
			options: [
				{ value: 'table', label: 'Table' },
				{ value: 'documents', label: 'Documents' },
				{ value: 'tokens', label: 'Tokens' },
			],
		});
	queryColumn.addChildren(
		builder.newView('app.explore.documents.summary', summaryView, {
			title: 'Explore query',
			showRaw: true,
		}),
	);

	return builder
		.newForm('app.explore.documents', { title: 'Documents' })
		.addChildren(builder.newContainer('app.explore.documents.body', { class: 'blf-columns' }).addChildren(queryColumn, createSharedFilterColumn(builder, 'app.explore.documents', sharedFilters)));
}

function createAppNgramExploreForm(builder: FormBuilder, sharedFilters: FormContainerNode) {
	const queryColumn = builder.newContainer('app.explore.ngram.query');
	queryColumn.addChildren(
		builder.newView('app.explore.ngram.heading', headingView, {
			title: 'N-gram explore mode',
			description: 'A lightweight stand-in for the n-gram controls while the shared filters remain fixed across top-level tabs.',
		}),
	);
	queryColumn
		.newField('app.explore.ngram.size', filterRangeController, {
			id: 'ngram-size',
			metadataFieldId: 'ngram_size',
			displayName: 'N-gram size',
			groupId: 'app.explore.ngram',
			inputType: 'number',
			lowPlaceholder: 'From',
			highPlaceholder: 'To',
		})
		.newField('app.explore.ngram.property', annotationSelectController, {
			annotationId: 'ngram_property',
			displayName: 'Token property',
			options: [
				{ value: 'word', label: 'Word' },
				{ value: 'lemma', label: 'Lemma' },
				{ value: 'pos', label: 'Part of speech' },
			],
		})
		.newField('app.explore.ngram.seed', annotationTextController, {
			annotationId: 'word',
			displayName: 'Seed term',
			placeholder: 'Optional seed value',
			caseSensitive: true,
		});
	queryColumn.addChildren(
		builder.newView('app.explore.ngram.summary', summaryView, {
			title: 'Explore query',
			showRaw: true,
		}),
	);

	return builder
		.newForm('app.explore.ngram', { title: 'N-gram' })
		.addChildren(builder.newContainer('app.explore.ngram.body', { class: 'blf-columns' }).addChildren(queryColumn, createSharedFilterColumn(builder, 'app.explore.ngram', sharedFilters)));
}

function createAppFrequencyExploreForm(builder: FormBuilder, sharedFilters: FormContainerNode) {
	const queryColumn = builder.newContainer('app.explore.frequency.query');
	queryColumn.addChildren(
		builder.newView('app.explore.frequency.heading', headingView, {
			title: 'Frequency explore mode',
			description: 'Emulates the third explore tab with grouping controls and a parallel source selector.',
		}),
	);
	queryColumn
		.newField('app.explore.frequency.parallel', parallelController, createParallelConfig())
		.newField('app.explore.frequency.annotation', annotationSelectController, {
			annotationId: 'frequency_annotation',
			displayName: 'Frequency by',
			options: [
				{ value: 'word', label: 'Word' },
				{ value: 'lemma', label: 'Lemma' },
				{ value: 'pos', label: 'Part of speech' },
			],
		})
		.newField('app.explore.frequency.seed', annotationTextController, {
			annotationId: 'word',
			displayName: 'Seed term',
			placeholder: 'Optional focus term',
			caseSensitive: true,
		});
	queryColumn.addChildren(
		builder.newView('app.explore.frequency.summary', summaryView, {
			title: 'Explore query',
			showRaw: true,
		}),
	);

	return builder
		.newForm('app.explore.frequency', { title: 'Explore' })
		.addChildren(builder.newContainer('app.explore.frequency.body', { class: 'blf-columns' }).addChildren(queryColumn, createSharedFilterColumn(builder, 'app.explore.frequency', sharedFilters)));
}
