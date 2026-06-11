import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { computed, markRaw } from 'vue';

import {
	annotationPosController,
	annotationTextController,
	expertQueryController,
	filterAutocompleteController,
	filterCheckboxController,
	filterDateController,
	filterRadioController,
	filterRangeController,
	filterSelectController,
	FormBuilder,
	parallelController,
	withinController,
	type FormFieldNode,
	type FormRuntimeContext,
} from '@/features/form/index.ts';
import type { AnnotationPosFieldConfig, AnnotationReference } from '@/features/form/fields/annotation-pos-field';
import type { FieldPresentation } from '@/features/form/model/types/form-shape.ts';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import type { Tagset } from '@/types/apptypes';

import { createMockI18n } from '@/shared/i18n/mock.ts';

import AnnotationPosField from '../fields/AnnotationPosField.vue';
import CheckboxField from '../fields/generic/CheckboxField.vue';
import DateField from '../fields/generic/DateField.vue';
import RadioField from '../fields/generic/RadioField.vue';
import RangeField from '../fields/generic/RangeField.vue';
import SelectField from '../fields/generic/SelectField.vue';
import TextField from '../fields/generic/TextField.vue';
import ParallelField from '../fields/ParallelField.vue';
import RawCqlField from '../fields/RawCqlField.vue';
import WithinField from '../fields/WithinField.vue';
import HeadingView from '../views/HeadingView.vue';
import SummaryView from '../views/SummaryView.vue';
import FormSystemStoryHarness from './FormSystemStoryHarness.vue';
import sampleTagsetJson from './sample-tagset.json';

const fieldVariantOptions = ['default', 'simple', 'large', 'small'] as const satisfies FieldPresentation[];
type FieldVariantArg = FieldPresentation | FieldPresentation[] | undefined;
type StoryArgs = {
	variant?: FieldVariantArg;
};

