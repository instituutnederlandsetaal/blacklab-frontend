import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { createControllerCatalogDefinition } from '../stories/sample-form-system';

import FormSystemStoryHarness from '../stories/FormSystemStoryHarness.vue';

const meta = {
	title: 'Features/Form/Field Catalog',
	component: FormSystemStoryHarness,
	parameters: {
		layout: 'fullscreen',
	},
	args: {
		definition: createControllerCatalogDefinition(),
	},
} satisfies Meta<typeof FormSystemStoryHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BuiltInControllers: Story = {};
