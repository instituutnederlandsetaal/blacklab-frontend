// @vitest-environment jsdom

import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import {
    ControllerRegistry,
    FormBuilder,
    annotationTextController,
    createFormSystemRuntime,
    expertQueryController,
    filterTextController,
    headingView,
    parallelController,
    registerBuiltinControllers,
    registerBuiltinViews,
    summaryView,
    totalsView,
    withinController,
    type CompiledFormState,
    type FormBoundaryNode,
    type FormFieldNode,
    type FormRuntimeContext,
    type FormSystemRuntime,
    type FormViewNode,
    type SummaryEntry,
} from '@/features/form';
import { createAndProvideParentForm, provideFormSystemRuntime } from '@/features/form/model/runtime';

import FieldHost from '@/features/form/ui/FieldHost.vue';
import ViewHost from '@/features/form/ui/ViewHost.vue';

type FieldExpectation = {
	compiled: CompiledFormState;
	controllerState: unknown;
	summaries: SummaryEntry[];
};

type FieldHarness<TField extends FormFieldNode<any> = FormFieldNode<any>> = {
	field: TField;
	form: FormBoundaryNode;
	runtime: FormSystemRuntime;
	wrapper: VueWrapper<any>;
};

const languageOptions = [
	{ value: 'contents__en', label: 'English' },
	{ value: 'contents__nl', label: 'Dutch' },
	{ value: 'contents__de', label: 'German' },
];

const withinOptions = [
	{ value: '', label: 'Document' },
	{ value: 's', label: 'Sentence', attributes: [{ value: 'speaker', label: 'Speaker' }] },
	{ value: 'p', label: 'Paragraph' },
];

const fieldExpectations = {
	annotation: {
		compiled: {
			cql: '[word="water"]',
			filter: null,
			searchField: null,
		},
		controllerState: { value: 'water', caseSensitive: true },
		summaries: [{ id: 'harness.annotation', label: 'Word', value: 'water' }],
	},
	metadataFilter: {
		compiled: {
			cql: null,
			filter: 'author:(Austen)',
			searchField: null,
		},
		controllerState: 'Austen',
		summaries: [{ id: 'harness.filter', label: 'Author', value: 'Austen' }],
	},
	parallel: {
		compiled: {
			cql: null,
			filter: null,
			searchField: 'contents__nl',
		},
		controllerState: {
			source: 'contents__nl',
			targets: ['contents__de'],
			alignBy: 'p',
		},
		summaries: [
			{ id: 'harness.parallel.source', label: 'Source', value: 'Dutch' },
			{ id: 'harness.parallel.targets', label: 'Targets', value: 'German' },
			{ id: 'harness.parallel.alignBy', label: 'Align by', value: 'Paragraph' },
		],
	},
	rawCql: {
		compiled: {
			cql: '[word="water"]',
			filter: null,
			searchField: null,
		},
		controllerState: {
			query: '[word="water"]',
			targetQueries: [],
		},
		summaries: [{ id: 'harness.raw-cql', label: 'Expert CQL', value: '[word="water"]' }],
	},
	within: {
		compiled: {
			cql: '<s speaker="narrator"/>',
			filter: null,
			searchField: null,
		},
		controllerState: {
			element: 's',
			attributes: { speaker: 'narrator' },
		},
		summaries: [{ id: 'harness.within', label: 'Within', value: 'Sentence' }],
	},
} satisfies Record<string, FieldExpectation>;

const summaryViewExpectation = {
	afterUpdate: {
		cql: '[word="(?i)water"]',
		entryLabel: 'Word',
		entryValue: 'water',
		title: 'Live query',
	},
	emptyText: 'No active inputs.',
	rawFilterFallback: 'None',
};

const totalsViewExpectation = {
	activeHint: 'Preview uses the current filter projection.',
	filteredDocuments: '380',
	filteredTokens: '760',
	inactiveHint: 'No filters active.',
	initialDocuments: '1000',
	initialTokens: '2000',
};

function createRegistry() {
	const registry: ControllerRegistry = new ControllerRegistry();
	registerBuiltinControllers(registry);
	registerBuiltinViews(registry);
	return registry;
}

