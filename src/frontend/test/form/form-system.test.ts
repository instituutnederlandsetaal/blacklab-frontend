// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import { annotationTextController, filterTextController, FormSystem, type CompiledFormStateWithSummaries, type FormBuilder } from '@/features/form';
import { queryFragment, token, tokenPredicate } from '@/features/form/model/compile/query-artifact';
import { createFieldController } from '@/features/form/model/types/form-controllers';
import { tabId } from '@/features/form/ui/tab-utils';

import { TestTextField, createTestBuilder, parentFormProbeView, testTextController, type TestTextFieldConfig, type TestTextFieldState } from './helpers';

import TextField from '@/features/form/fields/generic/TextField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import HeadingView from '@/features/form/views/HeadingView.vue';
import SummaryView from '@/features/form/views/SummaryView.vue';

type FormFixture = {
	definition: FormBuilder;
};

const queryOnlyTextController = createFieldController<'query-only-text', TestTextFieldState, TestTextFieldConfig>({
	kind: 'query-only-text',
	createDefaultState: () => ({ value: '' }),
	getPersistKey: config => config.annotationId,
	affectsBlackLabParameters: ['patt'],
	encode: state => state.value || null,
	restore: payload => ({ value: Array.isArray(payload) ? (payload[0] ?? '') : payload }),
	getQueryContribution(config, _runtime, state) {
		return queryFragment(token(tokenPredicate('wildcard', config.annotationId, state.value, false)));
	},
});

function createSingleFormFixture(): FormFixture {
	const builder = createTestBuilder();
	const form = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });

	form.addChildren(
		builder.newField('search.simple.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		}),
		builder.newView('search.simple.probe', parentFormProbeView, {}),
	);

	return {
		definition: builder,
	};
}

function createAutocompleteTextFixture(): FormFixture {
	const builder = createTestBuilder();
	const form = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });

	form.addChildren(
		builder.newField('search.simple.annotation', annotationTextController, TextField, {
			annotationId: 'word',
			autocomplete: vi.fn(async () => []),
			displayName: 'Word',
		}),
	);

	return {
		definition: builder,
	};
}

function createSiblingFormsFixture(): FormFixture {
	const builder = createTestBuilder();
	builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' }).addChildren(
		builder.newField('search.simple.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Simple word',
		}),
	);
	builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' }).addChildren(
		builder.newField('search.extended.lemma', testTextController, TestTextField, {
			annotationId: 'lemma',
			displayName: 'Extended lemma',
		}),
	);

	return {
		definition: builder,
	};
}

function createSharedFieldTabsFixture(): FormFixture {
	const builder = createTestBuilder();
	const root = builder.newContainer('search', ContainerRenderer, {
		title: 'Search',
		variant: 'tabs',
	});
	const sharedField = builder.newField('shared.word', testTextController, TestTextField, {
		annotationId: 'word',
		displayName: 'Shared word',
	});
	root.addChildren(
		builder.newForm('search.first', ContainerRenderer, { title: 'First' }).addChildren(sharedField),
		builder.newForm('search.second', ContainerRenderer, { title: 'Second' }).addChildren(sharedField, builder.newView('search.second.probe', parentFormProbeView, {})),
	);

	return {
		definition: builder,
	};
}

function createTabbedFormFixture(): FormFixture {
	const builder = createTestBuilder();
	builder
		.newForm('search.tabbed', ContainerRenderer, {
			title: 'Tabbed search',
			variant: 'tabs',
		})
		.addChildren(
			builder.newContainer('search.tabbed.word', ContainerRenderer, { title: 'Word', combine: 'and' }).addChildren(
				builder.newField('search.tabbed.word.field', testTextController, TestTextField, {
					annotationId: 'word',
					displayName: 'Word',
				}),
			),
			builder.newContainer('search.tabbed.lemma', ContainerRenderer, { title: 'Lemma', combine: 'and' }).addChildren(
				builder.newField('search.tabbed.lemma.field', testTextController, TestTextField, {
					annotationId: 'lemma',
					displayName: 'Lemma',
				}),
				builder.newView('search.tabbed.lemma.probe', parentFormProbeView, {}),
			),
		);
	return {
		definition: builder,
	};
}

