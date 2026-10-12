import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { computed } from 'vue';

import { annotationTextController, filterTextController, FormBuilder, FormRuntime, FormSystem } from '@/features/form';
import type { ContainerBehavior, ContainerPresentation } from '@/features/form/model/types/form-primitives';

import { useI18n, type Translate } from '@/shared/i18n';

import TextField from '../fields/generic/TextField.vue';
import ContainerRenderer from '../ui/ContainerRenderer.vue';
import FormSystemStoryHarness from './FormSystemStoryHarness.vue';

type StoryArgs = ContainerPresentation & Pick<ContainerBehavior, 'mode'> & { tabBadges: boolean };

function createRuntime(args: StoryArgs, translate: Translate) {
	const builder = new FormBuilder({ corpus: { indexId: 'container-presentation', textDirection: 'ltr' }, translate });
	const form = builder.newForm('presentation', ContainerRenderer, { ...args, title: 'Search sections', tabBadges: () => args.tabBadges });
	form.addChildren(
		builder
			.newContainer('words', ContainerRenderer, { title: 'Words' })
			.addChildren(
				builder.newField('word', annotationTextController, TextField, { annotationId: 'word', displayName: 'Word', controls: 'simple', size: 'large' }),
				builder.newField('lemma', annotationTextController, TextField, { annotationId: 'lemma', displayName: 'Lemma', controls: 'simple', layout: 'horizontal' }),
			),
		builder
			.newContainer('documents', ContainerRenderer, { title: 'Documents' })
			.addChildren(
				builder.newField('author', filterTextController, TextField, { metadataFieldId: 'author', displayName: 'Author', controls: 'simple' }),
				builder.newField('title', filterTextController, TextField, { metadataFieldId: 'title', displayName: 'Title', controls: 'simple' }),
			),
	);
	const runtime = new FormRuntime(builder);
	runtime.state.state.value.word = { value: 'water', caseSensitive: false };
	runtime.state.state.value.author = { value: 'Austen', caseSensitive: false };
	return runtime;
}

const meta = {
	title: 'Features/Form/Containers',
	parameters: {
		layout: 'fullscreen',
		docs: {
			description: {
				component:
					'Change behavior and display independently. Hidden fields still contribute to the compiled query. CSS overrides are ordinary strings; changing story settings recreates the sample form.',
			},
		},
	},
	args: { mode: 'all', frame: 'none', layout: 'list', tabSize: 'normal', tabTone: 'plain', tabBadges: false, class: '', style: '', bodyClass: '', bodyStyle: '', tabsClass: '', tabsStyle: '' },
	argTypes: {
		mode: { control: 'select', options: ['all', 'tabs'] },
		frame: { control: 'select', options: ['none', 'panel'] },
		layout: { control: 'select', options: ['list', 'columns'] },
		tabSize: { control: 'select', options: ['normal', 'small'] },
		tabTone: { control: 'select', options: ['plain', 'secondary', 'primary'] },
		tabBadges: { control: 'boolean' },
		class: { control: 'text' },
		style: { control: 'text' },
		bodyClass: { control: 'text' },
		bodyStyle: { control: 'text' },
		tabsClass: { control: 'text' },
		tabsStyle: { control: 'text' },
	},
	render: args => ({
		components: { FormSystemStoryHarness },
		setup() {
			const translate = useI18n();
			return { runtime: computed(() => createRuntime(args, translate)) };
		},
		template: '<FormSystemStoryHarness :runtime />',
	}),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const List: Story = {};
export const Panel: Story = { args: { frame: 'panel' } };
export const Columns: Story = { args: { frame: 'panel', layout: 'columns' } };
export const Tabs: Story = { args: { mode: 'tabs', tabBadges: true } };
export const PanelTabs: Story = { args: { mode: 'tabs', frame: 'panel', tabSize: 'small', tabTone: 'primary', tabBadges: true } };
export const SecondaryTabs: Story = { args: { mode: 'tabs', frame: 'panel', tabTone: 'secondary', tabBadges: true } };
export const CustomGrid: Story = { args: { frame: 'panel', bodyStyle: 'padding: 24px; display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 24px;' } };

export const PageContainer: Story = {
	args: { mode: 'tabs', frame: 'panel', tabTone: 'primary', tabBadges: true },
	render: args => ({
		components: { FormSystem },
		setup() {
			const translate = useI18n();
			return { runtime: computed(() => createRuntime(args, translate)) };
		},
		template: '<FormSystem class="container" :runtime />',
	}),
};
