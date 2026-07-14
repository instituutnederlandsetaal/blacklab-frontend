// @vitest-environment jsdom

import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, test, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';

import {
	type FormBuilder,
	type FormRuntime,
	annotationTextController,
	expertQueryController,
	filterTextController,
	parallelController,
	withinController,
	type FormBoundaryNode,
	type FormFieldNode,
	type FormViewNode,
	type SummaryEntry,
	type TotalsViewState,
} from '@/features/form';
import { provideFormSystemRuntime, provideParentForm } from '@/features/form/model/runtime';

import { createTestBuilder, createTestRuntime } from './helpers';

import TextField from '@/features/form/fields/generic/TextField.vue';
import ParallelField from '@/features/form/fields/ParallelField.vue';
import RawCqlField from '@/features/form/fields/RawCqlField.vue';
import WithinField from '@/features/form/fields/WithinField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import HeadingView from '@/features/form/views/HeadingView.vue';
import SummaryView from '@/features/form/views/SummaryView.vue';
import MultiValuePicker from '@/shared/ui/MultiValuePicker.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

type FieldExpectation = {
	state: unknown;
	summaries: SummaryEntry[];
};

type FieldPlacement = 'direct' | 'container' | 'nested-container';
type FormSystemRuntime = FormRuntime;

type FieldHarness<TField extends FormFieldNode = FormFieldNode> = {
	field: TField;
	form: FormBoundaryNode;
	runtime: FormSystemRuntime;
	wrapper: VueWrapper<any>;
};

type RuntimeFieldHarness<TField extends FormFieldNode = FormFieldNode> = Omit<FieldHarness<TField>, 'wrapper'>;

const languageOptions = [
	{
		id: 'contents__de',
		defaultDisplayName: 'German',
	},
	{
		id: 'contents__en',
		defaultDisplayName: 'English',
	},
	{
		id: 'contents__nl',
		defaultDisplayName: 'Dutch',
	},
];

const withinOptions = [
	{ value: '', label: 'shouldNotEndUpInSummaryValue.within.document' },
	{
		value: 'within-state.element.selected',
		label: 'shouldEndUpInSummaryValue.within',
		attributes: [
			{
				value: 'shouldEndUpInState.within.attribute',
				label: 'shouldEndUpInState.within.attribute.label',
			},
		],
	},
	{ value: 'within-state.element.other', label: 'shouldNotEndUpInSummaryValue.within.other' },
];

const fieldExpectations = {
	annotation: {
		state: { value: 'shouldEndUpInSummaryValue.annotation', caseSensitive: true },
		summaries: [
			{
				id: 'shouldEndUpInSummaryId.annotation',
				label: 'shouldEndUpInSummaryLabel.annotation',
				value: 'shouldEndUpInSummaryValue.annotation',
				summaryType: ['patt'],
				group: 'shouldEndUpInSummaryGroup.annotation',
			},
		],
	},
	metadataFilter: {
		state: { value: 'shouldEndUpInSummaryValue.metadata', caseSensitive: false },
		summaries: [
			{
				id: 'shouldEndUpInSummaryId.metadata.node',
				label: 'shouldEndUpInSummaryLabel.metadata',
				value: 'shouldEndUpInSummaryValue.metadata',
				summaryType: ['filter'],
			},
		],
	},
	parallel: {
		state: {
			source: 'contents__en',
			targets: ['contents__nl'],
			alignBy: 'parallel-state.align.selected',
			sourceState: '[lemma="house"]',
			targetStates: {
				contents__nl: '[lemma="huis"]',
			},
		},
		summaries: [
			{
				id: 'shouldEndUpInSummaryId.parallel.node.source',
				label: 'search.parallel.searchSourceVersion',
				value: 'English',
				summaryType: ['searchfield', 'patt'],
			},
			{
				id: 'shouldEndUpInSummaryId.parallel.node.targets',
				label: 'search.parallel.andCompareWithTargetVersions',
				value: 'Dutch',
				summaryType: ['searchfield', 'patt'],
			},
			{
				id: 'shouldEndUpInSummaryId.parallel.node.alignBy',
				label: 'search.parallel.alignBy',
				value: 'parallel-state.align.selected',
				summaryType: ['searchfield', 'patt'],
			},
		],
	},
	rawCql: {
		state: '[summaryField="shouldEndUpInSummaryValue.raw-cql"]',
		summaries: [
			{
				id: 'shouldEndUpInSummaryId.raw-cql.node',
				label: 'search.expert.corpusQueryLanguage',
				value: '[summaryField="shouldEndUpInSummaryValue.raw-cql"]',
				summaryType: ['patt'],
			},
		],
	},
	within: {
		state: {
			element: 'within-state.element.selected',
			attributes: {
				'shouldEndUpInState.within.attribute': 'shouldEndUpInState.within.attribute.value',
			},
		},
		summaries: [
			{
				id: 'shouldEndUpInSummaryId.within.node',
				label: 'search.extended.within',
				value: 'shouldEndUpInSummaryValue.within',
				summaryType: ['patt'],
			},
		],
	},
} satisfies Record<string, FieldExpectation>;

