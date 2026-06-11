import type { Meta, StoryObj } from '@storybook/vue3-vite';

import { annotationTextController, type FormRuntimeContext } from '@/features/form/index.ts';
import { FormBuilder } from '@/features/form/model/builder/form-shape-builder.ts';

import type { FieldPresentation, FormNode } from '../model/types/form-shape';

import { createMockI18n } from '@/shared/i18n/mock.ts';

import TextField from '../fields/generic/TextField.vue';
import GenericFieldStoryHarness from './GenericFieldStoryHarness.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

const fieldVariantOptions = ['default', 'simple', 'large', 'small'] as const satisfies FieldPresentation[];
type FieldVariantArg = FieldPresentation | FieldPresentation[] | undefined;

const meta = {
	title: 'Features/Form/UI Elements',
	// component: GenericFieldStoryHarness,
	parameters: {
		layout: 'padded',
	},
	argTypes: {
		variant: {
			control: { type: 'check' },
			options: fieldVariantOptions,
		},
	},
} satisfies Meta<typeof GenericFieldStoryHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

// type GenericFieldStoryDefinition = {
// 	fieldComponent: Component;
// 	config: object;
// 	initialValue: unknown;
// 	htmlId?: string;
// 	showLabel?: boolean;
// };

function createGenericFieldStory(buildField: (builder: FormBuilder) => FormNode): Story {
	return {
		render: args => ({
			components: { GenericFieldStoryHarness },
			setup: () => {
				console.log('setup called', args);

				const translate = createMockI18n().translate;
				const builder = new FormBuilder();
				const form = builder.newForm('root', ContainerRenderer, {});
				form.addChildren(buildField(builder));

				const definition = builder.build();
				const context: FormRuntimeContext = {
					corpus: {
						indexId: 'Storybook Example index',
						textDirection: 'ltr',
					},
					translate,
				};

				return { definition, context, variant: args.variant };
			},
			template: '<GenericFieldStoryHarness :key="variant?.join(`,`)" :definition="definition" :context="context" :variant="variant" />',
		}),
	};

	// return {
	// 	args: {variant: ['default']},
	// 	render: args => ({
	// 		components: { FormSystemStoryHarness },
	// 		setup: () => {
	// 			watch(args.variant);
	// 			const model = computed(() => {
	// 				const nextModel = createModel();
	// 				applyVariantToFields(nextModel.definition.root, normalizeVariantArg(getVariantArg(args)));
	// 				return nextModel;
	// 			});
	// 			const variantKey = computed(() => normalizeVariantArg(getVariantArg(args))?.join(',') ?? 'implicit-default');
	// 			return { model, variantKey };
	// 		},
	// 		template: '<FormSystemStoryHarness :key="variantKey" :definition="model.definition" :context="model.context" :initial-state="model.initialState" :initial-submitted="model.initialSubmitted" />',
	// 	}),
	// };

	// return {
	// 	args: {
	// 		variant: ['default'],
	// 	} as any,
	// 	render: args => ({
	// 		setup: () => () =>
	// 			h(GenericFieldStoryHarness, {
	// 				definition,
	// 				context,
	// 			}),
	// 	}),
	// };
}

// function createGenericFieldStory(definition: GenericFieldStoryDefinition): Story {
// 	return {
// 		args: {
// 			variant: ['default'],
// 		} as any,
// 		render: args => ({
// 			setup: () => () =>
// 				h(GenericFieldStoryHarness, {
// 					...definition,
// 					variant: normalizeVariantArg(getVariantArg(args)),
// 				}),
// 		}),
// 	};
// }

function getVariantArg(args: unknown): FieldVariantArg {
	return (args as { variant?: FieldVariantArg }).variant;
}

function normalizeVariantArg(variant: FieldVariantArg): FieldPresentation[] | undefined {
	if (!variant) return undefined;
	const variants = Array.isArray(variant) ? variant : [variant];
	return variants.length ? variants : undefined;
}

function applyVariantToFields(node: FormNode, variant: FieldPresentation[] | undefined) {
	if (node.kind === 'field') {
		node.variant = variant;
	}

	if ('children' in node) {
		for (const child of node.children) applyVariantToFields(child, variant);
	}
}

// function createFormBackedFieldStory(createModel: () => StoryFormSystemModel): Story {
// 	return {
// 		args: {
// 			variant: ['default'],
// 		} as any,
// 		render: args => ({
// 			components: { FormSystemStoryHarness },
// 			setup: () => {
// 				const model = computed(() => {
// 					const nextModel = createModel();
// 					applyVariantToFields(nextModel.definition.root, normalizeVariantArg(getVariantArg(args)));
// 					return nextModel;
// 				});
// 				const variantKey = computed(() => normalizeVariantArg(getVariantArg(args))?.join(',') ?? 'implicit-default');
// 				return { model, variantKey };
// 			},
// 			template: '<FormSystemStoryHarness :key="variantKey" :definition="model.definition" :context="model.context" :initial-state="model.initialState" :initial-submitted="model.initialSubmitted" />',
// 		}),
// 	};
// }

