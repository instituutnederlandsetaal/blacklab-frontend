// @vitest-environment jsdom

import { describe, expect, test } from 'vitest';

import { restoreForm } from '@/features/form';

import { TestTextField, createTestBuilder, testTextController } from './helpers';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

describe('persistence path selection', () => {
	test('activates the first persisted descendant in schema order rather than query order', () => {
		const builder = createTestBuilder();
		const firstField = builder.newField('search.tabs.first.word', testTextController, TestTextField, { annotationId: 'first', displayName: 'First' });
		const secondField = builder.newField('search.tabs.second.word', testTextController, TestTextField, { annotationId: 'second', displayName: 'Second' });
		const first = builder.newContainer('search.tabs.first', ContainerRenderer, {}).addChildren(firstField);
		const second = builder.newContainer('search.tabs.second', ContainerRenderer, {}).addChildren(secondField);
		const tabs = builder.newContainer('search.tabs', ContainerRenderer, { variant: 'tabs' }).addChildren(first, second);
		builder.newForm('search.form', ContainerRenderer, {}).addChildren(tabs);

		const restored = restoreForm(builder, { 'f.second': 'two', 'f.first': 'one' }).state;

		expect(restored.uiState[tabs.id]).toBe(first.id);
		expect(restored.state[firstField.id]).toEqual({ value: 'one' });
		expect(restored.state[secondField.id]).toEqual({ value: 'two' });
	});

	test('activates both secondary unique paths without replacing the first common choice', () => {
		const builder = createTestBuilder();
		const shared = builder.newField('search.shared.word', testTextController, TestTextField, { annotationId: 'word', displayName: 'Word' });
		const firstBranch = builder.newContainer('search.outer.first', ContainerRenderer, {}).addChildren(shared);
		const firstNestedDefault = builder.newContainer('search.first-nested.default', ContainerRenderer, {});
		const firstNestedShared = builder.newContainer('search.first-nested.shared', ContainerRenderer, {}).addChildren(shared);
		const firstNestedTabs = builder.newContainer('search.first-nested', ContainerRenderer, { variant: 'tabs' }).addChildren(firstNestedDefault, firstNestedShared);
		const secondBranch = builder.newContainer('search.outer.second', ContainerRenderer, {}).addChildren(firstNestedTabs);
		const secondNestedDefault = builder.newContainer('search.second-nested.default', ContainerRenderer, {});
		const secondNestedShared = builder.newContainer('search.second-nested.shared', ContainerRenderer, {}).addChildren(shared);
		const secondNestedTabs = builder.newContainer('search.second-nested', ContainerRenderer, { variant: 'tabs' }).addChildren(secondNestedDefault, secondNestedShared);
		const thirdBranch = builder.newContainer('search.outer.third', ContainerRenderer, {}).addChildren(secondNestedTabs);
		const outerTabs = builder.newContainer('search.outer', ContainerRenderer, { variant: 'tabs' }).addChildren(firstBranch, secondBranch, thirdBranch);
		builder.newForm('search.form', ContainerRenderer, {}).addChildren(outerTabs);

		const restored = restoreForm(builder, { 'f.word': 'water' }).state;

		expect(restored.uiState[outerTabs.id]).toBe(firstBranch.id);
		expect(restored.uiState[firstNestedTabs.id]).toBe(firstNestedShared.id);
		expect(restored.uiState[secondNestedTabs.id]).toBe(secondNestedShared.id);
		expect(restored.state[shared.id]).toEqual({ value: 'water' });
	});
});