function createFilterTabsFixture(): FormFixture {
	const builder = createTestBuilder();
	builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' }).addChildren(
		builder.newContainer('shared.filters.wrapper', ContainerRenderer, {}).addChildren(
			builder.newView('shared.filters.heading', HeadingView, { title: 'Filter Search By...' }),
			builder.newContainer('shared.filters', ContainerRenderer, { variant: ['tabs', 'tab-badges'] }).addChildren(
				builder.newContainer('shared.filters.bibliographic', ContainerRenderer, { title: 'Bibliographic' }).addChildren(
					builder.newContainer('shared.filters.bibliographic.fields', ContainerRenderer, {}).addChildren(
						builder.newField('shared.filters.bibliographic.author', filterTextController, TextField, {
							displayName: 'Author',
							groupId: 'bibliographic',
							metadataFieldId: 'author',
						}),
					),
				),
			),
			builder.newView('shared.filters.summary', SummaryView, { summaryType: 'filter', title: 'Filter summary' }),
		),
	);

	return {
		definition: builder,
	};
}

describe('form system integration', () => {
	test('uses compact, unambiguous HTML ids for tabs', () => {
		expect(tabId('search.extended.annotations', 'search.extended.annotations.Part-of-Speech-features')).toBe('form-tab-search_2eextended_2eannotations--r-Part-of-Speech-features');
		expect(tabId('a.', 'child')).not.toBe(tabId('a_2e', 'child'));
		expect(tabId('parent', 'child')).not.toBe(tabId('parent', 'parent.child'));
	});

	test('can render a selected root form from a shared definition', () => {
		const fixture = createSiblingFormsFixture();
		const wrapper = mount(FormSystem, {
			props: {
				...fixture,
				rootId: 'search.extended',
			},
		});

		expect(wrapper.find('input[aria-label="Simple word"]').exists()).toBe(false);
		expect(wrapper.find('input[aria-label="Extended lemma"]').exists()).toBe(true);
	});

	test('mounted views receive live parent-form projections', async () => {
		const fixture = createSingleFormFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		expect(wrapper.get('[data-testid="parent-form-probe"] .form-id').text()).toBe('search.simple');
		expect(wrapper.get('[data-testid="parent-form-probe"] .cql').text()).toBe('');

		await wrapper.get('input[aria-label="Word"]').setValue('water');
		await nextTick();

		expect(wrapper.get('[data-testid="parent-form-probe"] .cql').text()).toBe('[word="(?i)water"]');
		expect(wrapper.get('[data-testid="parent-form-probe"] .summaries').text()).toBe('Word:water');
		expect(wrapper.get('[data-testid="parent-form-probe"] .state').text()).toContain('water');
	});

	test('submit emits a snapshot that is isolated from later edits', async () => {
		const fixture = createSingleFormFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		await wrapper.get('input[aria-label="Word"]').setValue('water');
		await wrapper.get('form').trigger('submit');

		const emitted = wrapper.emitted('submit') as Array<[string, CompiledFormStateWithSummaries]> | undefined;
		expect(emitted).toHaveLength(1);
		const [formId, snapshot] = emitted![0];

		expect(formId).toBe('search.simple');
		expect(snapshot.patt).toBe('[word="(?i)water"]');
		expect(snapshot.summaries).toEqual([{ id: 'search.simple.word', label: 'Word', value: 'water', summaryType: ['patt'] }]);

		await wrapper.get('input[aria-label="Word"]').setValue('fire');

		expect(snapshot.patt).toBe('[word="(?i)water"]');
		expect(snapshot.summaries).toEqual([{ id: 'search.simple.word', label: 'Word', value: 'water', summaryType: ['patt'] }]);
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

		const emitted = wrapper.emitted('submit') as Array<[string, CompiledFormStateWithSummaries]> | undefined;
		expect(emitted).toHaveLength(1);
		const [formId, snapshot] = emitted![0];

		expect(formId).toBe('search.simple');
		expect(snapshot.patt).toBe('[word="(?i)water"]');
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
						h(FormSystem, { definition: fixture.definition }),
					);
			},
		});
		const wrapper = mount(Harness);

		await wrapper.get('input[aria-label="Word"]').setValue('water');
		await wrapper.get('form').trigger('submit');

		expect(wrapper.findComponent(FormSystem).emitted('submit')).toHaveLength(1);
		expect(parentSubmit).not.toHaveBeenCalled();
	});

	test('replaceState updates rendered field state after mount', async () => {
		const fixture = createSingleFormFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});
		const runtime = fixture.definition;
		const replacement = structuredClone(runtime.state.getRawState());
		replacement.state['search.simple.word'] = { value: 'water' };

		runtime.state.replaceState(replacement);
		await nextTick();

		expect((wrapper.get('input[aria-label="Word"]').element as HTMLInputElement).value).toBe('water');

		await wrapper.get('input[aria-label="Word"]').setValue('fire');

		expect(runtime.state.state.value['search.simple.word']).toEqual({ value: 'fire' });
	});

	test('reused field nodes share state across tabbed forms', async () => {
		const fixture = createSharedFieldTabsFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		await wrapper.get('input[aria-label="Shared word"]').setValue('water');

		await wrapper.findAll('[role="tab"]')[1].trigger('click');
		await nextTick();

		expect((wrapper.get('input[aria-label="Shared word"]').element as HTMLInputElement).value).toBe('water');
		expect(wrapper.get('[data-testid="parent-form-probe"] .form-id').text()).toBe('search.second');
		expect(wrapper.get('[data-testid="parent-form-probe"] .summaries').text()).toBe('Shared word:water');
	});

	test('forms can render direct child containers as tabs without an extra wrapper container', async () => {
		const fixture = createTabbedFormFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		expect(wrapper.find('input[aria-label="Word"]').exists()).toBe(true);
		expect(wrapper.find('input[aria-label="Lemma"]').exists()).toBe(false);

		await wrapper.findAll('[role="tab"]')[1].trigger('click');
		await nextTick();

		expect(wrapper.find('input[aria-label="Word"]').exists()).toBe(false);
		expect(wrapper.find('input[aria-label="Lemma"]').exists()).toBe(true);

		await wrapper.get('input[aria-label="Lemma"]').setValue('water');
		await nextTick();

		expect(wrapper.get('[data-testid="parent-form-probe"] .form-id').text()).toBe('search.tabbed');
		expect(wrapper.get('[data-testid="parent-form-probe"] .summaries').text()).toBe('Lemma:water');
	});

	test('resolves getter titles and exposes linked, keyboard-operable tabs', async () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.form', ContainerRenderer, { title: () => 'Computed form', variant: 'tabs' });
		form.addChildren(
			builder.newContainer('search.first', ContainerRenderer, { title: () => 'Computed first' }),
			builder.newContainer('search.second', ContainerRenderer, { title: () => 'Computed second' }),
		);
		const wrapper = mount(FormSystem, { props: { definition: builder } });
		const tabs = wrapper.findAll('[role="tab"]');

		expect(wrapper.get('.blf-form-title').text()).toBe('Computed form');
		expect(tabs[0].text()).toBe('Computed first');
		expect(tabs[0].attributes('aria-controls')).toBeTruthy();
		expect(wrapper.get(`#${tabs[0].attributes('aria-controls')}`).attributes('aria-labelledby')).toBe(tabs[0].attributes('id'));
		expect(tabs[0].attributes('tabindex')).toBe('0');
		expect(tabs[1].attributes('tabindex')).toBe('-1');

		await tabs[0].trigger('keydown', { key: 'ArrowRight' });
		expect(builder.state.uiState.value[form.id]).toBe('search.second');
		expect(tabs[0].attributes('tabindex')).toBe('-1');
		expect(tabs[1].attributes('tabindex')).toBe('0');
	});

	test('array tab variants hide the active child container title', () => {
		const builder = createTestBuilder();
		const parent = builder.newContainer('search.tabs', ContainerRenderer, { variant: ['tabs'] });
		parent.addChildren(builder.newContainer('search.tabs.child', ContainerRenderer, { title: 'Hidden child title' }));
		const wrapper = mount(FormSystem, { props: { definition: builder } });

		expect(wrapper.find('.blf-container-title').exists()).toBe(false);
	});

	test('tab badges count descendant controllers with query contributions through layout wrappers', async () => {
		const fixture = createFilterTabsFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		expect(wrapper.find('[role="tab"] .badge').exists()).toBe(false);
		expect(wrapper.find('.blf-summary-view .entry').exists()).toBe(false);

		await wrapper.get('input[type="text"]').setValue('Austen');
		await nextTick();

		expect(wrapper.get('[role="tab"] .badge').text()).toBe('1');
		expect(wrapper.get('.blf-summary-view .entry .label').text()).toBe('Author');
		expect(wrapper.get('.blf-summary-view .entry .value').text()).toBe('Austen');
	});

	test('tab badges count query contributions that have no summary', async () => {
		const builder = createTestBuilder();
		builder.newForm('search.query-only', ContainerRenderer, { variant: ['tabs', 'tab-badges'] }).addChildren(
			builder.newContainer('search.query-only.tab', ContainerRenderer, { title: 'Query only' }).addChildren(
				builder.newContainer('search.query-only.tab.wrapper', ContainerRenderer, {}).addChildren(
					builder.newField('search.query-only.tab.field', queryOnlyTextController, TestTextField, {
						annotationId: 'word',
						displayName: 'Query only field',
					}),
				),
			),
		);
		const wrapper = mount(FormSystem, { props: { definition: builder } });

		await wrapper.get('input[aria-label="Query only field"]').setValue('water');
		await nextTick();

		expect(wrapper.get('[role="tab"] .badge').text()).toBe('1');
		expect(builder.compile('search.query-only').summaries).toEqual([]);
	});
});
