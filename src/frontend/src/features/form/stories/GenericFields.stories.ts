import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { h, type Component } from 'vue';

import { createAnnotationPosStoryModel, createExpertQueryFieldStoryModel, createParallelFieldStoryModel, createWithinFieldStoryModel } from './sample-form-system';

import CheckboxField from '../fields/generic/CheckboxField.vue';
import DateField from '../fields/generic/DateField.vue';
import RadioField from '../fields/generic/RadioField.vue';
import RangeField from '../fields/generic/RangeField.vue';
import RangeMultipleFieldsField from '../fields/generic/RangeMultipleFieldsField.vue';
import SelectField from '../fields/generic/SelectField.vue';
import TextField from '../fields/generic/TextField.vue';
import FormSystemStoryHarness from '../stories/FormSystemStoryHarness.vue';
import GenericFieldStoryHarness from './GenericFieldStoryHarness.vue';

const meta = {
	title: 'Features/Form/UI Elements',
	component: GenericFieldStoryHarness,
	parameters: {
		layout: 'padded',
	},
} satisfies Meta<typeof GenericFieldStoryHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

type GenericFieldStoryDefinition = {
	fieldComponent: Component;
	config: object;
	initialValue: unknown;
	htmlId?: string;
	showLabel?: boolean;
};

function createGenericFieldStory(definition: GenericFieldStoryDefinition): Story {
	return {
		args: {} as any,
		render: () => ({
			setup: () => () => h(GenericFieldStoryHarness, definition),
		}),
	};
}

export const Text: Story = createGenericFieldStory({
	fieldComponent: TextField,
	config: {
		displayName: 'Keyword',
		description: 'Free-text query with a case sensitivity toggle.',
		placeholder: 'Search term',
		caseSensitive: true,
	},
	initialValue: {
		value: 'Austen',
		caseSensitive: false,
	},
	htmlId: 'generic-text',
});

export const Autocomplete: Story = createGenericFieldStory({
	fieldComponent: TextField,
	config: {
		displayName: 'Author',
		description: 'Autocomplete suggestions use the same generic text widget.',
		placeholder: 'Start typing a name',
		autocomplete: async (term: string) => ['Austen', 'Baldwin', 'Brinkman', 'Couperus', 'Diderot', 'Eliot'].filter(value => value.toLowerCase().startsWith(term.toLowerCase())),
	},
	initialValue: {
		value: '',
		caseSensitive: false,
	},
	htmlId: 'generic-autocomplete',
});

export const Checkbox: Story = createGenericFieldStory({
	fieldComponent: CheckboxField,
	config: {
		displayName: 'Genre',
		description: 'Multi-select options rendered directly from config.',
		options: [
			{ value: 'fiction', label: 'Fiction' },
			{ value: 'essay', label: 'Essay' },
			{ value: 'newspaper', label: 'Newspaper' },
		],
	},
	initialValue: {
		fiction: true,
		essay: false,
	},
	htmlId: 'generic-checkbox',
});

export const Radio: Story = createGenericFieldStory({
	fieldComponent: RadioField,
	config: {
		displayName: 'Availability',
		description: 'Single-select options with the standard radio contract.',
		options: [
			{ value: 'public', label: 'Public' },
			{ value: 'restricted', label: 'Restricted' },
			{ value: 'private', label: 'Private' },
		],
	},
	initialValue: 'restricted',
	htmlId: 'generic-radio',
});

export const Select: Story = createGenericFieldStory({
	fieldComponent: SelectField,
	config: {
		displayName: 'Language',
		description: 'Select retains the direct generic renderer contract.',
		placeholder: 'Choose one or more languages',
		multiple: true,
		options: [
			{ value: 'en', label: 'English' },
			{ value: 'nl', label: 'Dutch' },
			{ value: 'de', label: 'German' },
		],
	},
	initialValue: ['en', 'nl'],
	htmlId: 'generic-select',
});

export const Date: Story = createGenericFieldStory({
	fieldComponent: DateField,
	config: {
		displayName: 'Publication date',
		description: 'Range-aware date widget with optional mode switching.',
		range: true,
		min: '16000101',
		max: '20251231',
	},
	initialValue: {
		startDate: { y: '1800', m: '01', d: '01' },
		endDate: { y: '1900', m: '12', d: '31' },
		mode: 'strict',
	},
	htmlId: 'generic-date',
});

export const Range: Story = createGenericFieldStory({
	fieldComponent: RangeField,
	config: {
		displayName: 'Year range',
		description: 'Standalone lower/upper bound inputs.',
		inputType: 'number',
		lowPlaceholder: 'From year',
		highPlaceholder: 'To year',
	},
	initialValue: {
		low: '1800',
		high: '1900',
	},
	htmlId: 'generic-range',
});

export const RangeMultipleFields: Story = createGenericFieldStory({
	fieldComponent: RangeMultipleFieldsField,
	config: {
		displayName: 'Inclusive years',
		description: 'Multi-field range keeps the same generic contract and optional mode toggle.',
		inputType: 'number',
		lowPlaceholder: 'Start year',
		highPlaceholder: 'End year',
	},
	initialValue: {
		low: '1800',
		high: '1900',
		mode: 'strict',
	},
	htmlId: 'generic-range-multiple',
});

export const PartOfSpeech: Story = {
	args: {} as any,
	render: () => ({
		components: { FormSystemStoryHarness },
		setup: () => createAnnotationPosStoryModel(),
		template: '<FormSystemStoryHarness :definition="definition" :context="context" :initial-state="initialState" :initial-submitted="initialSubmitted" />',
	}),
};

export const Parallel: Story = {
	args: {} as any,
	render: () => ({
		components: { FormSystemStoryHarness },
		setup: () => createParallelFieldStoryModel(),
		template: '<FormSystemStoryHarness :definition="definition" :context="context" :initial-state="initialState" :initial-submitted="initialSubmitted" />',
	}),
};

export const Within: Story = {
	args: {} as any,
	render: () => ({
		components: { FormSystemStoryHarness },
		setup: () => createWithinFieldStoryModel(),
		template: '<FormSystemStoryHarness :definition="definition" :context="context" :initial-state="initialState" :initial-submitted="initialSubmitted" />',
	}),
};

export const ExpertQuery: Story = {
	args: {} as any,
	render: () => ({
		components: { FormSystemStoryHarness },
		setup: () => createExpertQueryFieldStoryModel(),
		template: '<FormSystemStoryHarness :definition="definition" :context="context" :initial-state="initialState" :initial-submitted="initialSubmitted" />',
	}),
};
