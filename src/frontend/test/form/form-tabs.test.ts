// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, test } from 'vitest';
import { nextTick } from 'vue';

import { FormSystem, annotationTextController, filterTextController } from '@/features/form';
import { tabId } from '@/features/form/ui/tab-utils';

import { type FormFixture } from './form-ui-fixtures';
import { createTestBuilder, createTestRuntime } from './helpers';

import TextField from '@/features/form/fields/generic/TextField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

enableAutoUnmount(afterEach);

function createSharedFieldTabsFixture(): FormFixture {
	const builder = createTestBuilder();
	const root = builder.newContainer('search', ContainerRenderer, {
		title: 'Search',
		mode: 'tabs',
	});
	const sharedField = builder.newField('shared.word', annotationTextController, TextField, {
		annotationId: 'word',
		displayName: 'Shared word',
	});
	root.addChildren(
		builder.newForm('search.first', ContainerRenderer, { title: 'First' }).addChildren(sharedField),
		builder.newForm('search.second', ContainerRenderer, { title: 'Second' }).addChildren(sharedField),
	);

	return {
		runtime: createTestRuntime(builder),
	};
}

function createTabbedFormFixture(): FormFixture {
	const builder = createTestBuilder();
	builder
		.newForm('search.tabbed', ContainerRenderer, {
			title: 'Tabbed search',
			mode: 'tabs',
		})
		.addChildren(
			builder
				.newContainer('search.tabbed.word', ContainerRenderer, {
					title: 'Word',
					combine: 'and',
				})
				.addChildren(
					builder.newField('search.tabbed.word.field', annotationTextController, TextField, {
						annotationId: 'word',
						displayName: 'Word',
					}),
				),
			builder
				.newContainer('search.tabbed.lemma', ContainerRenderer, {
					title: 'Lemma',
					combine: 'and',
				})
				.addChildren(
					builder.newField('search.tabbed.lemma.field', annotationTextController, TextField, {
						annotationId: 'lemma',
						displayName: 'Lemma',
					}),
				),
		);
	return {
		runtime: createTestRuntime(builder),
	};
}

function createFilterTabsFixture(): FormFixture {
	const builder = createTestBuilder();
	builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' }).addChildren(
		builder.newContainer('shared.filters.wrapper', ContainerRenderer, {}).addChildren(
			builder
				.newContainer('shared.filters', ContainerRenderer, {
					mode: 'tabs',
					tabBadges: true,
				})
				.addChildren(
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
		),
	);

	return {
		runtime: createTestRuntime(builder),
	};
}

function createGetterTabsFixture() {
	const builder = createTestBuilder();
	const form = builder.newForm('search.form', ContainerRenderer, {
		title: () => 'Computed form',
		mode: 'tabs',
	});
	form.addChildren(
		builder.newContainer('search.first', ContainerRenderer, {
			title: () => 'Computed first',
		}),
		builder.newContainer('search.second', ContainerRenderer, {
			title: () => 'Computed second',
		}),
	);
	return { runtime: createTestRuntime(builder) };
}

describe('form tab navigation', () => {
	test('uses compact, unambiguous HTML ids for tabs', () => {
		expect(tabId('search.extended.annotations', 'search.extended.annotations.Part-of-Speech-features')).toBe('form-tab-search_2eextended_2eannotations--r-Part-of-Speech-features');
		expect(tabId('a.', 'child')).not.toBe(tabId('a_2e', 'child'));
		expect(tabId('parent', 'child')).not.toBe(tabId('parent', 'parent.child'));
	});

	test('reused field nodes share state across tabbed forms', async () => {
		const fixture = createSharedFieldTabsFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		await wrapper.get('input[placeholder="Shared word"]').setValue('water');

		await wrapper.findAll('[role="tab"]')[1].trigger('click');
		await nextTick();

		expect((wrapper.get('input[placeholder="Shared word"]').element as HTMLInputElement).value).toBe('water');
	});

	test('forms can render direct child containers as tabs without an extra wrapper container', async () => {
		const fixture = createTabbedFormFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		expect(wrapper.find('input[placeholder="Word"]').exists()).toBe(true);
		expect(wrapper.find('input[placeholder="Lemma"]').exists()).toBe(false);

		await wrapper.findAll('[role="tab"]')[1].trigger('click');
		await nextTick();

		expect(wrapper.find('input[placeholder="Word"]').exists()).toBe(false);
		expect(wrapper.find('input[placeholder="Lemma"]').exists()).toBe(true);
	});

	test('resolves getter-backed form and tab titles', () => {
		const { runtime } = createGetterTabsFixture();
		const wrapper = mount(FormSystem, { props: { runtime } });
		const tabs = wrapper.findAll('[role="tab"]');

		expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('Computed form');
		expect(tabs[0].text()).toBe('Computed first');
		expect(tabs[1].text()).toBe('Computed second');
	});

	test('links tabs and panels with reciprocal ARIA ids', () => {
		const { runtime } = createGetterTabsFixture();
		const wrapper = mount(FormSystem, { props: { runtime } });
		const tabs = wrapper.findAll('[role="tab"]');

		expect(tabs[0].attributes('aria-controls')).toBeTruthy();
		expect(wrapper.get(`#${tabs[0].attributes('aria-controls')}`).attributes('aria-labelledby')).toBe(tabs[0].attributes('id'));
	});

	test('ArrowRight moves tab selection and the roving tab stop', async () => {
		const { runtime } = createGetterTabsFixture();
		const wrapper = mount(FormSystem, { props: { runtime } });
		const tabs = wrapper.findAll('[role="tab"]');

		expect(tabs[0].attributes('tabindex')).toBe('0');
		expect(tabs[1].attributes('tabindex')).toBe('-1');

		await tabs[0].trigger('keydown', { key: 'ArrowRight' });
		expect(tabs[1].attributes('aria-selected')).toBe('true');
		expect(tabs[0].attributes('tabindex')).toBe('-1');
		expect(tabs[1].attributes('tabindex')).toBe('0');
	});

	test('tabbed containers hide the active child container title', () => {
		const builder = createTestBuilder();
		const parent = builder.newContainer('search.tabs', ContainerRenderer, {
			mode: 'tabs',
		});
		parent.addChildren(
			builder.newContainer('search.tabs.child', ContainerRenderer, {
				title: 'Hidden child title',
			}),
		);
		const wrapper = mount(FormSystem, {
			props: { runtime: createTestRuntime(builder) },
		});

		expect(wrapper.find('.blf-container-title').exists()).toBe(false);
	});

	test('tab badges count descendant controllers with query contributions through layout wrappers', async () => {
		const fixture = createFilterTabsFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		expect(wrapper.find('[role="tab"] .badge').exists()).toBe(false);

		await wrapper.get('input[type="text"]').setValue('Austen');
		await nextTick();

		expect(wrapper.get('[role="tab"] .badge').text()).toBe('1');
	});
});
