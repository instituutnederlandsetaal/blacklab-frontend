// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { defineComponent, h, nextTick, ref, shallowRef, toRaw } from 'vue';

import { annotationTextController, FormSystem, createFormFieldNode, expertQueryController } from '@/features/form';
import { provideFormSystemRuntime } from '@/features/form/model/runtime';

import { createSingleFormFixture, createNestedFormRuntime, type FormFixture } from './form-ui-fixtures';
import { createTestBuilder, createTestRuntime } from './helpers';

import TextField from '@/features/form/fields/generic/TextField.vue';
import RawCqlField from '@/features/form/fields/RawCqlField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import FieldRenderer from '@/features/form/ui/FieldRenderer.vue';
import Tabs from '@/shared/ui/Tabs.vue';

function createSiblingFormsFixture(): FormFixture {
	const builder = createTestBuilder();
	builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' }).addChildren(
		builder.newField('search.simple.word', annotationTextController, TextField, {
			annotationId: 'word',
			displayName: 'Simple word',
		}),
	);
	builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' }).addChildren(
		builder.newField('search.extended.lemma', annotationTextController, TextField, {
			annotationId: 'lemma',
			displayName: 'Extended lemma',
		}),
	);

	return {
		runtime: createTestRuntime(builder),
	};
}