const summaryViewExpectation = {
	entryLabel: 'shouldRenderSummaryLabel.summary-view',
	entryValue: 'shouldRenderSummaryValue.summary-view',
	emptyText: 'form.summary.empty',
	title: 'shouldRenderSummaryTitle.summary-view',
};

function createHostHarness(node: FormFieldNode | FormViewNode, form: FormBoundaryNode, runtime: FormSystemRuntime, _host: 'field' | 'view') {
	return defineComponent({
		setup() {
			provideFormSystemRuntime(runtime);
			provideParentForm(ref(form.id));
			const renderable = runtime.renderableGraph(node.id)!;

			return () => h(renderable.is, renderable.props);
		},
	});
}

function addFieldToForm(builder: FormBuilder, form: ReturnType<FormBuilder['newForm']>, field: FormFieldNode, placement: FieldPlacement) {
	if (placement === 'direct') {
		form.addChildren(field);
		return;
	}

	const container = builder.newContainer(`${field.id}.container`, ContainerRenderer, {
		combine: 'and',
	});
	if (placement === 'container') {
		container.addChildren(field);
		form.addChildren(container);
		return;
	}

	const nestedContainer = builder.newContainer(`${field.id}.nested`, ContainerRenderer, {
		combine: 'and',
	});
	nestedContainer.addChildren(field);
	container.addChildren(nestedContainer);
	form.addChildren(container);
}

function createFieldRuntime<TField extends FormFieldNode>(
	buildField: (builder: FormBuilder, form: ReturnType<FormBuilder['newForm']>) => TField,
	placement: FieldPlacement = 'direct',
): RuntimeFieldHarness<TField> {
	const builder = createTestBuilder();
	const form = builder.newForm('harness.form', ContainerRenderer, { title: 'Harness' });
	const field = buildField(builder, form);
	addFieldToForm(builder, form, field, placement);
	const runtime = createTestRuntime(builder);

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
	const builder = createTestBuilder();
	const form = builder.newForm('harness.form', ContainerRenderer, { title: 'Harness' });
	const { extra, view } = buildView(builder, form);
	const runtime = createTestRuntime(builder);
	const wrapper = mount(createHostHarness(view, form, runtime, 'view'));

	return { extra, form, runtime, view, wrapper };
}

function findButtonByText(wrapper: VueWrapper<any>, label: string) {
	const button = wrapper.findAll('button').find(candidate => candidate.text() === label);
	if (!button) throw new Error(`No button found with label ${label}`);
	return button;
}

