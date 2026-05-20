import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { createDraftFormState, createSubmittedSnapshot } from '../index';
import { createSearchFormDefinition } from '../stories/sample-form-system';

import FormSystemStoryHarness from '../stories/FormSystemStoryHarness.vue';

const definition = createSearchFormDefinition();

const meta = {
	title: 'Features/Form/Form System',
	component: FormSystemStoryHarness,
	parameters: {
		layout: 'fullscreen',
	},
	args: {
		definition,
	},
} satisfies Meta<typeof FormSystemStoryHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SearchForms: Story = {};

export const RestoredSubmittedSnapshot: Story = {
	render: () => {
		const restoredDefinition = createSearchFormDefinition();
		const initialState = createDraftFormState(restoredDefinition);
		initialState.activeForm = 'search.extended';
		initialState.forms['search.extended'].controllerState['search.extended.word'] = { value: 'water', caseSensitive: false };
		initialState.forms['search.extended'].controllerState['metadata.genre'] = { fiction: true, essay: false, newspaper: false };
		initialState.forms['search.extended'].uiState.activeContainers['search.extended.filters'] = 'search.extended.filters.bibliographic';
		const initialSubmitted = createSubmittedSnapshot(restoredDefinition, initialState, 'search.extended');
		return {
			components: { FormSystemStoryHarness },
			setup: () => ({ restoredDefinition, initialState, initialSubmitted }),
			template: '<FormSystemStoryHarness :definition="restoredDefinition" :initial-state="initialState" :initial-submitted="initialSubmitted" />',
		};
	},
};