describe('form rendering and reactive bindings', () => {
	test('renders the definition root', () => {
		const fixture = createSiblingFormsFixture();
		const wrapper = mount(FormSystem, { props: fixture });

		expect(wrapper.find('input[placeholder="Simple word"]').exists()).toBe(true);
		expect(wrapper.find('input[placeholder="Extended lemma"]').exists()).toBe(false);
	});

	test('forwards host attributes to the rendered root', () => {
		const fixture = createSingleFormFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
			attrs: { 'data-form-host': 'search' },
		});

		expect(wrapper.findAll('.blf-form-system, form.blf-form').map(node => [node.element.tagName, node.attributes('data-form-host')])).toEqual([
			['DIV', 'search'],
			['FORM', undefined],
		]);
	});

	test('mounted views receive live parent-form projections', async () => {
		const fixture = createSingleFormFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		expect(wrapper.get('[data-testid="parent-form-probe"] .form-id').text()).toBe('search.simple');
		expect(wrapper.get('[data-testid="parent-form-probe"] .cql').text()).toBe('');

		await wrapper.get('input[placeholder="Word"]').setValue('water');
		await nextTick();

		expect(wrapper.get('[data-testid="parent-form-probe"] .cql').text()).toBe('[word="water"]');
		expect(wrapper.get('[data-testid="parent-form-probe"] .summaries').text()).toBe('Word:water');
		expect(wrapper.get('[data-testid="parent-form-probe"] .state').text()).toContain('water');
	});

	test('runtime replacement refreshes controls and injected reads while isolating write-back', async () => {
		const oldRuntime = createSingleFormFixture('Old word').runtime;
		const newRuntime = createSingleFormFixture('New word').runtime;
		newRuntime.state.state.value['search.simple.word'] = { value: 'new-initial', caseSensitive: false };
		const currentRuntime = shallowRef(oldRuntime);
		const Harness = defineComponent({
			setup: () => () => h(FormSystem, { runtime: currentRuntime.value }),
		});
		const wrapper = mount(Harness);
		await wrapper.get('input[placeholder="Old word"]').setValue('old-draft');
		expect(wrapper.get('[data-testid="parent-form-probe"] .cql').text()).toBe('[word="old-draft"]');

		currentRuntime.value = newRuntime;
		await nextTick();

		expect(wrapper.find('input[placeholder="Old word"]').exists()).toBe(false);
		expect((wrapper.get('input[placeholder="New word"]').element as HTMLInputElement).value).toBe('new-initial');
		expect(wrapper.get('[data-testid="parent-form-probe"] .cql').text()).toBe('[word="new-initial"]');

		await wrapper.get('input[placeholder="New word"]').setValue('new-draft');

		expect(wrapper.get('[data-testid="parent-form-probe"] .cql').text()).toBe('[word="new-draft"]');
		expect(newRuntime.state.state.value['search.simple.word']).toEqual({ value: 'new-draft', caseSensitive: false });
		expect(oldRuntime.state.state.value['search.simple.word']).toEqual({ value: 'old-draft', caseSensitive: false });
	});

	test('runtime state updates preserve a mounted view’s local draft', async () => {
		const DraftView = defineComponent({
			setup() {
				const draft = ref('');
				return () =>
					h('input', {
						'aria-label': 'Local draft',
						value: draft.value,
						onInput: (event: Event) => {
							draft.value = (event.target as HTMLInputElement).value;
						},
					});
			},
		});
		const builder = createTestBuilder();
		builder.newForm('search.simple', ContainerRenderer, {}).addChildren(builder.newView('search.simple.draft', DraftView, {}));
		const runtime = createTestRuntime(builder);
		const wrapper = mount(FormSystem, { props: { runtime } });
		await wrapper.get('input[aria-label="Local draft"]').setValue('unfinished draft');

		runtime.state.rawOverrides.value.patt = '[word="override"]';
		await nextTick();

		expect((wrapper.get('input[aria-label="Local draft"]').element as HTMLInputElement).value).toBe('unfinished draft');
	});

	test('replaceState refreshes a mounted value and preserves its write-back binding', async () => {
		const fixture = createSingleFormFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});
		const runtime = fixture.runtime;
		const replacement = {
			state: structuredClone(toRaw(runtime.state.state.value)),
			uiState: structuredClone(toRaw(runtime.state.uiState.value)),
			rawOverrides: structuredClone(toRaw(runtime.state.rawOverrides.value)),
		};
		replacement.state['search.simple.word'] = { value: 'water', caseSensitive: false };

		runtime.state.replaceState(replacement);
		await nextTick();

		expect((wrapper.get('input[placeholder="Word"]').element as HTMLInputElement).value).toBe('water');

		await wrapper.get('input[placeholder="Word"]').setValue('fire');

		expect(runtime.state.state.value['search.simple.word']).toEqual({
			value: 'fire',
			caseSensitive: false,
		});
	});

	test('renders, disables, and dismisses a patt override', async () => {
		const fixture = createSingleFormFixture();
		fixture.runtime.state.rawOverrides.value.patt = '[word="(?i)fire"]';

		const wrapper = mount(FormSystem, {
			props: {
				runtime: fixture.runtime,
			},
		});
		await wrapper.vm.$nextTick();

		expect(wrapper.get('.blf-raw-override code').text()).toBe('[word="(?i)fire"]');
		expect((wrapper.get('input[placeholder="Word"]').element as HTMLInputElement).disabled).toBe(true);

		await wrapper.get('.blf-raw-override button').trigger('click');

		expect(wrapper.find('.blf-raw-override').exists()).toBe(false);
		expect((wrapper.get('input[placeholder="Word"]').element as HTMLInputElement).disabled).toBe(false);
	});

	test('applies the panel frame and tab presentation to their respective elements', () => {
		const wrapper = mount(FormSystem, {
			props: { runtime: createNestedFormRuntime() },
			global: { stubs: { Tabs: true } },
		});

		expect(wrapper.getComponent(Tabs).classes()).toEqual(expect.arrayContaining(['tabs-primary', 'text-primary', 'blf-form-container-tabs']));
		expect(wrapper.get('[role="tabpanel"]').classes()).toContain('blf-form-content');
		expect(wrapper.get('.blf-form-container').classes()).toEqual(expect.arrayContaining(['panel', 'panel-default']));
		expect(wrapper.get('form.blf-form').classes()).not.toContain('panel-default');
		expect(wrapper.find('form.blf-form > .blf-form-content').exists()).toBe(true);
	});

	test('resolves deferred display props reactively', async () => {
		const displayName = ref('Word');
		const builder = createTestBuilder();
		const form = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });
		form.addChildren(
			builder.newField('search.simple.word', annotationTextController, TextField, {
				annotationId: 'word',
				displayName: () => displayName.value,
			}),
		);
		const runtime = createTestRuntime(builder);
		const wrapper = mount(FormSystem, { props: { runtime } });

		expect(wrapper.get('input').attributes('placeholder')).toBe('Word');
		expect(wrapper.get('label.control-label').text()).toBe('Word');

		displayName.value = 'Woord';
		await nextTick();

		expect(wrapper.get('input').attributes('placeholder')).toBe('Woord');
		expect(wrapper.get('label.control-label').text()).toBe('Woord');
	});
});

describe('field override rendering', () => {
	test.each(['patt', 'collpatt'] as const)('renderer disables a field when its %s output is overridden', async parameter => {
		const runtime = createTestRuntime(createTestBuilder());
		const field = createFormFieldNode('query', { ...expertQueryController, outputs: [parameter] }, RawCqlField, {});
		const Host = defineComponent({
			setup() {
				provideFormSystemRuntime(shallowRef(runtime));
				return () => h(FieldRenderer, { field, htmlId: 'query', modelValue: '' });
			},
		});
		const wrapper = mount(Host);
		expect(wrapper.get('textarea').attributes('disabled')).toBeUndefined();
		runtime.state.rawOverrides.value[parameter] = '[word="restored"]';
		await nextTick();
		expect(wrapper.get('textarea').attributes('disabled')).toBeDefined();
		runtime.clearRawOverride(parameter);
		await nextTick();
		expect(wrapper.get('textarea').attributes('disabled')).toBeUndefined();
	});
});