describe('builtin controller hosts', () => {
	test('renders computed generic field text passed through a node', async () => {
		const label = ref('Initial annotation label');
		const harness = mountFieldHarness(builder =>
			builder.newField('computed-label.annotation.node', annotationTextController, TextField, {
				annotationId: 'computed-label.annotation',
				displayName: () => label.value,
			}),
		);

		expect(harness.wrapper.get('label').text()).toContain('Initial annotation label');
		expect(harness.wrapper.get('input[type="text"]').attributes('placeholder')).toBe('Initial annotation label');

		label.value = 'Updated annotation label';
		await nextTick();

		expect(harness.wrapper.get('label').text()).toContain('Updated annotation label');
		expect(harness.wrapper.get('input[type="text"]').attributes('placeholder')).toBe('Updated annotation label');
	});

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

		expect(harness.runtime.state.state.value[harness.field.id]).toEqual(fieldExpectations.annotation.state);
	});

	test('updates metadata filter state from the host', async () => {
		const harness = mountFieldHarness(builder =>
			builder.newField('shouldEndUpInSummaryId.metadata.node', filterTextController, TextField, {
				displayName: 'shouldEndUpInSummaryLabel.metadata',
				metadataFieldId: 'shouldNotEndUpInSummaryId.metadata.field',
			}),
		);

		await harness.wrapper.get('input[type="text"]').setValue('shouldEndUpInSummaryValue.metadata');

		expect(harness.runtime.state.state.value[harness.field.id]).toEqual(fieldExpectations.metadataFilter.state);
	});

	test('updates parallel controller state from the host', async () => {
		const harness = mountFieldHarness(builder =>
			builder.newField('shouldEndUpInSummaryId.parallel.node', parallelController, ParallelField, {
				alignByOptions: ['parallel-state.align.other', 'parallel-state.align.selected'],
				child: {
					id: 'query',
					controller: expertQueryController,
					component: RawCqlField,
					config: {},
				},
				fieldOptions: languageOptions,
			}),
		);

		harness.wrapper.findComponent(SelectPicker).vm.$emit('update:modelValue', 'contents__en');
		await nextTick();
		await harness.wrapper.get('textarea').setValue('[lemma="house"]');
		harness.wrapper.findComponent(MultiValuePicker).vm.$emit('update:modelValue', ['contents__nl']);
		await nextTick();
		await harness.wrapper.findAll('textarea')[1].setValue('[lemma="huis"]');
		await findButtonByText(harness.wrapper, 'parallel-state.align.selected').trigger('click');

		expect(harness.runtime.state.state.value[harness.field.id]).toEqual(fieldExpectations.parallel.state);
	});

	test('updates raw cql state from the host', async () => {
		const harness = mountFieldHarness(builder => builder.newField('shouldEndUpInSummaryId.raw-cql.node', expertQueryController, RawCqlField, {}));

		await harness.wrapper.get('textarea').setValue('[summaryField="shouldEndUpInSummaryValue.raw-cql"]');

		expect(harness.runtime.state.state.value[harness.field.id]).toEqual(fieldExpectations.rawCql.state);
	});

	test('renders the raw cql help link', () => {
		const harness = mountFieldHarness(builder => builder.newField('shouldEndUpInSummaryId.raw-cql.node', expertQueryController, RawCqlField, {}));

		expect(harness.wrapper.get('a.help').attributes('href')).toBe('https://blacklab.ivdnt.org/guide/corpus-query-language.html');
	});

	test('updates within controller state from the host', async () => {
		const harness = mountFieldHarness(builder =>
			builder.newField('shouldEndUpInSummaryId.within.node', withinController, WithinField, {
				options: withinOptions,
			}),
		);

		await findButtonByText(harness.wrapper, 'shouldEndUpInSummaryValue.within').trigger('click');
		await harness.wrapper.get('input[type="text"]').setValue('shouldEndUpInState.within.attribute.value');

		expect(harness.runtime.state.state.value[harness.field.id]).toEqual(fieldExpectations.within.state);
		expect(harness.runtime.compile(harness.form.id)).toEqual({
			formId: 'harness.form',
			encoded: {
				'f.form': 'harness.form',
				'f.within': 'element=within-state.element.selected;attr.shouldEndUpInState.within.attribute=shouldEndUpInState.within.attribute.value',
			},
			patt: '<within-state.element.selected shouldEndUpInState.within.attribute="shouldEndUpInState\\.within\\.attribute\\.value"/>',
			filter: null,
			searchfield: null,
			summaries: fieldExpectations.within.summaries,
		});
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

		harness.runtime.state.state.value[harness.field.id] = fieldExpectations.annotation.state;

		expect(harness.runtime.compile('harness.form').summaries).toEqual(fieldExpectations.annotation.summaries);
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

		harness.runtime.state.state.value[harness.field.id] = fieldExpectations.metadataFilter.state;

		expect(harness.runtime.compile('harness.form').summaries).toEqual(fieldExpectations.metadataFilter.summaries);
	});

	test('uses derived node-based ids in parallel summaries through nested containers', () => {
		const harness = createFieldRuntime(
			builder =>
				builder.newField('shouldEndUpInSummaryId.parallel.node', parallelController, ParallelField, {
					alignByOptions: ['parallel-state.align.other', 'parallel-state.align.selected'],
					child: {
						id: 'query',
						controller: expertQueryController,
						component: RawCqlField,
						config: {},
					},
					fieldOptions: languageOptions,
				}),
			'nested-container',
		);

		harness.runtime.state.state.value[harness.field.id] = fieldExpectations.parallel.state;

		expect(harness.runtime.compile('harness.form').summaries).toEqual(fieldExpectations.parallel.summaries);
	});

	test('uses the field node id in raw cql summaries for direct form children', () => {
		const harness = createFieldRuntime(builder => builder.newField('shouldEndUpInSummaryId.raw-cql.node', expertQueryController, RawCqlField, {}));

		harness.runtime.state.state.value[harness.field.id] = fieldExpectations.rawCql.state;
		expect(harness.runtime.compile('harness.form').summaries).toEqual(fieldExpectations.rawCql.summaries);
	});

	test('uses the field node id in within summaries through a container', () => {
		const harness = createFieldRuntime(
			builder =>
				builder.newField('shouldEndUpInSummaryId.within.node', withinController, WithinField, {
					options: withinOptions,
				}),
			'container',
		);

		harness.runtime.state.state.value[harness.field.id] = fieldExpectations.within.state;

		expect(harness.runtime.compile('harness.form').summaries).toEqual(fieldExpectations.within.summaries);
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

		harness.runtime.state.state.value[harness.extra.fieldId] = {
			value: summaryViewExpectation.entryValue,
			caseSensitive: false,
		};
		await nextTick();

		expect(harness.wrapper.text()).toContain(summaryViewExpectation.title);
		expect(harness.wrapper.text()).toContain(summaryViewExpectation.entryLabel);
		expect(harness.wrapper.text()).toContain(summaryViewExpectation.entryValue);
	});

	test('filters summary entries by affected BlackLab parameter', async () => {
		const harness = mountViewHarness((builder, form) => {
			const annotation = builder.newField('harness.summary.annotation', annotationTextController, TextField, {
				annotationId: 'word',
				displayName: 'Pattern',
			});
			const filter = builder.newField('harness.summary.filter', filterTextController, TextField, {
				displayName: 'Author',
				metadataFieldId: 'author',
			});
			const view = builder.newView('harness.summary.filters', SummaryView, {
				summaryType: 'filter',
			});
			form.addChildren(annotation, filter, view);
			return { extra: { annotationId: annotation.id, filterId: filter.id }, view };
		});

		harness.runtime.state.state.value[harness.extra.annotationId] = { value: 'water', caseSensitive: false };
		harness.runtime.state.state.value[harness.extra.filterId] = { value: 'Austen', caseSensitive: false };
		await nextTick();

		expect(harness.wrapper.text()).toContain('Author');
		expect(harness.wrapper.text()).toContain('Austen');
		expect(harness.wrapper.text()).not.toContain('Pattern');
		expect(harness.wrapper.text()).not.toContain('water');
	});

	test('combines filter summaries with live subcorpus totals', async () => {
		const totals = ref<TotalsViewState>({ status: 'loading' });
		const update = vi.fn();
		const dispose = vi.fn();
		const harness = mountViewHarness((builder, form) => {
			const field = builder.newField('harness.summary.filter', filterTextController, TextField, {
				displayName: 'Author',
				groupId: 'Bibliographic',
				metadataFieldId: 'author',
			});
			const view = builder.newView('harness.summary.filters-with-totals', SummaryView, {
				createTotals: () => ({ state: totals, update, dispose }),
				summaryType: 'filter',
			});
			form.addChildren(field, view);
			return { extra: { fieldId: field.id }, view };
		});

		expect(update).toHaveBeenLastCalledWith({ filter: null, searchfield: null });
		expect(harness.wrapper.text()).toContain('filterOverview.calculating');

		harness.runtime.state.state.value[harness.extra.fieldId] = {
			value: 'Austen',
			caseSensitive: false,
		};
		await nextTick();

		expect(harness.wrapper.text()).toContain('Author');
		expect(harness.wrapper.text()).toContain('Bibliographic');
		expect(harness.wrapper.text()).toContain('Austen');
		expect(update).toHaveBeenLastCalledWith({ filter: 'author:(Austen)', searchfield: null });

		totals.value = {
			status: 'loaded',
			documents: 25,
			tokens: 400,
			totalDocuments: 100,
			totalTokens: 1000,
		};
		await nextTick();

		const text = harness.wrapper.text();
		expect(text).toContain('filterOverview.subCorpus');
		expect(text).toContain('filterOverview.totalDocuments');
		expect(text).toContain('filterOverview.totalTokens');
		expect(text).toContain('25');
		expect(text).toContain('400');
		expect(text).toContain('(25%)');
		expect(text).toContain('(40%)');

		totals.value = { status: 'error', message: 'Count failed' };
		await nextTick();
		expect(harness.wrapper.text()).toContain('filterOverview.error: Count failed');

		harness.wrapper.unmount();
		expect(dispose).toHaveBeenCalledOnce();
	});
});
