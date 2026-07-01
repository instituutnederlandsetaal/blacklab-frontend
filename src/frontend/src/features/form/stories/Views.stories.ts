import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { annotationTextController, createDefaultFormState, filterCheckboxController, FormBuilder, type CompiledFormStateWithSummaries, type NewFormState } from '@/features/form';

import { useI18n, type Translate } from '@/shared/i18n';

import FormSystemStoryHarness from './FormSystemStoryHarness.vue';
import CheckboxField from '@/features/form/fields/generic/CheckboxField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import HeadingView from '@/features/form/views/HeadingView.vue';
import SummaryView from '@/features/form/views/SummaryView.vue';
import TotalsView from '@/features/form/views/TotalsView.vue';

type ViewStoryModel = {
	definition: FormBuilder;
	initialState: NewFormState;
	initialSubmitted: CompiledFormStateWithSummaries;
};

const meta = {
	title: 'Features/Form/Views',
	parameters: {
		layout: 'fullscreen',
	},
} satisfies Meta;

export default meta;
type Story = StoryObj;

function createViewStoryModel(translate: Translate): ViewStoryModel {
	const definition = new FormBuilder({
		corpus: {
			indexId: 'storybook-views',
			textDirection: 'ltr',
		},
		translate,
	});
	const root = definition.newContainer('view-catalog', ContainerRenderer, {
		title: 'Built-in views',
		variant: 'tabs',
	});
	const headingForm = definition.newForm('view-catalog.heading', ContainerRenderer, { title: 'Heading' }).addChildren(
		definition.newView('view-catalog.heading.demo', HeadingView, {
			title: 'Heading view',
			description: 'Static titles and descriptions for form sections, placeholders, or explanatory copy.',
		}),
	);
	const summaryForm = definition.newForm('view-catalog.summary', ContainerRenderer, { title: 'Summary' }).addChildren(
		definition.newView('view-catalog.summary.heading', HeadingView, {
			title: 'Summary view',
			description: 'Reflects the compiled query and summary entries for the active form.',
		}),
		definition.newField('view-catalog.summary.word', annotationTextController, TextField, {
			annotationId: 'word',
			displayName: 'Word',
			caseSensitive: true,
		}),
		definition.newField('view-catalog.summary.genre', filterCheckboxController, CheckboxField, {
			metadataFieldId: 'genre',
			displayName: 'Genre',
			options: [
				{ value: 'fiction', label: 'Fiction' },
				{ value: 'essay', label: 'Essay' },
			],
		}),
		definition.newView('view-catalog.summary.output', SummaryView, {
			title: 'Compiled summary',
			showRaw: true,
		}),
	);
	const totalsForm = definition.newForm('view-catalog.totals', ContainerRenderer, { title: 'Totals' }).addChildren(
		definition.newView('view-catalog.totals.heading', HeadingView, {
			title: 'Totals view',
			description: 'Uses the active form state to estimate the scoped document and token totals.',
		}),
		definition.newField('view-catalog.totals.genre', filterCheckboxController, CheckboxField, {
			metadataFieldId: 'genre',
			displayName: 'Genre',
			options: [
				{ value: 'fiction', label: 'Fiction' },
				{ value: 'essay', label: 'Essay' },
				{ value: 'newspaper', label: 'Newspaper' },
			],
		}),
		definition.newView('view-catalog.totals.output', TotalsView, {
			title: 'Estimated totals',
			baseDocuments: 128345,
			baseTokens: 48291032,
		}),
	);
	root.addChildren(headingForm, summaryForm, totalsForm);

	const initialState = createDefaultFormState(definition.getRoot(), definition.context);
	initialState.uiState[root.id] = summaryForm.id;
	initialState.state['view-catalog.summary.word'] = {
		value: 'water',
		caseSensitive: false,
	};
	initialState.state['view-catalog.summary.genre'] = ['fiction'];
	initialState.state['view-catalog.totals.genre'] = ['newspaper'];

	definition.state.replaceState(initialState);
	return {
		definition,
		initialState,
		initialSubmitted: definition.submit(summaryForm.id),
	};
}

export const BuiltInViews: Story = {
	render: () => ({
		components: { FormSystemStoryHarness },
		setup() {
			return createViewStoryModel(useI18n());
		},
		template: '<FormSystemStoryHarness :definition :initial-state="initialState" :initial-submitted="initialSubmitted" />',
	}),
};
