// @vitest-environment jsdom

import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import {
	FormBuilder,
	annotationTextController,
	createFormSystemRuntime,
	expertQueryController,
	filterTextController,
	parallelController,
	withinController,
	type FormBoundaryNode,
	type FormFieldNode,
	type FormSystemRuntime,
	type FormViewNode,
	type SummaryEntry,
} from '@/features/form';
import { createAndProvideParentForm, provideFormSystemRuntime } from '@/features/form/model/runtime';
import { getNodeProps, resolveNodeComponent } from '@/features/form/ui/node-render';

import { createTestContext } from './helpers';

import TextField from '@/features/form/fields/generic/TextField.vue';
import ParallelField from '@/features/form/fields/ParallelField.vue';
import RawCqlField from '@/features/form/fields/RawCqlField.vue';
import WithinField from '@/features/form/fields/WithinField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import HeadingView from '@/features/form/views/HeadingView.vue';
import SummaryView from '@/features/form/views/SummaryView.vue';
import TotalsView from '@/features/form/views/TotalsView.vue';

type FieldExpectation = {
	controllerState: unknown;
	summaries: SummaryEntry[];
};

type FieldPlacement = 'direct' | 'container' | 'nested-container';

type FieldHarness<TField extends FormFieldNode = FormFieldNode> = {
	field: TField;
	form: FormBoundaryNode;
	runtime: FormSystemRuntime;
	wrapper: VueWrapper<any>;
};

type RuntimeFieldHarness<TField extends FormFieldNode = FormFieldNode> = Omit<FieldHarness<TField>, 'wrapper'>;

const languageOptions = [
	{ value: 'parallel-state.source.other', label: 'shouldNotEndUpInSummaryValue.parallel.source' },
	{ value: 'parallel-state.source.selected', label: 'shouldEndUpInSummaryValue.parallel.source' },
	{ value: 'parallel-state.target.selected', label: 'shouldEndUpInSummaryValue.parallel.target' },
];

const withinOptions = [
	{ value: '', label: 'shouldNotEndUpInSummaryValue.within.document' },
	{
		value: 'within-state.element.selected',
		label: 'shouldEndUpInSummaryValue.within',
		attributes: [{ value: 'shouldEndUpInState.within.attribute', label: 'shouldEndUpInState.within.attribute.label' }],
	},
	{ value: 'within-state.element.other', label: 'shouldNotEndUpInSummaryValue.within.other' },
];

const fieldExpectations = {
	annotation: {
		controllerState: { value: 'shouldEndUpInSummaryValue.annotation', caseSensitive: true },
		summaries: [
			{
				id: 'shouldEndUpInSummaryId.annotation',
				label: 'shouldEndUpInSummaryLabel.annotation',
				value: 'shouldEndUpInSummaryValue.annotation',
				group: 'shouldEndUpInSummaryGroup.annotation',
			},
		],
	},
	metadataFilter: {
		controllerState: { value: 'shouldEndUpInSummaryValue.metadata', caseSensitive: false },
		summaries: [
			{
				id: 'shouldEndUpInSummaryId.metadata.node',
				label: 'shouldEndUpInSummaryLabel.metadata',
				value: 'shouldEndUpInSummaryValue.metadata',
			},
		],
	},
	parallel: {
		controllerState: {
			source: 'parallel-state.source.selected',
			targets: ['parallel-state.target.selected'],
			alignBy: 'parallel-state.align.selected',
		},
		summaries: [
			{ id: 'shouldEndUpInSummaryId.parallel.node.source', label: 'Source', value: 'shouldEndUpInSummaryValue.parallel.source' },
			{ id: 'shouldEndUpInSummaryId.parallel.node.targets', label: 'Targets', value: 'shouldEndUpInSummaryValue.parallel.target' },
			{ id: 'shouldEndUpInSummaryId.parallel.node.alignBy', label: 'Align by', value: 'shouldEndUpInSummaryValue.parallel.alignBy' },
		],
	},
	rawCql: {
		controllerState: {
			query: '[summaryField="shouldEndUpInSummaryValue.raw-cql"]',
			targetQueries: [],
		},
		summaries: [
			{
				id: 'shouldEndUpInSummaryId.raw-cql.node',
				label: 'shouldEndUpInSummaryLabel.raw-cql',
				value: '[summaryField="shouldEndUpInSummaryValue.raw-cql"]',
			},
		],
	},
	within: {
		controllerState: {
			element: 'within-state.element.selected',
			attributes: { 'shouldEndUpInState.within.attribute': 'shouldEndUpInState.within.attribute.value' },
		},
		summaries: [
			{
				id: 'shouldEndUpInSummaryId.within.node',
				label: 'shouldEndUpInSummaryLabel.within',
				value: 'shouldEndUpInSummaryValue.within',
			},
		],
	},
} satisfies Record<string, FieldExpectation>;

