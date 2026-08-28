import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { annotationTextController, createLexiconLookup, FormBuilder, FormRuntime } from '@/features/form';

import { useI18n } from '@/shared/i18n';

import LexiconField from '../fields/generic/LexiconField.vue';
import FormSystemStoryHarness from './FormSystemStoryHarness.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

const lexiconDb = 'lexiconservice_mnw_wnt';

const meta = {
	title: 'Features/Form/Lexicon Field',
	parameters: {
		layout: 'padded',
	},
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const ProductionLexiconService: Story = {
	render: () => ({
		components: { FormSystemStoryHarness },
		setup() {
			const translate = useI18n();
			const context = {
				corpus: {
					indexId: 'storybook-lexicon',
					textDirection: 'ltr' as const,
				},
				translate,
			};
			const definition = new FormBuilder(context);
			const field = definition.newField('lexicon-demo', annotationTextController, LexiconField, {
				annotationId: 'word',
				displayName: 'Lexicon',
				description: `Uses ${lexiconDb} on the production lexicon service. Term frequencies are accepted for this isolated field demo.`,
				lookup: createLexiconLookup({
					database: lexiconDb,
					getTermFrequencies: async values => Object.fromEntries(values.map(value => [value, 1])),
				}),
			});

			definition.newForm('root', ContainerRenderer, { title: 'Lexicon field' }).addChildren(field);

			return { runtime: new FormRuntime(definition) };
		},
		template: '<FormSystemStoryHarness :runtime />',
	}),
};
