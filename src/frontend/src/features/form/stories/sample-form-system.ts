import { buildRegisteredFormSystem, builtinFieldControllers, builtinViews, type FilterPanelGroup, type FormFilterDefinition, type FormRegistrationApi, type FormSystemDefinition } from '../index';

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
} satisfies Record<string, FormFilterDefinition>;

export const filterGroups: FilterPanelGroup[] = [
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

export function createSearchFormDefinition(): FormSystemDefinition {
	return buildRegisteredFormSystem({
		controllers: builtinFieldControllers,
		views: builtinViews,
		schemaVersion: 'storybook-search-v1',
		runtime: {
			corpus: {
				indexId: 'storybook-corpus',
				textDirection: 'ltr',
			},
		},
		registration: api => {
			const root = api.container('search', { presentation: 'tabs', title: 'Search' });
			root.add(createSimpleForm(api), createExtendedForm(api), createExpertForm(api));
			return root;
		},
	});
}

export function createControllerCatalogDefinition(): FormSystemDefinition {
	return buildRegisteredFormSystem({
		controllers: builtinFieldControllers,
		views: builtinViews,
		schemaVersion: 'storybook-catalog-v1',
		registration: api => {
			const root = api.container('catalog', { presentation: 'tabs', title: 'Controller Catalog' });
			const fields = api.form('catalog.fields', { title: 'Built-in Fields' });
			fields.add(
				api.field('catalog.annotation.word', 'annotation', {
					annotationId: 'word',
					displayName: 'Word',
					caseSensitive: true,
					uiType: 'combobox',
				}),
				api.field('catalog.annotation.pos', 'annotation', {
					annotationId: 'pos',
					displayName: 'Part of speech',
					uiType: 'select',
					options: [
						{ value: 'NOU', label: 'Noun' },
						{ value: 'VRB', label: 'Verb' },
						{ value: 'ADJ', label: 'Adjective' },
					],
				}),
				api.field('catalog.within', 'within', {
					options: [
						{ value: '', label: 'Document' },
						{ value: 's', label: 'Sentence', attributes: [{ value: 'speaker', label: 'Speaker' }] },
						{ value: 'p', label: 'Paragraph' },
					],
				}),
				api.field('catalog.expert', 'expert', {
					label: 'Expert CQL',
					helpUrl: 'https://blacklab.ivdnt.org/guide/corpus-query-language.html',
					rows: 4,
				}),
				api.view('catalog.summary', 'summary', { showRaw: true }),
			);

			const filters = api.form('catalog.filters', { title: 'Filter Controllers' });
			filters.add(createFilterContainer(api, 'catalog.filters'));
			root.add(fields, filters);
			return root;
		},
	});
}

function createSimpleForm(api: FormRegistrationApi) {
	const form = api.form('search.simple', { title: 'Simple' });
	form.add(
		api.field('search.simple.parallel', 'parallel', createParallelConfig(), { stateKey: 'search.parallel' }),
		api.field(
			'search.simple.word',
			'annotation',
			{
				annotationId: 'word',
				displayName: 'Word',
				description: 'Search the main annotation.',
				caseSensitive: true,
				uiType: 'combobox',
			},
			{ stateKey: 'search.simple.word', variant: 'large' },
		),
		api.view('search.simple.summary', 'summary', { title: 'Live query preview', showRaw: true }),
		api.view('search.simple.totals', 'totals', { baseDocuments: 128345, baseTokens: 48291032 }),
	);
	return form;
}

function createExtendedForm(api: FormRegistrationApi) {
	const form = api.form('search.extended', { title: 'Extended' });
	const body = api.container('search.extended.body', { class: 'blf-columns' });
	const patternColumn = api.container('search.extended.pattern', { title: 'Pattern' });
	const annotationTabs = api.container('search.extended.annotations', { presentation: 'tabs' });
	annotationTabs.add(
		api
			.container('search.extended.annotations.main', { title: 'Main', combine: 'allOf' })
			.add(
				api.field('search.extended.word', 'annotation', { annotationId: 'word', displayName: 'Word', caseSensitive: true, uiType: 'combobox' }, { stateKey: 'search.extended.word' }),
				api.field('search.extended.lemma', 'annotation', { annotationId: 'lemma', displayName: 'Lemma', caseSensitive: true, uiType: 'combobox' }, { stateKey: 'search.extended.lemma' }),
			),
		api.container('search.extended.annotations.grammar', { title: 'Grammar', combine: 'allOf' }).add(
			api.field(
				'search.extended.pos',
				'annotation',
				{
					annotationId: 'pos',
					displayName: 'Part of speech',
					uiType: 'select',
					options: [
						{ value: 'NOU', label: 'Noun' },
						{ value: 'VRB', label: 'Verb' },
						{ value: 'ADJ', label: 'Adjective' },
					],
				},
				{ stateKey: 'search.extended.pos' },
			),
		),
	);
	patternColumn.add(
		api.field('search.extended.parallel', 'parallel', createParallelConfig(), { stateKey: 'search.parallel' }),
		annotationTabs,
		api.field('search.extended.within', 'within', createWithinConfig(), { stateKey: 'search.within' }),
	);

	const filterColumn = api.container('search.extended.filters.column', { title: 'Filters' });
	filterColumn.add(createFilterContainer(api, 'search.extended'));
	filterColumn.add(api.view('search.extended.filterSummary', 'summary', { title: 'Filter summary', source: 'filter-only', showRaw: true }));
	filterColumn.add(api.view('search.extended.filterTotals', 'totals', { baseDocuments: 128345, baseTokens: 48291032 }));

	body.add(patternColumn, filterColumn);
	form.add(body);
	return form;
}

function createExpertForm(api: FormRegistrationApi) {
	const form = api.form('search.expert', { title: 'Expert' });
	const body = api.container('search.expert.body', { class: 'blf-columns' });
	body.add(
		api
			.container('search.expert.query')
			.add(
				api.field('search.expert.parallel', 'parallel', createParallelConfig(), { stateKey: 'search.parallel' }),
				api.field(
					'search.expert.querybox',
					'expert',
					{ label: 'Corpus Query Language', rows: 8, helpUrl: 'https://blacklab.ivdnt.org/guide/corpus-query-language.html' },
					{ stateKey: 'search.expert.query' },
				),
				api.field('search.expert.within', 'within', createWithinConfig(), { stateKey: 'search.within' }),
			),
		api.container('search.expert.filters').add(createFilterContainer(api, 'search.expert'), api.view('search.expert.summary', 'summary', { title: 'Submitted shape', showRaw: true })),
	);
	form.add(body);
	return form;
}

function createFilterContainer(api: FormRegistrationApi, prefix: string) {
	const tabs = api.container(`${prefix}.filters`, { presentation: 'small-tabs', combine: 'allOf' });
	for (const group of filterGroups) {
		const groupContainer = api.container(`${prefix}.filters.${group.id}`, { title: group.title, combine: 'allOf' });
		for (const subtab of group.subtabs) {
			const subtabContainer = api.container(`${prefix}.filters.${group.id}.${subtab.id}`, { title: subtab.title, combine: 'allOf' });
			for (const fieldId of subtab.fields) {
				subtabContainer.add(api.field(`${prefix}.filter.${fieldId}`, 'metadata-filter', { definition: metadataFilters[fieldId as keyof typeof metadataFilters] }, { stateKey: `metadata.${fieldId}` }));
			}
			groupContainer.add(subtabContainer);
		}
		tabs.add(groupContainer);
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
