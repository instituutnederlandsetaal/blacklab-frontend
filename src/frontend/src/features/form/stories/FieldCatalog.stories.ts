import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { createControllerCatalogStoryModel } from './sample-form-system';

import FormSystemStoryHarness from '../stories/FormSystemStoryHarness.vue';

const meta = {
	title: 'Features/Form/Field Catalog',
	component: FormSystemStoryHarness,
	parameters: {
		layout: 'fullscreen',
	},
} satisfies Meta<typeof FormSystemStoryHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BuiltInControllers: Story = {
	args: {} as any,
	render: () => ({
		components: { FormSystemStoryHarness },
		setup: () => createControllerCatalogStoryModel(),
		template: '<FormSystemStoryHarness :definition="definition" :context="context" />',
	}),
};
