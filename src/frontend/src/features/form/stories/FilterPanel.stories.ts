import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { createFilterPanelStoryModel } from './sample-form-system';

import FormSystemStoryHarness from '../stories/FormSystemStoryHarness.vue';

const meta = {
	title: 'Features/Form/Filter Container',
	component: FormSystemStoryHarness,
	parameters: {
		layout: 'fullscreen',
	},
} satisfies Meta<typeof FormSystemStoryHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GroupedFilters: Story = {
	args: {} as any,
	render: () => ({
		components: { FormSystemStoryHarness },
		setup: () => createFilterPanelStoryModel(),
		template: '<FormSystemStoryHarness :definition="definition" :context="context" :initial-state="initialState" :initial-submitted="initialSubmitted" />',
	}),
};
