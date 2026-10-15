// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { nextTick } from 'vue';

import { FormSystem, annotationTextController, filterTextController } from '@/features/form';
import { tabId } from '@/features/form/ui/tab-utils';

import { type FormFixture } from './form-ui-fixtures';
import { createTestBuilder, createTestRuntime } from './helpers';

import type { Tab } from '@/shared/ui/Tabs.types';

import TextField from '@/features/form/fields/generic/TextField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import Tabs from '@/shared/ui/Tabs.vue';

function mountTabbedForm(fixture: FormFixture) {
	return mount(FormSystem, { props: fixture, global: { stubs: { Tabs: true } } });
}

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
			title: () => 'Tabbed search',
			mode: 'tabs',
		})
		.addChildren(
			builder
				.newContainer('search.tabbed.word', ContainerRenderer, {
					title: () => 'Word',
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
					title: () => 'Lemma',
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

describe('form tab navigation', () => {
	test('uses compact, unambiguous HTML ids for tabs', () => {
		expect(tabId('search.extended.annotations', 'search.extended.annotations.Part-of-Speech-features')).toBe('form-tab-search_2eextended_2eannotations--r-Part-of-Speech-features');
		expect(tabId('a.', 'child')).not.toBe(tabId('a_2e', 'child'));
		expect(tabId('parent', 'child')).not.toBe(tabId('parent', 'parent.child'));
	});

	test('reused field nodes share state across tabbed forms', async () => {
		const fixture = createSharedFieldTabsFixture();
		const wrapper = mountTabbedForm(fixture);
		const tabs = wrapper.getComponent(Tabs);

		await wrapper.get('input[placeholder="Shared word"]').setValue('water');

		tabs.vm.$emit('update:modelValue', 'search.second');
		await nextTick();

		expect(tabs.props('modelValue')).toBe('search.second');
		expect((wrapper.get('input[placeholder="Shared word"]').element as HTMLInputElement).value).toBe('water');
	});

	test('forms can render direct child containers as tabs without an extra wrapper container', async () => {
		const fixture = createTabbedFormFixture();
		const wrapper = mountTabbedForm(fixture);
		const tabs = wrapper.getComponent(Tabs);

		expect(wrapper.find('input[placeholder="Word"]').exists()).toBe(true);
		expect(wrapper.find('input[placeholder="Lemma"]').exists()).toBe(false);

		tabs.vm.$emit('update:modelValue', 'search.tabbed.lemma');
		await nextTick();

		expect(wrapper.find('input[placeholder="Word"]').exists()).toBe(false);
		expect(wrapper.find('input[placeholder="Lemma"]').exists()).toBe(true);
	});

	test('passes resolved titles and panel IDs to shared Tabs', () => {
		const wrapper = mountTabbedForm(createTabbedFormFixture());
		const tabs = wrapper.getComponent(Tabs);

		expect(tabs.props('ariaLabel')).toBe('Tabbed search');
		expect(tabs.props('tabs')).toMatchObject([
			{ value: 'search.tabbed.word', label: 'Word' },
			{ value: 'search.tabbed.lemma', label: 'Lemma' },
		]);
		const [first] = tabs.props('tabs') as Tab[];
		expect(first.controls).toBeTruthy();
		expect(wrapper.get('[role="tabpanel"]').attributes()).toMatchObject({ id: first.controls, 'aria-labelledby': first.id });
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
		const wrapper = mountTabbedForm({ runtime: createTestRuntime(builder) });

		expect(wrapper.find('.blf-container-title').exists()).toBe(false);
	});

	test('tab badges count descendant controllers with query contributions through layout wrappers', async () => {
		const fixture = createFilterTabsFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		const tabs = wrapper.getComponent(Tabs);
		expect(tabs.find('.badge').exists()).toBe(false);

		await wrapper.get('input[type="text"]').setValue('Austen');
		await nextTick();

		expect(tabs.get('.badge').text()).toBe('1');
	});
});
