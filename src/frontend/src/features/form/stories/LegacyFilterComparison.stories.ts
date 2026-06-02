import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { createLegacyFilterComparisonStoryModel } from './sample-form-system';

import LegacyFilterComparisonSurface from './LegacyFilterComparisonSurface.vue';

const meta = {
	title: 'Features/Form/Legacy Filter Comparison',
	component: LegacyFilterComparisonSurface,
	parameters: {
		layout: 'fullscreen',
	},
} satisfies Meta<typeof LegacyFilterComparisonSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExtendedFilterPane: Story = {
	args: {} as any,
	render: () => ({
		components: { LegacyFilterComparisonSurface },
		setup: () => createLegacyFilterComparisonStoryModel(),
		template: '<LegacyFilterComparisonSurface :definition="definition" :context="context" :initial-state="initialState" />',
	}),
};
