import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { watchEffect } from 'vue';

import {
	annotationTextController,
	createFormFieldNode,
	expertQueryController,
	filterTextController,
	FormBuilder,
	FormRuntime,
	parallelController,
	type FormOverrides,
	type FormRuntimeContext,
} from '@/features/form';
import { createDefaultFormState } from '@/features/form/model/state';

import { useI18n, type Translate } from '@/shared/i18n';

import FormSystemStoryHarness from './FormSystemStoryHarness.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';
import ParallelField from '@/features/form/fields/ParallelField.vue';
import RawCqlField from '@/features/form/fields/RawCqlField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import HeadingView from '@/features/form/views/HeadingView.vue';

type OverrideStoryArgs = {
	pattOverride: boolean;
	filterOverride: boolean;
	searchfieldOverride: boolean;
};

type FormSystemStoryModel = {
	runtime: FormRuntime;
};

const overrideValues = {
	patt: '[lemma="fixed-raw-cql"]',
	filter: 'author:(Austen)',
	searchfield: 'contents__nl',
} satisfies Record<'patt' | 'filter' | 'searchfield', string>;

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

function createOverrideStoryModel(translate: Translate): FormSystemStoryModel {
	const context: FormRuntimeContext = {
		corpus: {
			indexId: 'storybook-raw-overrides',
			textDirection: 'ltr',
		},
		translate,
	};
	const definition = new FormBuilder(context);
	const parallelFieldOptions = [
		{ id: 'contents__en', defaultDisplayName: 'English' },
		{ id: 'contents__nl', defaultDisplayName: 'Dutch' },
		{ id: 'contents__de', defaultDisplayName: 'German' },
	].map(field => ({ ...field, label: () => translate.$tAnnotatedFieldDisplayName(field) }));

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
			childFieldTemplate: createFormFieldNode('raw-overrides.demo.parallel.query', expertQueryController, RawCqlField, {}),
			fieldOptions: parallelFieldOptions,
			alignByOptions: ['s', 'p'].map(value => ({ value, label: () => translate.$tAlignByDisplayName({ value }) })),
		}),
	);

	const initialState = createDefaultFormState(context, definition.getRoot());
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
		childStates: {
			contents__en: '[lemma="water"]',
			contents__nl: '[lemma="water"]',
		},
	};

	return { runtime: new FormRuntime(definition, initialState) };
}

function applyRawOverrides(runtime: FormRuntime, args: OverrideStoryArgs) {
	const rawOverrides: FormOverrides = {};
	if (args.pattOverride) rawOverrides.patt = overrideValues.patt;
	if (args.filterOverride) rawOverrides.filter = overrideValues.filter;
	if (args.searchfieldOverride) rawOverrides.searchfield = overrideValues.searchfield;
	runtime.state.rawOverrides.value = rawOverrides;
}

export const RawOverridesLockFields: Story = {
	render: args => ({
		components: { FormSystemStoryHarness },
		setup() {
			const model = createOverrideStoryModel(useI18n());
			watchEffect(() => applyRawOverrides(model.runtime, args));
			return model;
		},
		template: '<FormSystemStoryHarness :runtime />',
	}),
};

