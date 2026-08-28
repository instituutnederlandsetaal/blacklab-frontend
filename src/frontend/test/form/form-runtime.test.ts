// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { nextTick, ref, toRaw } from 'vue';

import { FormSystem, type FieldController } from '@/features/form';
import { annotation } from '@/features/form/model/types/form-query-ir';

import { TestTextField, createTestBuilder, createTestRuntime, testTextController, type TestTextFieldConfig, type TestTextFieldState } from './helpers';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

function createNestedFormRuntime() {
	const builder = createTestBuilder();
	const root = builder.newContainer('root', ContainerRenderer, { class: 'tabs-primary text-primary', variant: ['tabs', 'panel-tabs'] });
	const section = builder.newContainer('root.search', ContainerRenderer, { title: 'Search', variant: 'list' });
	const forms = builder.newContainer('root.search.forms', ContainerRenderer, { variant: 'tabs' });
	forms.addChildren(builder.newForm('root.search.simple', ContainerRenderer, { title: 'Simple' }));
	section.addChildren(forms);
	root.addChildren(section);
	return createTestRuntime(builder);
}

describe('form runtime', () => {
	test('compiles only registered form boundaries', () => {
		const builder = createTestBuilder();
		const root = builder.newContainer('root', ContainerRenderer, {});
		builder.newForm('form', ContainerRenderer, {});
		const runtime = createTestRuntime(builder);

		expect(() => runtime.compile(root.id)).toThrow("Cannot compile unknown form 'root'.");
	});

	test('compile detaches nested summaries, encoded tabs, and result presets from later runtime edits', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });
		type SnapshotState = TestTextFieldState & { groupBy: string[]; groupDisplayMode: 'table' | 'tokens'; summaryTypes: Array<'filter' | 'patt'> };
		const snapshotController: FieldController<'snapshot-text', SnapshotState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'snapshot-text',
			createDefaultState: () => ({ value: '', groupBy: [], groupDisplayMode: 'table', summaryTypes: [] }),
			persistence: {
				...testTextController.persistence,
				codec: testTextController.persistence.codec.transform<SnapshotState>({
					encode: state => ({ value: state.value }),
					decode: state => ({ ...state, groupBy: [], groupDisplayMode: 'table', summaryTypes: [] }),
				}),
			},
			outputs: ['patt', 'group'],
			collect(config, _context, state, emit) {
				const pattern = annotation(config.annotationId, 'wildcard', state.value);
				if (pattern) emit('patt', pattern);
				emit('group', state.groupBy);
			},
			getResultPreset: (_config, _context, state) => state.groupDisplayMode,
			summarize(_config, _context, state, emit) {
				if (state.value) emit({ label: 'Word', value: state.value, summaryType: state.summaryTypes });
			},
		};
		const field = builder.newField('search.simple.word', snapshotController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		const alternative = builder.newContainer('search.simple.alternative', ContainerRenderer, {});
		const tabs = builder.newContainer('search.simple.tabs', ContainerRenderer, {});
		tabs.prependChild(alternative, { outputWhenActive: emit => emit('searchfield', 'alternative') });
		tabs.prependChild(field, { outputWhenActive: emit => emit('searchfield', 'contents') });
		form.addChildren(tabs);

		const runtime = createTestRuntime(builder);
		const callerOwnedState: SnapshotState = { value: 'water', groupBy: ['water'], groupDisplayMode: 'table', summaryTypes: ['patt'] };
		runtime.state.state.value[field.id] = callerOwnedState;

		const submitted = runtime.compile(form.id);
		callerOwnedState.value = 'fire';
		callerOwnedState.groupBy[0] = 'fire';
		callerOwnedState.groupDisplayMode = 'tokens';
		callerOwnedState.summaryTypes[0] = 'filter';
		runtime.state.uiState.value[tabs.id] = alternative.id;

		expect(runtime.compile(form.id)).toMatchObject({
			params: { group: 'fire', searchfield: 'alternative' },
			encoded: { 'f.tab': [`${tabs.id}:${alternative.id}`] },
			resultPreset: 'tokens',
			summaries: [{ label: 'Word', value: 'fire', summaryType: ['filter'] }],
		});
		expect(submitted).toMatchObject({
			params: { group: 'water', patt: '[word="water"]', searchfield: 'contents' },
			encoded: {
				'f.form': form.id,
				'f.tab': [`${tabs.id}:${field.id}`],
				'f.word': 'water',
			},
			resultPreset: 'table',
			summaries: [{ label: 'Word', value: 'water', summaryType: ['patt'] }],
		});
	});

	test('replaceState clones caller-owned nested field state', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });
		const field = builder.newField('search.simple.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		form.addChildren(field);
		const runtime = createTestRuntime(builder);
		const replacement = {
			state: structuredClone(toRaw(runtime.state.state.value)),
			uiState: structuredClone(toRaw(runtime.state.uiState.value)),
			rawOverrides: structuredClone(toRaw(runtime.state.rawOverrides.value)),
		};
		const callerOwned = {
			value: 'water',
			composite: {
				tokens: [{ value: 'nested water', modifiers: ['literal'] }],
				settings: { caseSensitive: false },
			},
		};
		replacement.state[field.id] = callerOwned;

		runtime.state.replaceState(replacement);
		callerOwned.value = 'changed later';
		callerOwned.composite.tokens[0].value = 'changed nested value';
		callerOwned.composite.tokens[0].modifiers.push('case-sensitive');
		callerOwned.composite.settings.caseSensitive = true;

		expect(runtime.state.state.value[field.id]).toEqual({
			value: 'water',
			composite: {
				tokens: [{ value: 'nested water', modifiers: ['literal'] }],
				settings: { caseSensitive: false },
			},
		});
	});

	test('switching form tabs updates container ui state', async () => {
		const builder = createTestBuilder();
		const root = builder.newContainer('search', ContainerRenderer, {
			title: 'Search',
			variant: 'tabs',
		});
		const firstForm = builder.newForm('search.first', ContainerRenderer, { title: 'First' });
		const secondForm = builder.newForm('search.second', ContainerRenderer, { title: 'Second' });
		firstForm.addChildren(
			builder.newField('search.first.word', testTextController, TestTextField, {
				annotationId: 'word',
				displayName: 'Word',
			}),
		);
		secondForm.addChildren(
			builder.newField('search.second.lemma', testTextController, TestTextField, {
				annotationId: 'lemma',
				displayName: 'Lemma',
			}),
		);
		root.addChildren(firstForm, secondForm);

		const runtime = createTestRuntime(builder);
		const wrapper = mount(FormSystem, {
			props: {
				runtime,
			},
		});

		expect(runtime.state.uiState.value[root.id]).toBe(firstForm.id);

		await wrapper.findAll('[role="tab"]')[1].trigger('click');

		expect(runtime.state.uiState.value[root.id]).toBe(secondForm.id);
	});

	test('renders supplied actions alongside a form submit and reset', () => {
		const builder = createTestBuilder();
		builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });
		const runtime = createTestRuntime(builder);
		const wrapper = mount(FormSystem, {
			props: { runtime },
			slots: {
				actions: '<button type="button" class="legacy-action">History</button>',
			},
		});

		const actions = wrapper.get('.blf-form-actions.btn-toolbar');
		expect(actions.find('[type="submit"]').exists()).toBe(true);
		expect(actions.find('[type="reset"]').exists()).toBe(true);
		expect(actions.get('.legacy-action').attributes('type')).toBe('button');
	});

	test('forwards supplied actions through nested containers to the active form', () => {
		const wrapper = mount(FormSystem, {
			props: { runtime: createNestedFormRuntime() },
			slots: {
				actions: '<button type="button" class="legacy-action">History</button>',
			},
		});

		expect(wrapper.get('.blf-form-actions').get('.legacy-action').text()).toBe('History');
	});

	test('applies panel-tab surface classes without legacy panel classes', () => {
		const wrapper = mount(FormSystem, {
			props: { runtime: createNestedFormRuntime() },
		});

		expect(wrapper.get('[role="tablist"]').classes()).toEqual(expect.arrayContaining(['tabs-primary', 'text-primary', 'blf-form-surface-tabs']));
		expect(wrapper.get('[role="tabpanel"]').classes()).toEqual(expect.arrayContaining(['blf-form-tab-body', 'blf-form-surface-body']));
		expect(wrapper.get('.blf-form-surface').classes()).not.toContain('panel');
		expect(wrapper.get('form.blf-form').classes()).not.toContain('panel-default');
		expect(wrapper.find('form.blf-form > .blf-form-content').exists()).toBe(true);
	});

	test('resolves deferred display props reactively', async () => {
		const displayName = ref('Word');
		const builder = createTestBuilder();
		const form = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });
		form.addChildren(
			builder.newField('search.simple.word', testTextController, TestTextField, {
				annotationId: 'word',
				displayName: () => displayName.value,
			}),
		);
		const runtime = createTestRuntime(builder);
		const wrapper = mount(FormSystem, { props: { runtime } });

		expect(wrapper.get('input').attributes('aria-label')).toBe('Word');

		displayName.value = 'Woord';
		await nextTick();

		expect(wrapper.get('input').attributes('aria-label')).toBe('Woord');
	});
});