const summaryViewExpectation = {
	entryLabel: 'shouldRenderSummaryLabel.summary-view',
	entryValue: 'shouldRenderSummaryValue.summary-view',
	emptyText: 'No active inputs.',
	title: 'shouldRenderSummaryTitle.summary-view',
};

const totalsViewExpectation = {
	activeHint: 'Preview uses the current filter projection.',
	filteredDocuments: '380',
	filteredTokens: '760',
	inactiveHint: 'No filters active.',
	initialDocuments: '1000',
	initialTokens: '2000',
};

function createHostHarness(node: FormFieldNode | FormViewNode, form: FormBoundaryNode, runtime: FormSystemRuntime, host: 'field' | 'view') {
	return defineComponent({
		setup() {
			provideFormSystemRuntime(runtime);
			createAndProvideParentForm(runtime, () => form.id);

			return () =>
				h(resolveNodeComponent(node), {
					...getNodeProps(node, {
						runtime,
						scopeId: host,
					}),
				});
		},
	});
}

function addFieldToForm(form: ReturnType<FormBuilder['newForm']>, field: FormFieldNode, placement: FieldPlacement) {
	if (placement === 'direct') {
		form.addChildren(field);
		return;
	}

	const container = form.addContainer(`${field.id}.container`, ContainerRenderer, { combine: 'allOf' });
	if (placement === 'container') {
		container.addChildren(field);
		return;
	}

	const nestedContainer = container.addContainer(`${field.id}.nested`, ContainerRenderer, { combine: 'allOf' });
	nestedContainer.addChildren(field);
}

function createFieldRuntime<TField extends FormFieldNode>(
	buildField: (builder: FormBuilder, form: ReturnType<FormBuilder['newForm']>) => TField,
	placement: FieldPlacement = 'direct',
): RuntimeFieldHarness<TField> {
	const builder = new FormBuilder();
	const form = builder.newForm('harness.form', ContainerRenderer, { title: 'Harness' });
	const field = buildField(builder, form);
	addFieldToForm(form, field, placement);
	const runtime = createFormSystemRuntime(builder.build(), createTestContext());

	return { field, form, runtime };
}

function mountFieldHarness<TField extends FormFieldNode>(
	buildField: (builder: FormBuilder, form: ReturnType<FormBuilder['newForm']>) => TField,
	placement: FieldPlacement = 'direct',
): FieldHarness<TField> {
	const harness = createFieldRuntime(buildField, placement);
	const wrapper = mount(createHostHarness(harness.field, harness.form, harness.runtime, 'field'));

	return { ...harness, wrapper };
}

function mountViewHarness<TExtra, TView extends FormViewNode>(
	buildView: (
		builder: FormBuilder,
		form: ReturnType<FormBuilder['newForm']>,
	) => {
		extra: TExtra;
		view: TView;
	},
) {
	const builder = new FormBuilder();
	const form = builder.newForm('harness.form', ContainerRenderer, { title: 'Harness' });
	const { extra, view } = buildView(builder, form);
	const runtime = createFormSystemRuntime(builder.build(), createTestContext());
	const wrapper = mount(createHostHarness(view, form, runtime, 'view'));

	return { extra, form, runtime, view, wrapper };
}

function findButtonByText(wrapper: VueWrapper<any>, label: string) {
	const button = wrapper.findAll('button').find(candidate => candidate.text() === label);
	if (!button) throw new Error(`No button found with label ${label}`);
	return button;
}

function expectFieldState(runtime: FormSystemRuntime, fieldId: string, controllerState: unknown) {
	expect(runtime.state.value.controllerState[fieldId]).toEqual(controllerState);
}

function expectFormSummaries(runtime: FormSystemRuntime, expected: SummaryEntry[]) {
	expect(runtime.summarize('harness.form')).toEqual(expected);
}

function normalizedText(wrapper: VueWrapper<any>) {
	return wrapper.text().replace(/[\s.,]/g, '');
}

