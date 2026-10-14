// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import { FormSystem, type CompiledFormResult, annotationTextController } from '@/features/form';

import { createSingleFormFixture, createNestedFormRuntime, type FormFixture } from './form-ui-fixtures';
import { createTestBuilder, createTestRuntime } from './helpers';

import TextField from '@/features/form/fields/generic/TextField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

enableAutoUnmount(afterEach);

function createAutocompleteTextFixture(): FormFixture {
	const builder = createTestBuilder();
	const form = builder.newForm('search.simple', ContainerRenderer, {
		title: 'Simple',
	});

	form.addChildren(
		builder.newField('search.simple.annotation', annotationTextController, TextField, {
			annotationId: 'word',
			autocomplete: async () => [],
			displayName: 'Word',
		}),
	);

	return {
		runtime: createTestRuntime(builder),
	};
}

describe('form submit and reset actions', () => {
	test('reset restores form state and emits one scoped reset event', async () => {
		const fixture = createSingleFormFixture();
		fixture.runtime.state.state.value['search.simple.word'] = {
			value: 'draft',
			caseSensitive: false,
		};
		const wrapper = mount(FormSystem, { props: fixture });

		await wrapper.get('form').trigger('reset');

		expect(fixture.runtime.state.state.value['search.simple.word']).toEqual({
			value: '',
			caseSensitive: false,
		});
		expect(wrapper.emitted('reset')).toHaveLength(1);
	});

	test('editable autocomplete submits the latest input event without waiting for a tick', async () => {
		const fixture = createAutocompleteTextFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});
		const input = wrapper.get('input[type="text"]').element as HTMLInputElement;

		input.value = 'water';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await wrapper.get('form').trigger('submit');

		const emitted = wrapper.emitted('submit') as Array<[CompiledFormResult]> | undefined;
		expect(emitted).toHaveLength(1);
		const [snapshot] = emitted![0];

		expect(snapshot.formId).toBe('search.simple');
		expect(snapshot.params.patt).toBe('[word="water"]');
		expect(snapshot.encoded).toEqual({
			'f.form': 'search.simple',
			'f.word': 'water',
		});
	});

	test('submit does not bubble to parent form handlers', async () => {
		const fixture = createSingleFormFixture();
		const parentSubmit = vi.fn();
		const Harness = defineComponent({
			setup() {
				return () =>
					h(
						'div',
						{
							onSubmit: parentSubmit,
						},
						h(FormSystem, { runtime: fixture.runtime }),
					);
			},
		});
		const wrapper = mount(Harness);

		await wrapper.get('input[placeholder="Word"]').setValue('water');
		await wrapper.get('form').trigger('submit');

		expect(wrapper.findComponent(FormSystem).emitted('submit')).toHaveLength(1);
		expect(parentSubmit).not.toHaveBeenCalled();
	});

	test('submit remains scoped to its mounted form host', async () => {
		const simpleRuntime = createSingleFormFixture('Simple word').runtime;
		const extendedRuntime = createSingleFormFixture('Extended lemma').runtime;
		const simpleSubmit = vi.fn();
		const extendedSubmit = vi.fn();
		const Harness = defineComponent({
			setup: () => () => h('div', [h(FormSystem, { runtime: simpleRuntime, onSubmit: simpleSubmit }), h(FormSystem, { runtime: extendedRuntime, onSubmit: extendedSubmit })]),
		});
		const wrapper = mount(Harness);

		await wrapper.get('input[placeholder="Simple word"]').setValue('water');
		await wrapper.findAll('form')[0].trigger('submit');

		expect(simpleSubmit).toHaveBeenCalledOnce();
		expect(extendedSubmit).not.toHaveBeenCalled();
	});

	test('forwards supplied actions through nested containers to the active form', () => {
		const wrapper = mount(FormSystem, {
			props: { runtime: createNestedFormRuntime() },
			slots: {
				actions: '<button type="button" class="legacy-action">History</button>',
			},
		});

		const actions = wrapper.get('.blf-form-actions');
		expect(actions.find('[type="submit"]').exists()).toBe(true);
		expect(actions.find('[type="reset"]').exists()).toBe(true);
		expect(actions.get('.legacy-action').text()).toBe('History');
	});
});
