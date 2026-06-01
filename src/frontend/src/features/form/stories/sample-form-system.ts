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
	filterTextController,
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
	type ViewDefinition,
	type PersistableSubmittableFormState,
	withinController,
} from '../index';
import type { BuiltContainerNode } from '../model/builder/form-shape-builder';
import type { MetadataFilterConfig } from '../model/controllers/metadata-filter-controller';
import type { ContainerNode, FormBoundaryNode, FormFieldNode } from '../model/types/form-shape';
import sampleTagsetJson from './sample-tagset.json';

import { createMockI18n } from '@/shared/i18n';

import AnnotationPosField from '../fields/AnnotationPosField.vue';
import CheckboxField from '../fields/generic/CheckboxField.vue';
import DateField from '../fields/generic/DateField.vue';
import RangeField from '../fields/generic/RangeField.vue';
import SelectField from '../fields/generic/SelectField.vue';
import TextField from '../fields/generic/TextField.vue';
import ParallelField from '../fields/ParallelField.vue';
import RawCqlField from '../fields/RawCqlField.vue';
import WithinField from '../fields/WithinField.vue';
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

function addFormNode(parent: BuiltContainerNode<any>, id: string, options: Omit<FormBoundaryNode<any>, 'children' | 'config' | 'id' | 'kind'> & { config?: FormBoundaryNode['config'] }) {
	return parent.addForm(id, {
		...options,
		config: options.config ?? {},
	});
}

function createViewNode<Config extends object>(builder: FormBuilder, id: string, view: ViewDefinition<string, Config>, config: Config) {
	return builder.newView(id, {
		component: view.component,
		config,
	});
}

function createFieldNode(builder: FormBuilder, id: string, controller: FieldController<string, any, any>, config: any): FormFieldNode<any> {
	switch (controller.kind) {
		case annotationPosController.kind:
			return builder.newField(id, { controller, component: AnnotationPosField, config });
		case annotationSelectController.kind:
		case filterSelectController.kind:
			return builder.newField(id, { controller, component: SelectField, config });
		case annotationTextController.kind:
		case filterAutocompleteController.kind:
		case filterTextController.kind:
			return builder.newField(id, { controller, component: TextField, config });
		case filterCheckboxController.kind:
			return builder.newField(id, { controller, component: CheckboxField, config });
		case filterDateController.kind:
			return builder.newField(id, { controller, component: DateField, config });
		case filterRangeController.kind:
			return builder.newField(id, { controller, component: RangeField, config });
		case parallelController.kind:
			return builder.newField(id, { controller, component: ParallelField, config });
		case expertQueryController.kind:
			return builder.newField(id, { controller, component: RawCqlField, config });
		case withinController.kind:
			return builder.newField(id, { controller, component: WithinField, config });
		default:
			throw new Error(`Unsupported story field controller: ${controller.kind}`);
	}
}

type MetadataFilterDefinition = {
	buildField: (builder: FormBuilder, id: string, groupId: string) => FormFieldNode<any>;
};

