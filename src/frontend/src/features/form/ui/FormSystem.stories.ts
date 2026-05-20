import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { createRestoredSearchFormStoryModel, createSearchFormStoryModel } from '../stories/sample-form-system';

import FormSystemStoryHarness from '../stories/FormSystemStoryHarness.vue';

const meta = {
	title: 'Features/Form/Form System',
	component: FormSystemStoryHarness,
	parameters: {
		layout: 'fullscreen',
	},
} satisfies Meta<typeof FormSystemStoryHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SearchForms: Story = {
	args: {} as any,
	render: () => ({
		components: { FormSystemStoryHarness },
		setup: () => createSearchFormStoryModel(),
		template: '<FormSystemStoryHarness :definition="definition" :context="context" />',
	}),
};

export const RestoredSubmittedSnapshot: Story = {
	args: {} as any,
	render: () => ({
		components: { FormSystemStoryHarness },
		setup: () => createRestoredSearchFormStoryModel(),
		template: '<FormSystemStoryHarness :definition="definition" :context="context" :initial-state="initialState" :initial-submitted="initialSubmitted" />',
	}),
};