describe('builtin controller hosts', () => {
	test('updates annotation controller state from the host', async () => {
		const harness = mountFieldHarness(builder =>
			builder.newField('shouldNotEndUpInSummaryId.annotation.node', annotationTextController, TextField, {
				annotationId: 'shouldEndUpInSummaryId.annotation',
				caseSensitive: true,
				displayName: 'shouldEndUpInSummaryLabel.annotation',
				groupId: 'shouldEndUpInSummaryGroup.annotation',
			}),
		);

		await harness.wrapper.get('input[type="text"]').setValue('shouldEndUpInSummaryValue.annotation');
		await harness.wrapper.get('input[type="checkbox"]').setValue(true);

		expectFieldState(harness.runtime, harness.field.id, fieldExpectations.annotation.controllerState);
	});

	test('updates metadata filter state from the host', async () => {
		const harness = mountFieldHarness(builder =>
			builder.newField('shouldEndUpInSummaryId.metadata.node', filterTextController, TextField, {
				displayName: 'shouldEndUpInSummaryLabel.metadata',
				metadataFieldId: 'shouldNotEndUpInSummaryId.metadata.field',
			}),
		);

		await harness.wrapper.get('input[type="text"]').setValue('shouldEndUpInSummaryValue.metadata');

		expectFieldState(harness.runtime, harness.field.id, fieldExpectations.metadataFilter.controllerState);
	});

	test('updates parallel controller state from the host', async () => {
		const harness = mountFieldHarness(builder =>
			builder.newField('shouldEndUpInSummaryId.parallel.node', parallelController, ParallelField, {
				alignByOptions: [
					{ value: 'parallel-state.align.other', label: 'shouldNotEndUpInSummaryValue.parallel.alignBy' },
					{ value: 'parallel-state.align.selected', label: 'shouldEndUpInSummaryValue.parallel.alignBy' },
				],
				sourceOptions: languageOptions,
				targetOptions: languageOptions,
			}),
		);

		const [sourceSelect, alignBySelect] = harness.wrapper.findAll('select');
		await sourceSelect.setValue('parallel-state.source.selected');
		await findButtonByText(harness.wrapper, 'shouldEndUpInSummaryValue.parallel.target').trigger('click');
		await alignBySelect.setValue('parallel-state.align.selected');

		expectFieldState(harness.runtime, harness.field.id, fieldExpectations.parallel.controllerState);
	});

	test('updates raw cql state from the host', async () => {
		const harness = mountFieldHarness(builder =>
			builder.newField('shouldEndUpInSummaryId.raw-cql.node', expertQueryController, RawCqlField, {
				displayName: 'shouldEndUpInSummaryLabel.raw-cql',
				helpUrl: 'https://example.test/help',
				label: 'shouldEndUpInSummaryLabel.raw-cql',
				rows: 4,
			}),
		);

		await harness.wrapper.get('textarea').setValue('[summaryField="shouldEndUpInSummaryValue.raw-cql"]');

		expectFieldState(harness.runtime, harness.field.id, fieldExpectations.rawCql.controllerState);
	});

	test('renders the raw cql help link', () => {
		const harness = mountFieldHarness(builder =>
			builder.newField('shouldEndUpInSummaryId.raw-cql.node', expertQueryController, RawCqlField, {
				displayName: 'shouldEndUpInSummaryLabel.raw-cql',
				helpUrl: 'https://example.test/help',
				label: 'shouldEndUpInSummaryLabel.raw-cql',
				rows: 4,
			}),
		);

		expect(harness.wrapper.get('a.help').attributes('href')).toBe('https://example.test/help');
	});

	test('updates within controller state from the host', async () => {
		const harness = mountFieldHarness(builder =>
			builder.newField('shouldEndUpInSummaryId.within.node', withinController, WithinField, {
				label: 'shouldEndUpInSummaryLabel.within',
				options: withinOptions,
			}),
		);

		await findButtonByText(harness.wrapper, 'shouldEndUpInSummaryValue.within').trigger('click');
		await harness.wrapper.get('input[type="text"]').setValue('shouldEndUpInState.within.attribute.value');

		expectFieldState(harness.runtime, harness.field.id, fieldExpectations.within.controllerState);
	});
});

