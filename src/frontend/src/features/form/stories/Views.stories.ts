import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';

import { createDefaultFormState, filterCheckboxController, FormBuilder, FormRuntime, type CompiledFormResult, type SummaryTotalsInput, type SummaryTotalsState } from '@/features/form';

import { useI18n, type Translate } from '@/shared/i18n';

import FormSystemStoryHarness from './FormSystemStoryHarness.vue';
import CheckboxField from '@/features/form/fields/generic/CheckboxField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import HeadingView from '@/features/form/views/HeadingView.vue';
import SummaryView from '@/features/form/views/SummaryView.vue';

type ViewStoryModel = {
	runtime: FormRuntime;
	initialSubmitted: CompiledFormResult;
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
	const context = {
		corpus: {
			indexId: 'storybook-views',
			textDirection: 'ltr' as const,
		},
		translate,
	};
	const definition = new FormBuilder(context);
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
	const filterSummaryForm = definition.newForm('view-catalog.filter-summary', ContainerRenderer, { title: 'Filter summary' }).addChildren(
		definition.newView('view-catalog.totals.heading', HeadingView, {
			title: 'Filter summary view',
			description: 'Combines active filter summaries with an injected document and token count.',
		}),
		definition.newField('view-catalog.totals.genre', filterCheckboxController, CheckboxField, {
			metadataFieldId: 'genre',
			displayName: 'Genre',
			groupId: 'Bibliographic',
			options: [
				{ value: 'fiction', label: 'Fiction' },
				{ value: 'essay', label: 'Essay' },
				{ value: 'newspaper', label: 'Newspaper' },
			],
		}),
		definition.newView('view-catalog.totals.output', SummaryView, {
			createTotals: () => {
				const state = ref<SummaryTotalsState>({ status: 'loading' });
				return {
					state,
					update: ({ filter }: SummaryTotalsInput) => {
						state.value = {
							status: 'loaded',
							documents: filter ? 48321 : 128345,
							tokens: filter ? 17650342 : 48291032,
							totalDocuments: 128345,
							totalTokens: 48291032,
						};
					},
				};
			},
		}),
	);
	root.addChildren(headingForm, filterSummaryForm);

	const initialState = createDefaultFormState(context, definition.getRoot());
	initialState.uiState[root.id] = filterSummaryForm.id;
	initialState.state['view-catalog.totals.genre'] = ['newspaper'];

	const runtime = new FormRuntime(definition, initialState);
	return {
		runtime,
		initialSubmitted: runtime.compile(filterSummaryForm.id),
	};
}

export const BuiltInViews: Story = {
	render: () => ({
		components: { FormSystemStoryHarness },
		setup() {
			return createViewStoryModel(useI18n());
		},
		template: '<FormSystemStoryHarness :runtime :initial-submitted="initialSubmitted" />',
	}),
};