function createContext(): FormRuntimeContext {
	return {
		corpus: { indexId: 'test-corpus', textDirection: 'ltr' },
	};
}

function createHostHarness(node: FormFieldNode<any> | FormViewNode<any>, form: FormBoundaryNode, runtime: FormSystemRuntime, host: 'field' | 'view') {
	return defineComponent({
		setup() {
			provideFormSystemRuntime(runtime);
			createAndProvideParentForm(runtime, () => form.id);

			return () => (host === 'field' ? h(FieldHost as any, { node: node as FormFieldNode<any> }) : h(ViewHost as any, { node: node as FormViewNode<any> }));
		},
	});
}

function mountFieldHarness<TField extends FormFieldNode<any>>(buildField: (builder: FormBuilder, form: ReturnType<FormBuilder['newForm']>) => TField): FieldHarness<TField> {
	const registry = createRegistry();
	const builder = new FormBuilder(registry);
	const form = builder.newForm('harness.form', { title: 'Harness' });
	const field = buildField(builder, form);
	form.addChildren(field);
	const runtime = createFormSystemRuntime(builder.build(), createContext());
	const wrapper = mount(createHostHarness(field, form, runtime, 'field'));

	return { field, form, runtime, wrapper };
}

function mountViewHarness<TExtra, TView extends FormViewNode<any>>(
	buildView: (
		builder: FormBuilder,
		form: ReturnType<FormBuilder['newForm']>,
	) => {
		extra: TExtra;
		view: TView;
	},
) {
	const registry = createRegistry();
	const builder = new FormBuilder(registry);
	const form = builder.newForm('harness.form', { title: 'Harness' });
	const { extra, view } = buildView(builder, form);
	const runtime = createFormSystemRuntime(builder.build(), createContext());
	const wrapper = mount(createHostHarness(view, form, runtime, 'view'));

	return { extra, form, runtime, view, wrapper };
}

function findButtonByText(wrapper: VueWrapper<any>, label: string) {
	const button = wrapper.findAll('button').find(candidate => candidate.text() === label);
	if (!button) throw new Error(`No button found with label ${label}`);
	return button;
}

function expectFieldProjection(runtime: FormSystemRuntime, fieldId: string, expected: FieldExpectation) {
	expect(runtime.state.value.controllerState[fieldId]).toEqual(expected.controllerState);
	expect(runtime.compile('harness.form')).toEqual(expected.compiled);
	expect(runtime.summarize('harness.form')).toEqual(expected.summaries);
}

function normalizedText(wrapper: VueWrapper<any>) {
	return wrapper.text().replace(/[\s.,]/g, '');
}

describe('field host', () => {
	test('renders and wires the annotation field host', async () => {
		const harness = mountFieldHarness(builder =>
			builder.newField('harness.annotation', annotationTextController, {
				annotationId: 'word',
				caseSensitive: true,
				displayName: 'Word',
			}),
		);

		await harness.wrapper.get('input[type="text"]').setValue('water');
		await harness.wrapper.get('input[type="checkbox"]').setValue(true);

		expectFieldProjection(harness.runtime, 'harness.annotation', fieldExpectations.annotation);
	});

	test('renders and wires the metadata filter field host', async () => {
		const harness = mountFieldHarness(builder =>
			builder.newField('harness.filter', filterTextController, {
				componentName: 'filter-text',
				defaultDisplayName: 'Author',
				id: 'author',
			}),
		);

		await harness.wrapper.get('input[type="text"]').setValue('Austen');

		expectFieldProjection(harness.runtime, 'harness.filter', fieldExpectations.metadataFilter);
	});

	test('renders and wires the parallel field host', async () => {
		const harness = mountFieldHarness(builder =>
			builder.newField('harness.parallel', parallelController, {
				alignByOptions: [
					{ value: 's', label: 'Sentence' },
					{ value: 'p', label: 'Paragraph' },
				],
				sourceOptions: languageOptions,
				targetOptions: languageOptions,
			}),
		);

		const [sourceSelect, alignBySelect] = harness.wrapper.findAll('select');
		await sourceSelect.setValue('contents__nl');
		await findButtonByText(harness.wrapper, 'German').trigger('click');
		await alignBySelect.setValue('p');

		expectFieldProjection(harness.runtime, 'harness.parallel', fieldExpectations.parallel);
	});

	test('renders and wires the raw cql field host', async () => {
		const harness = mountFieldHarness(builder =>
			builder.newField('harness.raw-cql', expertQueryController, {
				helpUrl: 'https://example.test/help',
				label: 'Expert CQL',
				rows: 4,
			}),
		);

		await harness.wrapper.get('textarea').setValue('[word="water"]');

		expectFieldProjection(harness.runtime, 'harness.raw-cql', fieldExpectations.rawCql);
		expect(harness.wrapper.get('a.help').attributes('href')).toBe('https://example.test/help');
	});

	test('renders and wires the within field host', async () => {
		const harness = mountFieldHarness(builder =>
			builder.newField('harness.within', withinController, {
				options: withinOptions,
			}),
		);

		await findButtonByText(harness.wrapper, 'Sentence').trigger('click');
		await harness.wrapper.get('input[type="text"]').setValue('narrator');

		expectFieldProjection(harness.runtime, 'harness.within', fieldExpectations.within);
	});
});