describe('builtin controller summaries', () => {
	test('uses the annotation config id in summaries for direct form children', () => {
		const harness = createFieldRuntime(builder =>
			builder.newField('shouldNotEndUpInSummaryId.annotation.node', annotationTextController, TextField, {
				annotationId: 'shouldEndUpInSummaryId.annotation',
				caseSensitive: true,
				displayName: 'shouldEndUpInSummaryLabel.annotation',
				groupId: 'shouldEndUpInSummaryGroup.annotation',
			}),
		);

		harness.runtime.state.value.controllerState[harness.field.id] = fieldExpectations.annotation.controllerState;

		expectFormSummaries(harness.runtime, fieldExpectations.annotation.summaries);
	});

	test('uses the field node id in metadata summaries through a container', () => {
		const harness = createFieldRuntime(
			builder =>
				builder.newField('shouldEndUpInSummaryId.metadata.node', filterTextController, TextField, {
					displayName: 'shouldEndUpInSummaryLabel.metadata',
					metadataFieldId: 'shouldNotEndUpInSummaryId.metadata.field',
				}),
			'container',
		);

		harness.runtime.state.value.controllerState[harness.field.id] = fieldExpectations.metadataFilter.controllerState;

		expectFormSummaries(harness.runtime, fieldExpectations.metadataFilter.summaries);
	});

	test('uses derived node-based ids in parallel summaries through nested containers', () => {
		const harness = createFieldRuntime(
			builder =>
				builder.newField('shouldEndUpInSummaryId.parallel.node', parallelController, ParallelField, {
					alignByOptions: [
						{ value: 'parallel-state.align.other', label: 'shouldNotEndUpInSummaryValue.parallel.alignBy' },
						{ value: 'parallel-state.align.selected', label: 'shouldEndUpInSummaryValue.parallel.alignBy' },
					],
					sourceOptions: languageOptions,
					targetOptions: languageOptions,
				}),
			'nested-container',
		);

		harness.runtime.state.value.controllerState[harness.field.id] = fieldExpectations.parallel.controllerState;

		expectFormSummaries(harness.runtime, fieldExpectations.parallel.summaries);
	});

	test('uses the field node id in raw cql summaries for direct form children', () => {
		const harness = createFieldRuntime(builder =>
			builder.newField('shouldEndUpInSummaryId.raw-cql.node', expertQueryController, RawCqlField, {
				displayName: 'shouldEndUpInSummaryLabel.raw-cql',
				label: 'shouldEndUpInSummaryLabel.raw-cql',
				rows: 4,
			}),
		);

		harness.runtime.state.value.controllerState[harness.field.id] = fieldExpectations.rawCql.controllerState;

		expectFormSummaries(harness.runtime, fieldExpectations.rawCql.summaries);
	});

	test('uses the field node id in within summaries through a container', () => {
		const harness = createFieldRuntime(
			builder =>
				builder.newField('shouldEndUpInSummaryId.within.node', withinController, WithinField, {
					label: 'shouldEndUpInSummaryLabel.within',
					options: withinOptions,
				}),
			'container',
		);

		harness.runtime.state.value.controllerState[harness.field.id] = fieldExpectations.within.controllerState;

		expectFormSummaries(harness.runtime, fieldExpectations.within.summaries);
	});
});

describe('builtin view hosts', () => {
	test('renders the heading view host', () => {
		const harness = mountViewHarness((builder, form) => {
			const view = builder.newView('harness.heading', HeadingView, {
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
			const field = builder.newField('harness.summary.field', annotationTextController, TextField, {
				annotationId: 'shouldEndUpInSummaryId.summary-view',
				displayName: summaryViewExpectation.entryLabel,
			});
			const view = builder.newView('harness.summary', SummaryView, {
				title: summaryViewExpectation.title,
			});
			form.addChildren(field, view);
			return { extra: { fieldId: field.id }, view };
		});

		expect(harness.wrapper.text()).toContain(summaryViewExpectation.emptyText);

		harness.runtime.state.value.controllerState[harness.extra.fieldId] = { value: summaryViewExpectation.entryValue, caseSensitive: false };
		await nextTick();

		expect(harness.wrapper.text()).toContain(summaryViewExpectation.title);
		expect(harness.wrapper.text()).toContain(summaryViewExpectation.entryLabel);
		expect(harness.wrapper.text()).toContain(summaryViewExpectation.entryValue);
	});

	test('renders the totals view host against provided parent-form state', async () => {
		const harness = mountViewHarness((builder, form) => {
			const field = builder.newField('harness.filter', filterTextController, TextField, {
				displayName: 'shouldActivateTotalsProjection.filter',
				metadataFieldId: 'shouldActivateTotalsProjection.metadata-field',
			});
			const view = builder.newView('harness.totals', TotalsView, {
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

		harness.runtime.state.value.controllerState[harness.extra.fieldId] = {
			value: 'shouldActivateTotalsProjection.value',
			caseSensitive: false,
		};
		await nextTick();

		expect(normalizedText(harness.wrapper)).toContain(totalsViewExpectation.filteredDocuments);
		expect(normalizedText(harness.wrapper)).toContain(totalsViewExpectation.filteredTokens);
		expect(harness.wrapper.text()).toContain(totalsViewExpectation.activeHint);
	});
});
