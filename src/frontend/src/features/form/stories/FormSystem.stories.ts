import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { markRaw, watchEffect } from 'vue';

import {
	annotationTextController,
	expertQueryController,
	filterTextController,
	FormBuilder,
	parallelController,
	type NewFormState,
} from '@/features/form';
import TextField from '@/features/form/fields/generic/TextField.vue';
import ParallelField from '@/features/form/fields/ParallelField.vue';
import RawCqlField from '@/features/form/fields/RawCqlField.vue';
import { createDefaultFormState } from '@/features/form/model/state';
import type { BlackLabParameters } from '@/features/form/model/types/blacklab-params';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import HeadingView from '@/features/form/views/HeadingView.vue';
import SummaryView from '@/features/form/views/SummaryView.vue';
import { useI18n, type Translate } from '@/shared/i18n';

import FormSystemStoryHarness from './FormSystemStoryHarness.vue';

type OverrideStoryArgs = {
	pattOverride: boolean;
	filterOverride: boolean;
	searchfieldOverride: boolean;
};

type OverrideStoryModel = {
	definition: FormBuilder;
	initialState: NewFormState;
};

const overrideValues = {
	patt: '[lemma="fixed-raw-cql"]',
	filter: 'author:(Austen)',
	searchfield: 'contents__nl',
} satisfies Record<keyof BlackLabParameters, string>;

const meta = {
	title: 'Features/Form/Form System',
	parameters: {
		layout: 'fullscreen',
	},
	args: {
		pattOverride: false,
		filterOverride: false,
		searchfieldOverride: false,
	},
	argTypes: {
		pattOverride: {
			name: 'patt',
			control: 'boolean',
			description: 'Toggle a restored CQL raw override.',
		},
		filterOverride: {
			name: 'filter',
			control: 'boolean',
			description: 'Toggle a restored Lucene filter raw override.',
		},
		searchfieldOverride: {
			name: 'searchfield',
			control: 'boolean',
			description: 'Toggle a restored search field raw override.',
		},
	},
} satisfies Meta<OverrideStoryArgs>;

export default meta;
type Story = StoryObj<OverrideStoryArgs>;

function createOverrideStoryModel(translate: Translate): OverrideStoryModel {
	const definition = new FormBuilder({
		corpus: {
			indexId: 'storybook-raw-overrides',
			textDirection: 'ltr',
		},
		translate,
	});

	definition.newForm('raw-overrides.demo', ContainerRenderer, { title: 'Raw override locking' }).addChildren(
		definition.newView('raw-overrides.demo.heading', HeadingView, {
			title: 'Raw override locking',
			description: 'Use the story controls to toggle raw BlackLab parameter overrides and inspect the live form state.',
		}),
		definition.newField('raw-overrides.demo.word', annotationTextController, TextField, {
			annotationId: 'word',
			displayName: 'Word',
			placeholder: 'Normal annotation field',
			caseSensitive: true,
		}),
		definition.newField('raw-overrides.demo.expert', expertQueryController, RawCqlField, {}),
		definition.newField('raw-overrides.demo.author', filterTextController, TextField, {
			metadataFieldId: 'author',
			displayName: 'Author',
			placeholder: 'Metadata filter field',
		}),
		definition.newField('raw-overrides.demo.parallel', parallelController, ParallelField, {
			child: {
				id: 'query',
				controller: expertQueryController,
				component: markRaw(RawCqlField),
				config: {},
			},
			fieldOptions: [
				{ id: 'contents__en', defaultDisplayName: 'English' },
				{ id: 'contents__nl', defaultDisplayName: 'Dutch' },
				{ id: 'contents__de', defaultDisplayName: 'German' },
			],
			alignByOptions: ['s', 'p'],
		}),
		definition.newView('raw-overrides.demo.summary', SummaryView, {
			title: 'Live query preview',
			showRaw: true,
		}),
	);

	const initialState = createDefaultFormState(definition.getRoot(), definition.context);
	initialState.state['raw-overrides.demo.word'] = {
		value: 'water',
		caseSensitive: false,
	};
	initialState.state['raw-overrides.demo.expert'] = '[lemma="river"]';
	initialState.state['raw-overrides.demo.author'] = {
		value: 'Austen',
		caseSensitive: false,
	};
	initialState.state['raw-overrides.demo.parallel'] = {
		source: 'contents__en',
		targets: ['contents__nl'],
		alignBy: 's',
		sourceState: '[lemma="water"]',
		targetStates: {
			contents__nl: '[lemma="water"]',
		},
	};

	definition.state.replaceState(initialState);
	return {
		definition,
		initialState,
	};
}

function applyRawOverrides(definition: FormBuilder, args: OverrideStoryArgs) {
	const rawOverrides: BlackLabParameters = {};
	if (args.pattOverride) rawOverrides.patt = overrideValues.patt;
	if (args.filterOverride) rawOverrides.filter = overrideValues.filter;
	if (args.searchfieldOverride) rawOverrides.searchfield = overrideValues.searchfield;
	definition.state.rawOverrides.value = rawOverrides;
}

export const RawOverridesLockFields: Story = {
	render: args => ({
		components: { FormSystemStoryHarness },
		setup() {
			const model = createOverrideStoryModel(useI18n());
			watchEffect(() => applyRawOverrides(model.definition, args));
			return model;
		},
		template: '<FormSystemStoryHarness :definition :initial-state="initialState" />',
	}),
};