function createProgressiveLayoutsModel(translate: Translate): FormSystemStoryModel {
	const context: FormRuntimeContext = {
		corpus: {
			indexId: 'storybook-progressive-layouts',
			textDirection: 'ltr',
		},
		translate,
	};
	const definition = new FormBuilder(context);

	const root = definition.newContainer('layout-lab', ContainerRenderer, {
		title: 'Form layout laboratory',
		variant: 'list',
	});

	const directFieldsForm = definition
		.newForm('layout-lab.1-direct-fields', ContainerRenderer, {
			title: 'Direct fields',
		})
		.addChildren(
			definition.newView('layout-lab.1-direct-fields.heading', HeadingView, {
				title: '1. Form with fields directly inside it',
				description: 'The baseline: a form followed by two text fields.',
			}),
			definition.newField('layout-lab.1-direct-fields.word', annotationTextController, TextField, {
				annotationId: 'word',
				displayName: 'Word',
				placeholder: 'for example: river',
				caseSensitive: true,
			}),
			definition.newField('layout-lab.1-direct-fields.lemma', annotationTextController, TextField, {
				annotationId: 'lemma',
				displayName: 'Lemma',
				placeholder: 'for example: flow',
				caseSensitive: true,
			}),
		);

	const listFields = definition
		.newContainer('layout-lab.2-list-fields.list', ContainerRenderer, {
			variant: 'list',
		})
		.addChildren(
			definition.newField('layout-lab.2-list-fields.word', annotationTextController, TextField, {
				annotationId: 'word',
				displayName: 'Word',
				placeholder: 'for example: water',
				caseSensitive: true,
			}),
			definition.newField('layout-lab.2-list-fields.pos', annotationTextController, TextField, {
				annotationId: 'pos',
				displayName: 'Part of speech',
				placeholder: 'for example: noun',
				caseSensitive: true,
			}),
		);
	const listFieldsForm = definition
		.newForm('layout-lab.2-list-fields', ContainerRenderer, {
			title: 'Fields in a list',
		})
		.addChildren(
			definition.newView('layout-lab.2-list-fields.heading', HeadingView, {
				title: '2. Form → list container → fields',
				description: 'Adds a list container around the same kind of text fields.',
			}),
			listFields,
		);

	const tabbedForms = definition
		.newContainer('layout-lab.3-tabbed-forms', ContainerRenderer, {
			title: '3. Tabs containing forms',
			variant: 'tabs',
		})
		.addChildren(
			definition
				.newForm('layout-lab.3-tabbed-forms.text', ContainerRenderer, {
					title: 'Text query',
				})
				.addChildren(
					definition.newView('layout-lab.3-tabbed-forms.text.heading', HeadingView, {
						title: '3. Container tabs → form → fields',
						description: 'Switch tabs to compare form layout inside a tab panel.',
					}),
					definition.newField('layout-lab.3-tabbed-forms.text.word', annotationTextController, TextField, {
						annotationId: 'word',
						displayName: 'Word',
						placeholder: 'for example: book',
						caseSensitive: true,
					}),
					definition.newField('layout-lab.3-tabbed-forms.text.lemma', annotationTextController, TextField, {
						annotationId: 'lemma',
						displayName: 'Lemma',
						placeholder: 'for example: read',
						caseSensitive: true,
					}),
				),
			definition
				.newForm('layout-lab.3-tabbed-forms.metadata', ContainerRenderer, {
					title: 'Metadata',
				})
				.addChildren(
					definition.newView('layout-lab.3-tabbed-forms.metadata.heading', HeadingView, {
						title: 'Alternative tab',
						description: 'A sibling form in the same tab container.',
					}),
					definition.newField('layout-lab.3-tabbed-forms.metadata.author', filterTextController, TextField, {
						metadataFieldId: 'author',
						displayName: 'Author',
						placeholder: 'for example: Austen',
					}),
				),
		);

	const nestedTabs = definition
		.newContainer('layout-lab.4-nested-tabs', ContainerRenderer, {
			title: '4. Nested tabs and lists',
			variant: 'tabs',
		})
		.addChildren(
			definition
				.newContainer('layout-lab.4-nested-tabs.forms', ContainerRenderer, {
					title: 'Form stack',
					variant: 'list',
				})
				.addChildren(
					definition
						.newForm('layout-lab.4-nested-tabs.forms.search', ContainerRenderer, {
							title: 'Search fields',
						})
						.addChildren(
							definition.newView('layout-lab.4-nested-tabs.forms.search.heading', HeadingView, {
								title: '4. Tabs → list → form → list → fields',
								description: 'The first branch keeps the fields in an inner list container.',
							}),
							definition.newContainer('layout-lab.4-nested-tabs.forms.search.fields', ContainerRenderer, { variant: 'list' }).addChildren(
								definition.newField('layout-lab.4-nested-tabs.forms.search.fields.word', annotationTextController, TextField, {
									annotationId: 'word',
									displayName: 'Word',
									placeholder: 'for example: sea',
									caseSensitive: true,
								}),
								definition.newField('layout-lab.4-nested-tabs.forms.search.fields.lemma', annotationTextController, TextField, {
									annotationId: 'lemma',
									displayName: 'Lemma',
									placeholder: 'for example: wave',
									caseSensitive: true,
								}),
							),
						),
					definition
						.newForm('layout-lab.4-nested-tabs.forms.options', ContainerRenderer, {
							title: 'Options',
						})
						.addChildren(
							definition.newView('layout-lab.4-nested-tabs.forms.options.heading', HeadingView, {
								title: 'Tabs inside the second form',
								description: 'Use this branch to inspect a second tab layer inside the stacked forms.',
							}),
							definition
								.newContainer('layout-lab.4-nested-tabs.forms.options.sections', ContainerRenderer, {
									variant: 'small-tabs',
								})
								.addChildren(
									definition
										.newContainer('layout-lab.4-nested-tabs.forms.options.sections.general', ContainerRenderer, {
											title: 'General',
											variant: 'list',
										})
										.addChildren(
											definition.newField('layout-lab.4-nested-tabs.forms.options.sections.general.author', filterTextController, TextField, {
												metadataFieldId: 'author',
												displayName: 'Author',
												placeholder: 'for example: Woolf',
											}),
										),
									definition
										.newContainer('layout-lab.4-nested-tabs.forms.options.sections.details', ContainerRenderer, {
											title: 'Details',
											variant: 'list',
										})
										.addChildren(
											definition.newField('layout-lab.4-nested-tabs.forms.options.sections.details.title', filterTextController, TextField, {
												metadataFieldId: 'title',
												displayName: 'Title',
												placeholder: 'for example: To the Lighthouse',
											}),
										),
								),
						),
				),
			definition
				.newContainer('layout-lab.4-nested-tabs.preview', ContainerRenderer, {
					title: 'Second outer tab',
					variant: 'list',
				})
				.addChildren(
					definition.newView('layout-lab.4-nested-tabs.preview.heading', HeadingView, {
						title: 'A second outer tab',
						description: 'A deliberately simple sibling panel for checking outer-tab spacing and transitions.',
					}),
					definition.newField('layout-lab.4-nested-tabs.preview.keyword', annotationTextController, TextField, {
						annotationId: 'word',
						displayName: 'Keyword',
						placeholder: 'for example: harbour',
						caseSensitive: true,
					}),
				),
		);

	root.addChildren(directFieldsForm, listFieldsForm, tabbedForms, nestedTabs);

	const initialState = createDefaultFormState(context, definition.getRoot());
	initialState.state['layout-lab.1-direct-fields.word'] = { value: 'river', caseSensitive: false };
	initialState.state['layout-lab.1-direct-fields.lemma'] = { value: 'flow', caseSensitive: false };
	initialState.state['layout-lab.2-list-fields.word'] = { value: 'water', caseSensitive: false };
	initialState.state['layout-lab.2-list-fields.pos'] = { value: 'noun', caseSensitive: false };
	initialState.state['layout-lab.3-tabbed-forms.text.word'] = { value: 'book', caseSensitive: false };
	initialState.state['layout-lab.3-tabbed-forms.text.lemma'] = { value: 'read', caseSensitive: false };
	initialState.state['layout-lab.3-tabbed-forms.metadata.author'] = { value: 'Austen', caseSensitive: false };
	initialState.state['layout-lab.4-nested-tabs.forms.search.fields.word'] = { value: 'sea', caseSensitive: false };
	initialState.state['layout-lab.4-nested-tabs.forms.search.fields.lemma'] = { value: 'wave', caseSensitive: false };
	initialState.state['layout-lab.4-nested-tabs.forms.options.sections.general.author'] = { value: 'Woolf', caseSensitive: false };
	initialState.state['layout-lab.4-nested-tabs.forms.options.sections.details.title'] = { value: 'To the Lighthouse', caseSensitive: false };
	initialState.state['layout-lab.4-nested-tabs.preview.keyword'] = { value: 'harbour', caseSensitive: false };

	return { runtime: new FormRuntime(definition, initialState) };
}

export const ProgressiveLayouts: Story = {
	render: () => ({
		components: { FormSystemStoryHarness },
		setup() {
			return createProgressiveLayoutsModel(useI18n());
		},
		template: '<FormSystemStoryHarness :runtime />',
	}),
};