function defineMetadataFilter<Config extends MetadataFilterConfig>(controller: FieldController<string, any, Config>, config: Config): MetadataFilterDefinition {
	return {
		buildField(builder, id, groupId) {
			return createFieldNode(builder, id, controller, {
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
		parallel: createFieldNode(builder, 'search.shared.parallel', parallelController, createParallelConfig()),
		within: createFieldNode(builder, 'search.shared.within', withinController, createWithinConfig()),
	};

	createSimpleForm(root, builder, shared);
	createExtendedForm(root, builder, shared);
	createExpertForm(root, builder, shared);

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
	addFormNode(root, 'catalog.fields', { title: 'Built-in fields' }).addChildren(
		createFieldNode(builder, 'catalog.annotation.word', annotationTextController, {
			annotationId: 'word',
			displayName: 'Word',
			caseSensitive: true,
		}),
		createFieldNode(builder, 'catalog.annotation.pos', annotationPosController, createAnnotationPosConfig()),
		createFieldNode(builder, 'catalog.parallel', parallelController, createParallelConfig()),
		createFieldNode(builder, 'catalog.within', withinController, createWithinConfig()),
		createFieldNode(builder, 'catalog.raw-cql', expertQueryController, {
			displayName: 'Expert CQL',
			label: 'Expert CQL',
			helpUrl: 'https://blacklab.ivdnt.org/guide/corpus-query-language.html',
			rows: 4,
		}),
		createViewNode(builder, 'catalog.summary', summaryView, { showRaw: true }),
	);

	addFormNode(root, 'catalog.filter-controllers', { title: 'Filter controllers' }).addChildren(createFilterContainer(builder, 'catalog'));

	return {
		context,
		definition: builder.build(),
	};
}

export function createAnnotationPosStoryModel(): StoryFormSystemModel {
	const { builder, context } = createStoryBuilder('storybook-pos-tagset');
	builder.newForm('pos-editor.form', { title: 'PoS editor' }).addChildren(
		createViewNode(builder, 'pos-editor.form.heading', headingView, {
			title: 'Production tagset PoS editor',
			description: 'Loaded from sample-tagset.json. Open the editor, adjust the PoS value and subtags, and inspect the live query and serialized snapshot.',
		}),
		createFieldNode(builder, 'pos-editor.field', annotationPosController, createAnnotationPosConfig()),
		createViewNode(builder, 'pos-editor.summary', summaryView, {
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
	builder
		.newForm('filter-panel.form', { config: {} })
		.addView('filter-panel.heading', {
			component: headingView,
			config: {
				title: 'Filter search by ...',
				description: 'Specialized container rendering with grouped filter summaries.',
			},
		})

		.addChildren(createFilterContainer(builder, 'filter-panel'))
		.addChildren(createViewNode(builder, 'filter-panel.summary', summaryView, { title: 'Live filter query', showRaw: true }));

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
	const root = builder.newForm('legacy-filter-comparison.form', {});
	const tabs = builder.newContainer('legacy-filter-comparison.filters', {
		component: markRaw(ContainerRendererFilters),
		config: { variant: 'small-tabs', combine: 'allOf' },
	});

	const letter = builder.newContainer('legacy-filter-comparison.filters.letter', { title: 'Letter', config: { combine: 'allOf' } });
	letter
		.addChildren(
			createFieldNode(builder, 'legacy-filter-comparison.filter.year', filterRangeController, {
				id: 'datum_jaar',
				metadataFieldId: 'datum_jaar',
				displayName: 'Year (id: datum_jaar)',
				groupId: letter.id,
			}),
		)
		.addChildren(
			createFieldNode(builder, 'legacy-filter-comparison.field.type', annotationSelectController, {
				annotationId: 'type_brief',
				displayName: 'Text type (id: type_brief)',
				options: [
					{ value: '', label: 'Text type' },
					{ value: 'personal', label: 'Personal' },
					{ value: 'official', label: 'Official' },
					{ value: 'business', label: 'Business' },
				],
			}),
		)
		.addChildren(
			createFieldNode(builder, 'legacy-filter-comparison.field.autograph', annotationSelectController, {
				annotationId: 'autograaf',
				displayName: 'Autograph (id: autograaf)',
				options: [
					{ value: '', label: 'Autograph' },
					{ value: 'yes', label: 'Yes' },
					{ value: 'no', label: 'No' },
				],
			}),
		)
		.addChildren(
			createFieldNode(builder, 'legacy-filter-comparison.field.signature', annotationSelectController, {
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
		createFieldNode(builder, 'legacy-filter-comparison.sender.name', filterAutocompleteController, {
			id: 'afz_naam',
			metadataFieldId: 'afz_naam',
			displayName: 'Sender (id: afz_naam)',
			groupId: sender.id,
			autocomplete: async (term: string) => ['Anna', 'Brecht', 'Clara', 'Diderik'].filter(value => value.toLowerCase().startsWith(term.toLowerCase())),
		}),
	);

	const addressee = builder.newContainer('legacy-filter-comparison.filters.addressee', { title: 'Addressee', config: { combine: 'allOf' } });
	addressee.addChildren(
		createFieldNode(builder, 'legacy-filter-comparison.addressee.name', filterAutocompleteController, {
			id: 'adr_naam',
			metadataFieldId: 'adr_naam',
			displayName: 'Addressee (id: adr_naam)',
			groupId: addressee.id,
			autocomplete: async (term: string) => ['Beatrix', 'Cornelia', 'Dirk', 'Els'].filter(value => value.toLowerCase().startsWith(term.toLowerCase())),
		}),
	);

	const sentFrom = builder.newContainer('legacy-filter-comparison.filters.sent-from', { title: 'Sent from', config: { combine: 'allOf' } });
	sentFrom.addChildren(
		createFieldNode(builder, 'legacy-filter-comparison.sent-from.place', filterAutocompleteController, {
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
			createViewNode(builder, `${input.formId}.heading`, headingView, {
				title: input.title,
				description: input.description,
			}),
		)
		.addChildren(createFieldNode(builder, fieldId, input.controller, input.config))
		.addChildren(
			createViewNode(builder, `${input.formId}.summary`, summaryView, {
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
			displayName: 'Corpus Query Language',
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
		.addChildren(
			createFieldNode(builder, 'container-types.list.word', annotationTextController, {
				annotationId: 'word',
				displayName: 'Word',
				placeholder: 'List child field',
				caseSensitive: true,
			}),
		)
		.addChildren(
			createFieldNode(builder, 'container-types.list.lemma', annotationTextController, {
				annotationId: 'lemma',
				displayName: 'Lemma',
				placeholder: 'Second list child',
				caseSensitive: true,
			}),
		);

	const tabbedContainer = builder.newContainer('container-types.tabs', {
		title: 'Tabbed container',
		config: { variant: 'tabs' },
	});
	const patternTab = builder.newContainer('container-types.tabs.pattern', { title: 'Pattern', config: { combine: 'allOf' } });
	patternTab
		.addChildren(
			createFieldNode(builder, 'container-types.tabs.pattern.word', annotationTextController, {
				annotationId: 'word',
				displayName: 'Word',
				caseSensitive: true,
			}),
		)
		.addChildren(createFieldNode(builder, 'container-types.tabs.pattern.pos', annotationPosController, createAnnotationPosConfig({ groupId: patternTab.id })));
	const scopeTab = builder
		.newContainer('container-types.tabs.scope', { title: 'Scope', config: { combine: 'allOf' } })
		.addChildren(createFieldNode(builder, 'container-types.tabs.scope.parallel', parallelController, createParallelConfig()))
		.addChildren(createFieldNode(builder, 'container-types.tabs.scope.within', withinController, createWithinConfig()));
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
		createViewNode(builder, 'container-types.heading', headingView, {
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

	addFormNode(root, 'view-catalog.heading', { title: 'Heading' }).addChildren(
		createViewNode(builder, 'view-catalog.heading.demo', headingView, {
			title: 'Heading view',
			description: 'Static titles and descriptions for form sections, placeholders, or explanatory copy.',
		}),
	);

	const summaryForm = addFormNode(root, 'view-catalog.summary', { title: 'Summary' })
		.addChildren(
			createViewNode(builder, 'view-catalog.summary.heading', headingView, {
				title: 'Summary view',
				description: 'Reflects the compiled query and summary entries for the active form.',
			}),
		)
		.addChildren(
			createFieldNode(builder, 'view-catalog.summary.word', annotationTextController, {
				annotationId: 'word',
				displayName: 'Word',
				caseSensitive: true,
			}),
		)
		.addChildren(createFieldNode(builder, 'view-catalog.summary.pos', annotationPosController, createAnnotationPosConfig()))
		.addChildren(
			createViewNode(builder, 'view-catalog.summary.output', summaryView, {
				title: 'Compiled summary',
				showRaw: true,
			}),
		);

	addFormNode(root, 'view-catalog.totals', { title: 'Totals' })
		.addChildren(
			createViewNode(builder, 'view-catalog.totals.heading', headingView, {
				title: 'Totals view',
				description: 'Uses the active form state to estimate the scoped document and token totals.',
			}),
		)
		.addChildren(createFieldNode(builder, 'view-catalog.totals.parallel', parallelController, createParallelConfig()))
		.addChildren(createFieldNode(builder, 'view-catalog.totals.within', withinController, createWithinConfig()))
		.addChildren(
			createViewNode(builder, 'view-catalog.totals.output', totalsView, {
				title: 'Estimated totals',
				baseDocuments: 128345,
				baseTokens: 48291032,
			}),
		);

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
	filters: ContainerNode;
	parallel: FormFieldNode<any>;
	within: FormFieldNode<any>;
};

function createSimpleForm(parent: BuiltContainerNode<any>, builder: FormBuilder, shared: SharedSearchSections) {
	return addFormNode(parent, 'search.simple', { title: 'Simple' })
		.addChildren(shared.parallel)
		.addChildren(
			createFieldNode(builder, 'search.simple.word', annotationTextController, {
				annotationId: 'word',
				displayName: 'Word',
				description: 'Search the main annotation.',
				caseSensitive: true,
				variant: 'large',
			}),
		)
		.addChildren(
			createViewNode(builder, 'search.simple.summary', summaryView, { title: 'Live query preview', showRaw: true }),
			createViewNode(builder, 'search.simple.totals', totalsView, { baseDocuments: 128345, baseTokens: 48291032 }),
		);
}

function createExtendedForm(parent: BuiltContainerNode<any>, builder: FormBuilder, shared: SharedSearchSections) {
	const body = builder.newContainer('search.extended.body', { class: 'blf-columns' });
	const patternColumn = builder.newContainer('search.extended.pattern', { title: 'Pattern' });
	const annotationTabs = builder.newContainer('search.extended.annotations', { config: { variant: 'tabs' } });
	const mainAnnotations = builder
		.newContainer('search.extended.annotations.main', { title: 'Main', config: { combine: 'allOf' } })
		.addChildren(createFieldNode(builder, 'search.extended.word', annotationTextController, { annotationId: 'word', displayName: 'Word', caseSensitive: true }))
		.addChildren(createFieldNode(builder, 'search.extended.lemma', annotationTextController, { annotationId: 'lemma', displayName: 'Lemma', caseSensitive: true }));
	const grammarAnnotations = builder.newContainer('search.extended.annotations.grammar', { title: 'Grammar', config: { combine: 'allOf' } });
	grammarAnnotations.addChildren(createFieldNode(builder, 'search.extended.pos', annotationPosController, createAnnotationPosConfig({ groupId: grammarAnnotations.id })));
	annotationTabs.addChildren(mainAnnotations, grammarAnnotations);
	patternColumn.addChildren(shared.parallel, annotationTabs, shared.within);

	const filterColumn = builder
		.newContainer('search.extended.filters.column', { title: 'Filters' })
		.addChildren(
			shared.filters,
			createViewNode(builder, 'search.extended.filterSummary', summaryView, { title: 'Filter summary', showRaw: true }),
			createViewNode(builder, 'search.extended.filterTotals', totalsView, { baseDocuments: 128345, baseTokens: 48291032 }),
		);

	body.addChildren(patternColumn, filterColumn);
	return addFormNode(parent, 'search.extended', { title: 'Extended' }).addChildren(body);
}

function createExpertForm(parent: BuiltContainerNode<any>, builder: FormBuilder, shared: SharedSearchSections) {
	const queryColumn = builder
		.newContainer('search.expert.query', {})
		.addChildren(shared.parallel)
		.addChildren(
			createFieldNode(builder, 'search.expert.querybox', expertQueryController, {
				displayName: 'Corpus Query Language',
				label: 'Corpus Query Language',
				rows: 8,
				helpUrl: 'https://blacklab.ivdnt.org/guide/corpus-query-language.html',
			}),
		)
		.addChildren(shared.within);
	const filtersColumn = builder
		.newContainer('search.expert.filters.column', { title: 'Filters' })
		.addChildren(shared.filters, createViewNode(builder, 'search.expert.summary', summaryView, { title: 'Submitted shape', showRaw: true }));
	const body = builder.newContainer('search.expert.body', { class: 'blf-columns' }).addChildren(queryColumn, filtersColumn);
	return addFormNode(parent, 'search.expert', { title: 'Expert' }).addChildren(body);
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

function createSharedFilterColumn(builder: FormBuilder, prefix: string, sharedFilters: ContainerNode) {
	return builder.newContainer(`${prefix}.filters`, { title: 'Shared filters' }).addChildren(
		sharedFilters,
		createViewNode(builder, `${prefix}.filters.summary`, summaryView, {
			title: 'Shared filter summary',
			showRaw: true,
		}),
		createViewNode(builder, `${prefix}.filters.totals`, totalsView, {
			title: 'Estimated totals',
			baseDocuments: 128345,
			baseTokens: 48291032,
		}),
	);
}

function createAppSearchModesContainer(builder: FormBuilder, sharedFilters: ContainerNode) {
	const container = builder.newContainer('app.search', {
		title: 'Search',
		config: { variant: 'tabs' },
	});
	createAppSimpleSearchForm(container, builder, sharedFilters);
	createAppExtendedSearchForm(container, builder, sharedFilters);
	createAppAdvancedSearchForm(container, builder, sharedFilters);
	createAppExpertSearchForm(container, builder, sharedFilters);
	return container;
}

function createAppExploreModesContainer(builder: FormBuilder, sharedFilters: ContainerNode) {
	const container = builder.newContainer('app.explore', {
		title: 'Explore',
		config: { variant: 'tabs' },
	});
	createAppDocumentsExploreForm(container, builder, sharedFilters);
	createAppNgramExploreForm(container, builder, sharedFilters);
	createAppFrequencyExploreForm(container, builder, sharedFilters);
	return container;
}

function createAppSimpleSearchForm(parent: BuiltContainerNode<any>, builder: FormBuilder, sharedFilters: ContainerNode) {
	const queryColumn = builder.newContainer('app.search.simple.query', {});
	queryColumn.addChildren(
		createViewNode(builder, 'app.search.simple.heading', headingView, {
			title: 'Simple search',
			description: 'This form combines the new simple and large variants on built-in fields while keeping the shared filters alongside it.',
		}),
	);
	queryColumn
		.addChildren(
			createFieldNode(builder, 'app.search.simple.parallel', parallelController, {
				...createParallelConfig(),
				label: 'Parallel search',
				variant: 'simple',
			}),
		)
		.addChildren(
			createFieldNode(builder, 'app.search.simple.word', annotationTextController, {
				annotationId: 'word',
				displayName: 'Word or phrase',
				description: 'Large primary input rendered with the simple shell.',
				placeholder: 'Type a word, lemma, or phrase',
				caseSensitive: true,
				variant: ['simple', 'large'],
			}),
		)
		.addChildren(
			createFieldNode(builder, 'app.search.simple.within', withinController, {
				...createWithinConfig(),
				label: 'Scope',
				variant: 'simple',
			}),
		);
	queryColumn.addChildren(
		createViewNode(builder, 'app.search.simple.summary', summaryView, {
			title: 'Live query preview',
			showRaw: true,
		}),
	);

	return addFormNode(parent, 'app.search.simple', { title: 'Simple' }).addChildren(
		builder.newContainer('app.search.simple.body', { class: 'blf-columns' }).addChildren(queryColumn, createSharedFilterColumn(builder, 'app.search.simple', sharedFilters)),
	);
}

function createAppExtendedSearchForm(parent: BuiltContainerNode<any>, builder: FormBuilder, sharedFilters: ContainerNode) {
	const patternColumn = builder.newContainer('app.search.extended.pattern', { title: 'Pattern' });
	const annotationTabs = builder.newContainer('app.search.extended.annotations', { config: { variant: 'tabs' } });
	const mainAnnotations = builder
		.newContainer('app.search.extended.annotations.main', { title: 'Main', config: { combine: 'allOf' } })
		.addChildren(
			createFieldNode(builder, 'app.search.extended.word', annotationTextController, {
				annotationId: 'word',
				displayName: 'Word',
				caseSensitive: true,
			}),
		)
		.addChildren(
			createFieldNode(builder, 'app.search.extended.lemma', annotationTextController, {
				annotationId: 'lemma',
				displayName: 'Lemma',
				caseSensitive: true,
			}),
		);
	const grammarAnnotations = builder.newContainer('app.search.extended.annotations.grammar', { title: 'Grammar', config: { combine: 'allOf' } });
	grammarAnnotations.addChildren(createFieldNode(builder, 'app.search.extended.pos', annotationPosController, createAnnotationPosConfig({ groupId: grammarAnnotations.id })));
	annotationTabs.addChildren(mainAnnotations, grammarAnnotations);

	patternColumn.addChildren(
		createFieldNode(builder, 'app.search.extended.parallel', parallelController, createParallelConfig()),
		annotationTabs,
		createFieldNode(builder, 'app.search.extended.within', withinController, createWithinConfig()),
		createViewNode(builder, 'app.search.extended.summary', summaryView, {
			title: 'Compiled query',
			showRaw: true,
		}),
	);

	return addFormNode(parent, 'app.search.extended', { title: 'Extended' }).addChildren(
		builder.newContainer('app.search.extended.body', { class: 'blf-columns' }).addChildren(patternColumn, createSharedFilterColumn(builder, 'app.search.extended', sharedFilters)),
	);
}

function createAppAdvancedSearchForm(parent: BuiltContainerNode<any>, builder: FormBuilder, sharedFilters: ContainerNode) {
	const queryColumn = builder.newContainer('app.search.advanced.query', {});
	queryColumn.addChildren(
		createViewNode(builder, 'app.search.advanced.heading', headingView, {
			title: 'Advanced query builder',
			description: 'Placeholder for the advanced builder surface. The story still shows how it will live inside the same search tab stack with the shared filters.',
		}),
	);
	queryColumn.addChildren(
		createFieldNode(builder, 'app.search.advanced.preview', expertQueryController, {
			displayName: 'Planned advanced output',
			label: 'Planned advanced output',
			rows: 5,
		}),
	);
	queryColumn.addChildren(
		createViewNode(builder, 'app.search.advanced.summary', summaryView, {
			title: 'Current placeholder state',
			showRaw: true,
		}),
	);

	return addFormNode(parent, 'app.search.advanced', { title: 'Advanced (todo)' }).addChildren(
		builder.newContainer('app.search.advanced.body', { class: 'blf-columns' }).addChildren(queryColumn, createSharedFilterColumn(builder, 'app.search.advanced', sharedFilters)),
	);
}

function createAppExpertSearchForm(parent: BuiltContainerNode<any>, builder: FormBuilder, sharedFilters: ContainerNode) {
	const queryColumn = builder.newContainer('app.search.expert.query', {});
	queryColumn
		.addChildren(createFieldNode(builder, 'app.search.expert.parallel', parallelController, createParallelConfig()))
		.addChildren(
			createFieldNode(builder, 'app.search.expert.querybox', expertQueryController, {
				displayName: 'Corpus Query Language',
				label: 'Corpus Query Language',
				rows: 8,
				helpUrl: 'https://blacklab.ivdnt.org/guide/corpus-query-language.html',
			}),
		)
		.addChildren(createFieldNode(builder, 'app.search.expert.within', withinController, createWithinConfig()));
	queryColumn.addChildren(
		createViewNode(builder, 'app.search.expert.summary', summaryView, {
			title: 'Submitted shape',
			showRaw: true,
		}),
	);

	return addFormNode(parent, 'app.search.expert', { title: 'Expert' }).addChildren(
		builder.newContainer('app.search.expert.body', { class: 'blf-columns' }).addChildren(queryColumn, createSharedFilterColumn(builder, 'app.search.expert', sharedFilters)),
	);
}

function createAppDocumentsExploreForm(parent: BuiltContainerNode<any>, builder: FormBuilder, sharedFilters: ContainerNode) {
	const queryColumn = builder.newContainer('app.explore.documents.query', {});
	queryColumn.addChildren(
		createViewNode(builder, 'app.explore.documents.heading', headingView, {
			title: 'Documents explore mode',
			description: 'Mirrors the explore tab with document grouping and presentation controls next to the same shared filters.',
		}),
	);
	queryColumn
		.addChildren(
			createFieldNode(builder, 'app.explore.documents.groupBy', filterSelectController, {
				id: 'documents-group-by',
				metadataFieldId: 'documents_group_by',
				displayName: 'Group documents by',
				groupId: 'app.explore.documents',
				options: [
					{ value: 'author', label: 'Author' },
					{ value: 'genre', label: 'Genre' },
					{ value: 'year', label: 'Year' },
				],
			}),
		)
		.addChildren(
			createFieldNode(builder, 'app.explore.documents.showAs', filterSelectController, {
				id: 'documents-show-as',
				metadataFieldId: 'documents_show_as',
				displayName: 'Show as',
				groupId: 'app.explore.documents',
				options: [
					{ value: 'table', label: 'Table' },
					{ value: 'documents', label: 'Documents' },
					{ value: 'tokens', label: 'Tokens' },
				],
			}),
		);
	queryColumn.addChildren(
		createViewNode(builder, 'app.explore.documents.summary', summaryView, {
			title: 'Explore query',
			showRaw: true,
		}),
	);

	return addFormNode(parent, 'app.explore.documents', { title: 'Documents' }).addChildren(
		builder.newContainer('app.explore.documents.body', { class: 'blf-columns' }).addChildren(queryColumn, createSharedFilterColumn(builder, 'app.explore.documents', sharedFilters)),
	);
}

function createAppNgramExploreForm(parent: BuiltContainerNode<any>, builder: FormBuilder, sharedFilters: ContainerNode) {
	const queryColumn = builder.newContainer('app.explore.ngram.query', {});
	queryColumn.addChildren(
		createViewNode(builder, 'app.explore.ngram.heading', headingView, {
			title: 'N-gram explore mode',
			description: 'A lightweight stand-in for the n-gram controls while the shared filters remain fixed across top-level tabs.',
		}),
	);
	queryColumn
		.addChildren(
			createFieldNode(builder, 'app.explore.ngram.size', filterRangeController, {
				id: 'ngram-size',
				metadataFieldId: 'ngram_size',
				displayName: 'N-gram size',
				groupId: 'app.explore.ngram',
				inputType: 'number',
				lowPlaceholder: 'From',
				highPlaceholder: 'To',
			}),
		)
		.addChildren(
			createFieldNode(builder, 'app.explore.ngram.property', annotationSelectController, {
				annotationId: 'ngram_property',
				displayName: 'Token property',
				options: [
					{ value: 'word', label: 'Word' },
					{ value: 'lemma', label: 'Lemma' },
					{ value: 'pos', label: 'Part of speech' },
				],
			}),
		)
		.addChildren(
			createFieldNode(builder, 'app.explore.ngram.seed', annotationTextController, {
				annotationId: 'word',
				displayName: 'Seed term',
				placeholder: 'Optional seed value',
				caseSensitive: true,
			}),
		);
	queryColumn.addChildren(
		createViewNode(builder, 'app.explore.ngram.summary', summaryView, {
			title: 'Explore query',
			showRaw: true,
		}),
	);

	return addFormNode(parent, 'app.explore.ngram', { title: 'N-gram' }).addChildren(
		builder.newContainer('app.explore.ngram.body', { class: 'blf-columns' }).addChildren(queryColumn, createSharedFilterColumn(builder, 'app.explore.ngram', sharedFilters)),
	);
}

function createAppFrequencyExploreForm(parent: BuiltContainerNode<any>, builder: FormBuilder, sharedFilters: ContainerNode) {
	const queryColumn = builder.newContainer('app.explore.frequency.query', {});
	queryColumn.addChildren(
		createViewNode(builder, 'app.explore.frequency.heading', headingView, {
			title: 'Frequency explore mode',
			description: 'Emulates the third explore tab with grouping controls and a parallel source selector.',
		}),
	);
	queryColumn
		.addChildren(createFieldNode(builder, 'app.explore.frequency.parallel', parallelController, createParallelConfig()))
		.addChildren(
			createFieldNode(builder, 'app.explore.frequency.annotation', annotationSelectController, {
				annotationId: 'frequency_annotation',
				displayName: 'Frequency by',
				options: [
					{ value: 'word', label: 'Word' },
					{ value: 'lemma', label: 'Lemma' },
					{ value: 'pos', label: 'Part of speech' },
				],
			}),
		)
		.addChildren(
			createFieldNode(builder, 'app.explore.frequency.seed', annotationTextController, {
				annotationId: 'word',
				displayName: 'Seed term',
				placeholder: 'Optional focus term',
				caseSensitive: true,
			}),
		);
	queryColumn.addChildren(
		createViewNode(builder, 'app.explore.frequency.summary', summaryView, {
			title: 'Explore query',
			showRaw: true,
		}),
	);

	return addFormNode(parent, 'app.explore.frequency', { title: 'Explore' }).addChildren(
		builder.newContainer('app.explore.frequency.body', { class: 'blf-columns' }).addChildren(queryColumn, createSharedFilterColumn(builder, 'app.explore.frequency', sharedFilters)),
	);
}