describe('view host', () => {
	test('renders the heading view host', () => {
		const harness = mountViewHarness((builder, form) => {
			const view = builder.newView('harness.heading', headingView, {
				description: 'Overview of the current form slice.',
				title: 'Search heading',
			});
			form.addChildren(view);
			return { extra: {}, view };
		});

		expect(harness.wrapper.get('h3').text()).toBe('Search heading');
		expect(harness.wrapper.get('p').text()).toBe('Overview of the current form slice.');
	});

	test('renders the summary view host against provided parent-form state', async () => {
		const harness = mountViewHarness((builder, form) => {
			const field = builder.newField('harness.word', annotationTextController, {
				annotationId: 'word',
				displayName: 'Word',
			});
			const view = builder.newView('harness.summary', summaryView, {
				showRaw: true,
				title: summaryViewExpectation.afterUpdate.title,
			});
			form.addChildren(field, view);
			return { extra: { fieldId: field.id }, view };
		});

		expect(harness.wrapper.text()).toContain(summaryViewExpectation.emptyText);

		harness.runtime.state.value.controllerState[harness.extra.fieldId] = { value: 'water', caseSensitive: false };
		await nextTick();

		expect(harness.wrapper.text()).toContain(summaryViewExpectation.afterUpdate.title);
		expect(harness.wrapper.text()).toContain(summaryViewExpectation.afterUpdate.entryLabel);
		expect(harness.wrapper.text()).toContain(summaryViewExpectation.afterUpdate.entryValue);
		expect(harness.wrapper.text()).toContain(summaryViewExpectation.afterUpdate.cql);
		expect(harness.wrapper.text()).toContain(summaryViewExpectation.rawFilterFallback);
	});

	test('renders the totals view host against provided parent-form state', async () => {
		const harness = mountViewHarness((builder, form) => {
			const field = builder.newField('harness.filter', filterTextController, {
				componentName: 'filter-text',
				defaultDisplayName: 'Author',
				id: 'author',
			});
			const view = builder.newView('harness.totals', totalsView, {
				baseDocuments: 1000,
				baseTokens: 2000,
				title: 'Totals',
			});
			form.addChildren(field, view);
			return { extra: { fieldId: field.id }, view };
		});

		expect(normalizedText(harness.wrapper)).toContain(totalsViewExpectation.initialDocuments);
		expect(normalizedText(harness.wrapper)).toContain(totalsViewExpectation.initialTokens);
		expect(harness.wrapper.text()).toContain(totalsViewExpectation.inactiveHint);

		harness.runtime.state.value.controllerState[harness.extra.fieldId] = 'Austen';
		await nextTick();

		expect(normalizedText(harness.wrapper)).toContain(totalsViewExpectation.filteredDocuments);
		expect(normalizedText(harness.wrapper)).toContain(totalsViewExpectation.filteredTokens);
		expect(harness.wrapper.text()).toContain(totalsViewExpectation.activeHint);
	});
});
