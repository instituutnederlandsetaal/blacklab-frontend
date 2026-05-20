import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';

import { filterGroups, metadataFilters } from '../stories/sample-form-system';

import FilterPanel from './FilterPanel.vue';

const meta = {
	title: 'Features/Form/Filter Panel',
	component: FilterPanel,
	render: args => ({
		components: { FilterPanel },
		setup() {
			const values = ref<Record<string, unknown>>({
				author: 'Austen',
				genre: { fiction: true },
				year: { low: '1800', high: '1900' },
				language: ['en', 'nl'],
			});
			const activeTab = ref<string | null>('bibliographic');
			const updateFilterValue = (id: string, value: unknown) => {
				values.value = { ...values.value, [id]: value };
			};
			return { args, values, activeTab, updateFilterValue };
		},
		template: '<FilterPanel v-bind="args" :values="values" :active-tab="activeTab" @update:filter-value="updateFilterValue" @update:active-tab="activeTab = $event" />',
	}),
	args: {
		title: 'Metadata filters',
		groups: filterGroups,
		filters: metadataFilters,
		values: {},
	},
} satisfies Meta<typeof FilterPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GroupedFilters: Story = {};