const meta = {
	title: 'Features/Form/UI Elements',
	parameters: {
		layout: 'padded',
	},
	args: {
		variant: 'default',
	},
	argTypes: {
		variant: {
			control: { type: 'check' },
			options: fieldVariantOptions,
		},
	},
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<StoryArgs>;

const translate = createMockI18n().translate;
const posTagset: Tagset = sampleTagsetJson;
const posAnnotation: AnnotationReference = {
	id: 'pos',
	defaultDisplayName: 'Part of speech',
	defaultDescription: 'Filter by part of speech and compatible grammatical features.',
};
const posSubAnnotations = Object.fromEntries(
	Object.keys(posTagset.subAnnotations).map(id => [
		id,
		{
			id,
			defaultDisplayName: id
				.split(/[_-]+/)
				.map(part => (part.toLowerCase() === 'pos' ? 'PoS' : part.charAt(0).toUpperCase() + part.slice(1)))
				.join(' '),
			defaultDescription: '',
		} satisfies AnnotationReference,
	]),
);
const languageOptions = [
	{ value: 'en', label: 'English' },
	{ value: 'nl', label: 'Dutch' },
	{ value: 'de', label: 'German' },
];
const genreOptions = [
	{ value: 'fiction', label: 'Fiction' },
	{ value: 'essay', label: 'Essay' },
	{ value: 'newspaper', label: 'Newspaper' },
];

function normalizeVariantArg(value: FieldVariantArg): FieldPresentation | FieldPresentation[] | undefined {
	if (Array.isArray(value)) return value.length ? value : undefined;
	return value;
}

function createStoryContext(indexId: string): FormRuntimeContext {
	return {
		corpus: {
			indexId,
			textDirection: 'ltr',
		},
		translate,
	};
}

function createAnnotationPosConfig(overrides: Partial<AnnotationPosFieldConfig> = {}): AnnotationPosFieldConfig {
	return {
		annotation: posAnnotation,
		subAnnotations: posSubAnnotations,
		tagset: posTagset,
		showQueryPreview: true,
		...overrides,
	};
}

function createFieldStory<State>(buildField: (builder: FormBuilder) => FormFieldNode, initialState?: State): Story {
	return {
		render: args => ({
			components: { FormSystemStoryHarness },
			setup() {
				const definition = new FormBuilder(createStoryContext('Storybook Example index'));
				const field = buildField(definition);
				definition.newForm('root', ContainerRenderer, { title: 'Field preview' }).addChildren(
					definition.newView('root.heading', HeadingView, {
						title: field.title ?? field.id,
						description: 'Rendered through a real form instance with live state and query output.',
					}),
					field,
					definition.newView('root.summary', SummaryView, {
						title: 'Live query preview',
						showRaw: true,
					}),
				);
				if (initialState !== undefined) definition.state.state.value[field.id] = structuredClone(initialState);

				const variant = computed(() => normalizeVariantArg(args.variant));
				return { definition, variant };
			},
			template: '<FormSystemStoryHarness :definition :variant />',
		}),
	};
}

export const Text: Story = createFieldStory(
	builder =>
		builder.newField('generic-text', annotationTextController, TextField, {
			displayName: 'Keyword',
			description: 'Free-text query with a case sensitivity toggle.',
			placeholder: 'Search term',
			caseSensitive: true,
			annotationId: 'generic-text-annotation',
		}),
	{
		value: 'Austen',
		caseSensitive: false,
	},
);

export const Autocomplete: Story = createFieldStory(
	builder =>
		builder.newField('generic-autocomplete', filterAutocompleteController, TextField, {
			displayName: 'Author',
			description: 'Autocomplete suggestions use the same generic text widget.',
			placeholder: 'Start typing a name',
			metadataFieldId: 'author',
			autocomplete: async (term: string) => ['Austen', 'Baldwin', 'Brinkman', 'Couperus', 'Diderot', 'Eliot'].filter(value => value.toLowerCase().startsWith(term.toLowerCase())),
		}),
	{
		value: '',
		caseSensitive: false,
	},
);

export const Checkbox: Story = createFieldStory(
	builder =>
		builder.newField('generic-checkbox', filterCheckboxController, CheckboxField, {
			displayName: 'Genre',
			description: 'Multi-select options rendered directly from config.',
			metadataFieldId: 'genre',
			options: genreOptions,
		}),
	['fiction', 'essay'],
);

export const Radio: Story = createFieldStory(
	builder =>
		builder.newField('generic-radio', filterRadioController, RadioField, {
			displayName: 'Availability',
			description: 'Single-select options with the standard radio contract.',
			metadataFieldId: 'availability',
			options: [
				{ value: 'public', label: 'Public' },
				{ value: 'restricted', label: 'Restricted' },
				{ value: 'private', label: 'Private' },
			],
		}),
	'restricted',
);

export const Select: Story = createFieldStory(
	builder =>
		builder.newField('generic-select', filterSelectController, SelectField, {
			displayName: 'Language',
			description: 'Select retains the direct generic renderer contract.',
			placeholder: 'Choose one or more languages',
			metadataFieldId: 'language',
			multiple: true,
			options: languageOptions,
		}),
	['en', 'nl'],
);

export const Date: Story = createFieldStory(
	builder =>
		builder.newField('generic-date', filterDateController, DateField, {
			displayName: 'Publication date',
			description: 'Range-aware date widget with optional mode switching.',
			metadataFieldId: 'publication_date',
			range: true,
			min: '16000101',
			max: '20251231',
		}),
	{
		startDate: { y: '1800', m: '01', d: '01' },
		endDate: { y: '1900', m: '12', d: '31' },
		mode: 'strict',
	},
);

export const Range: Story = createFieldStory(
	builder =>
		builder.newField('generic-range', filterRangeController, RangeField, {
			displayName: 'Year range',
			description: 'Standalone lower/upper bound inputs.',
			metadataFieldId: 'year',
			inputType: 'number',
			lowPlaceholder: 'From year',
			highPlaceholder: 'To year',
			showMode: true,
		}),
	{
		low: '1800',
		high: '1900',
		mode: 'strict',
	},
);

export const PartOfSpeech: Story = createFieldStory(builder => builder.newField('generic-pos', annotationPosController, AnnotationPosField, createAnnotationPosConfig()));

export const Parallel: Story = createFieldStory(
	builder =>
		builder.newField('generic-parallel', parallelController, ParallelField, {
			child: {
				id: 'query',
				controller: expertQueryController,
				component: markRaw(RawCqlField),
				config: {},
			},
			fieldOptions: [
				{ id: 'contents__en', defaultDisplayName: 'English' },
				{ id: 'contents__nl', defaultDisplayName: 'Dutch' },
				{ id: 'contents__de', defaultDisplayName: 'German' },
			],
			alignByOptions: ['s', 'p'],
		}),
	{
		source: 'contents__en',
		targets: ['contents__nl'],
		alignBy: 's',
		sourceState: '[lemma="water"]',
		targetStates: {
			contents__nl: '[lemma="water"]',
		},
	},
);

export const Within: Story = createFieldStory(
	builder =>
		builder.newField('generic-within', withinController, WithinField, {
			options: [
				{ value: '', label: 'Document' },
				{
					value: 's',
					label: 'Sentence',
					attributes: [{ value: 'speaker', label: 'Speaker' }],
				},
				{ value: 'p', label: 'Paragraph' },
			],
		}),
	{
		element: 's',
		attributes: { speaker: 'narrator' },
	},
);

export const ExpertQuery: Story = createFieldStory(builder => builder.newField('generic-expert-query', expertQueryController, RawCqlField, {}), '[lemma="water"]');
