import { annotationTextController, type FormRuntime } from '@/features/form';

import { createTestBuilder, createTestRuntime, parentFormProbeView } from './helpers';

import TextField from '@/features/form/fields/generic/TextField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

export type FormFixture = {
	runtime: FormRuntime;
};

export function createSingleFormFixture(displayName = 'Word'): FormFixture {
	const builder = createTestBuilder();
	const form = builder.newForm('search.simple', ContainerRenderer, {
		title: 'Simple',
	});

	form.addChildren(
		builder.newField('search.simple.word', annotationTextController, TextField, {
			annotationId: 'word',
			displayName,
		}),
		builder.newView('search.simple.probe', parentFormProbeView, {}),
	);

	return {
		runtime: createTestRuntime(builder),
	};
}

export function createNestedFormRuntime() {
	const builder = createTestBuilder();
	const root = builder.newContainer('root', ContainerRenderer, { mode: 'tabs', frame: 'panel', tabTone: 'primary', tabsClass: 'text-primary' });
	const section = builder.newContainer('root.search', ContainerRenderer, { title: 'Search', layout: 'list' });
	const forms = builder.newContainer('root.search.forms', ContainerRenderer, { mode: 'tabs' });
	forms.addChildren(builder.newForm('root.search.simple', ContainerRenderer, { title: 'Simple' }));
	section.addChildren(forms);
	root.addChildren(section);
	return createTestRuntime(builder);
}