export const Text: Story = createGenericFieldStory(builder =>
	builder.newField('generic-text', annotationTextController, TextField, {
		displayName: 'Keyword',
		description: 'Free-text query with a case sensitivity toggle.',
		placeholder: 'Search term',
		caseSensitive: true,
		annotationId: 'generic-text-annotation',
	}),
);
// 	fieldComponent: TextField,
// 	config: {
// 		displayName: 'Keyword',
// 		description: 'Free-text query with a case sensitivity toggle.',
// 		placeholder: 'Search term',
// 		caseSensitive: true,
// 	},
// 	initialValue: {
// 		value: 'Austen',
// 		caseSensitive: false,
// 	},
// 	htmlId: 'generic-text',
// });

// export const Autocomplete: Story = createGenericFieldStory({
// 	fieldComponent: TextField,
// 	config: {
// 		displayName: 'Author',
// 		description: 'Autocomplete suggestions use the same generic text widget.',
// 		placeholder: 'Start typing a name',
// 		autocomplete: async (term: string) => ['Austen', 'Baldwin', 'Brinkman', 'Couperus', 'Diderot', 'Eliot'].filter(value => value.toLowerCase().startsWith(term.toLowerCase())),
// 	},
// 	initialValue: {
// 		value: '',
// 		caseSensitive: false,
// 	},
// 	htmlId: 'generic-autocomplete',
// });

// export const Checkbox: Story = createGenericFieldStory({
// 	fieldComponent: CheckboxField,
// 	config: {
// 		displayName: 'Genre',
// 		description: 'Multi-select options rendered directly from config.',
// 		options: [
// 			{ value: 'fiction', label: 'Fiction' },
// 			{ value: 'essay', label: 'Essay' },
// 			{ value: 'newspaper', label: 'Newspaper' },
// 		],
// 	},
// 	initialValue: {
// 		fiction: true,
// 		essay: false,
// 	},
// 	htmlId: 'generic-checkbox',
// });

// export const Radio: Story = createGenericFieldStory({
// 	fieldComponent: RadioField,
// 	config: {
// 		displayName: 'Availability',
// 		description: 'Single-select options with the standard radio contract.',
// 		options: [
// 			{ value: 'public', label: 'Public' },
// 			{ value: 'restricted', label: 'Restricted' },
// 			{ value: 'private', label: 'Private' },
// 		],
// 	},
// 	initialValue: 'restricted',
// 	htmlId: 'generic-radio',
// });

// export const Select: Story = createGenericFieldStory({
// 	fieldComponent: SelectField,
// 	config: {
// 		displayName: 'Language',
// 		description: 'Select retains the direct generic renderer contract.',
// 		placeholder: 'Choose one or more languages',
// 		multiple: true,
// 		options: [
// 			{ value: 'en', label: 'English' },
// 			{ value: 'nl', label: 'Dutch' },
// 			{ value: 'de', label: 'German' },
// 		],
// 	},
// 	initialValue: ['en', 'nl'],
// 	htmlId: 'generic-select',
// });

// export const Date: Story = createGenericFieldStory({
// 	fieldComponent: DateField,
// 	config: {
// 		displayName: 'Publication date',
// 		description: 'Range-aware date widget with optional mode switching.',
// 		range: true,
// 		min: '16000101',
// 		max: '20251231',
// 	},
// 	initialValue: {
// 		startDate: { y: '1800', m: '01', d: '01' },
// 		endDate: { y: '1900', m: '12', d: '31' },
// 		mode: 'strict',
// 	},
// 	htmlId: 'generic-date',
// });

// export const Range: Story = createGenericFieldStory({
// 	fieldComponent: RangeField,
// 	config: {
// 		displayName: 'Year range',
// 		description: 'Standalone lower/upper bound inputs.',
// 		inputType: 'number',
// 		lowPlaceholder: 'From year',
// 		highPlaceholder: 'To year',
// 		showMode: true,
// 	},
// 	initialValue: {
// 		low: '1800',
// 		high: '1900',
// 		mode: 'strict',
// 	},
// 	htmlId: 'generic-range',
// });

// export const PartOfSpeech = createGenericFieldStory({
// 	fieldComponent: AnnotationPosField,
// 	htmlId: 'generic-pos',
// 	config: createAnnotationPosConfig(),
// 	initialValue: {},
// });

// export const Parallel: Story = createFormBackedFieldStory(createParallelFieldStoryModel);

// export const Within: Story = createFormBackedFieldStory(createWithinFieldStoryModel);

// export const ExpertQuery: Story = createFormBackedFieldStory(createExpertQueryFieldStoryModel);
