import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { useArgs } from 'storybook/preview-api';
import { ref } from 'vue';

import type { Tab } from './Tabs.types';

import Tabs from './Tabs.vue';

const tabs: Tab[] = [
	{ value: 'search', label: 'Search' },
	{ value: 'filters', label: 'Disabled', disabled: true, title: 'This tab is unavailable' },
	{ value: 'settings', label: 'Settings', class: 'text-success', style: { fontWeight: 'bold' } },
	{ value: 'history', label: 'History' },
	{ value: 'exports', label: 'Exports' },
];

const controlsTabs: Tab[] = tabs.map(tab => ({
	...tab,
	id: `tabs-story-controls-${tab.value}`,
	controls: `tabs-story-controls-${tab.value}-panel`,
}));

type TabsStoryArgs = {
	modelValue: string | number | null;
	tabs: Tab[];
	ariaLabel: string;
	vertical: boolean;
	flexy: boolean;
	wrap: boolean;
	small: boolean;
	large: boolean;
	class?: string;
};

const meta = {
	title: 'Shared/UI/Tabs',
	component: Tabs,
	args: {
		modelValue: 'search',
		tabs,
		ariaLabel: 'Search options',
		vertical: false,
		flexy: false,
		wrap: false,
		small: false,
		large: false,
	},
	argTypes: {
		modelValue: { control: 'select', options: ['search', 'filters', 'settings', 'history', 'exports', null] },
		tabs: { control: false },
		ariaLabel: { control: 'text' },
		vertical: { control: 'boolean' },
		flexy: { control: 'boolean' },
		wrap: { control: 'boolean' },
		small: { control: 'boolean' },
		large: { control: 'boolean' },
	},
} satisfies Meta<TabsStoryArgs>;

export default meta;
type Story = StoryObj<TabsStoryArgs>;

const renderInteractive = (args: TabsStoryArgs) => ({
	components: { Tabs },
	setup() {
		const selected = ref(args.modelValue);
		return { args, selected };
	},
	template: '<Tabs v-bind="args" v-model="selected" />',
});

export const Showcase: Story = {
	render: args => {
		const [, updateArgs] = useArgs<TabsStoryArgs>();
		return {
			components: { Tabs },
			setup() {
				const regular = ref('search');
				const large = ref('settings');
				const small = ref('search');
				const vertical = ref('history');
				const stretched = ref('exports');
				const slotContent = ref('history');
				const noSlotContent = ref('history');
				const unknownSelection = ref('missing-tab');
				const updateModelValue = (modelValue: string | number) => updateArgs({ modelValue });
				return { args, controlsTabs, large, noSlotContent, regular, small, slotContent, stretched, tabs, unknownSelection, updateModelValue, vertical };
			},
			template: `
				<div class="tabs-story-showcase">
					<h2>Configured tabs</h2>
					<p>The shared fixture includes a disabled tab, custom styling, and slotted content.</p>

					<h3>Default</h3>
					<Tabs v-model="regular" :tabs="tabs" aria-label="Default tabs" />

					<h3>Large</h3>
					<Tabs v-model="large" :tabs="tabs" large aria-label="Large tabs" />

					<h3>Small</h3>
					<Tabs v-model="small" :tabs="tabs" small aria-label="Small tabs" />

					<h3>Vertical</h3>
					<Tabs v-model="vertical" :tabs="tabs" vertical aria-label="Vertical tabs" />

					<h3>Stretched and wrapped</h3>
					<div style="width: 360px"><Tabs v-model="stretched" :tabs="tabs" flexy wrap aria-label="Stretched tabs" /></div>

					<h3>With before/after slots</h3>
					<Tabs v-model="slotContent" :tabs="tabs" aria-label="Tabs with slot content">
						<template #before="{ tab }">
							<span v-if="tab.value === 'history'" class="fa fa-history" aria-hidden="true" />
							<span v-else-if="tab.value === 'exports'">↓</span>
						</template>
						<template #after="{ tab }">
							<button v-if="tab.value === 'history'" class="btn btn-link btn-xs" type="button" @click.stop>Clear</button>
							<span v-else-if="tab.value === 'exports'">new</span>
						</template>
					</Tabs>

					<h3>Without before/after slots</h3>
					<Tabs v-model="noSlotContent" :tabs="tabs" aria-label="Tabs without slot content" />

					<h2>Empty and invalid states</h2>
					<h3>No tabs</h3>
					<Tabs :tabs="[]" :model-value="null" aria-label="Empty tab list" />

					<h3>Unknown selection</h3>
					<Tabs v-model="unknownSelection" :tabs="tabs" aria-label="Tabs with an unknown selection" />

					<h2>Controls and panel linkage</h2>
					<p>Use Storybook controls to toggle the boolean layout props on this instance.</p>
					<Tabs v-bind="args" :tabs="controlsTabs" @update:model-value="updateModelValue" />
					<div v-for="tab in controlsTabs" v-show="args.modelValue === tab.value" :id="tab.controls" role="tabpanel" :aria-labelledby="tab.id">
						{{ tab.label }} panel
					</div>
				</div>
			`,
		};
	},
	parameters: {
		docs: {
			description: {
				story: 'A complete reference for the shared Tabs component. The bottom instance is connected to Storybook controls; the examples above document the supported configurations side by side.',
			},
		},
	},
};

export const PrimaryHorizontal: Story = {
	args: {
		class: 'tabs-primary',
	},
	render: renderInteractive,
};

export const PrimaryVertical: Story = {
	args: {
		class: 'tabs-primary',
		vertical: true,
	},
	render: renderInteractive,
};
