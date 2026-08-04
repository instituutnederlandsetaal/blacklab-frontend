import { describe, expect, test } from 'vitest';

import { createFormFieldNode } from '@/features/form';
import type { ContainerNode } from '@/features/form/model/types/form-shape';
import { filter, queryFragment } from '@/features/form/model/types/form-query-ir';

import { TestTextField, createTestBuilder, createTestRuntime, testTextController } from './helpers';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

function newTextField(builder: ReturnType<typeof createTestBuilder>, id: string) {
	return builder.newField(id, testTextController, TestTextField, {
		annotationId: id,
		displayName: id,
	});
}

function replacementTextField(id: string) {
	return createFormFieldNode(id, testTextController, TestTextField, {
		annotationId: `${id}-replacement`,
		displayName: `${id} replacement`,
	});
}

function ownFunctionKeys(node: object): PropertyKey[] {
	return Reflect.ownKeys(node).filter(key => key !== 'component' && typeof Reflect.get(node, key) === 'function');
}

describe('form graph builder editing', () => {
	test('keeps every attached editor function non-enumerable and out of rendered props', () => {
		const builder = createTestBuilder();
		const parent = builder.newContainer('parent', ContainerRenderer, {});
		const editorKeys = ownFunctionKeys(parent);

		expect(editorKeys.length).toBeGreaterThan(0);
		for (const key of editorKeys) expect(Object.getOwnPropertyDescriptor(parent, key)?.enumerable).toBe(false);
		const rendered = createTestRuntime(builder).renderableGraph(parent.id)!;
		expect(editorKeys.filter(key => Object.hasOwn(rendered.props, key))).toEqual([]);
	});

	test('supports DOM-like insertion, replacement, and removal order', () => {
		const builder = createTestBuilder();
		const parent = builder.newForm('root', ContainerRenderer, {});
		const first = newTextField(builder, 'first');
		const prepended = newTextField(builder, 'prepended');
		const inserted = newTextField(builder, 'inserted');
		const replacement = newTextField(builder, 'replacement');

		expect(parent.appendChild(first)).toBe(first);
		expect(parent.prependChild(prepended)).toBe(prepended);
		expect(parent.insertBefore(inserted, first)).toBe(inserted);
		expect(parent.children.map(node => node.id)).toEqual(['prepended', 'inserted', 'first']);

		expect(parent.replaceChild(replacement, inserted)).toBe(inserted);
		expect(parent.removeChild(prepended)).toBe(prepended);
		expect(parent.children.map(node => node.id)).toEqual(['replacement', 'first']);
	});

	test('looks up nodes and parents and checks transitive containment', () => {
		const builder = createTestBuilder();
		const root = builder.newForm('root', ContainerRenderer, {});
		const group = builder.newContainer('group', ContainerRenderer, {});
		const field = newTextField(builder, 'field');
		root.addChild(group.addChild(field));

		expect(builder.getElementById(field.id)).toBe(field);
		expect(builder.getField(field.id)).toBe(field);
		expect(builder.getContainer(group.id)).toBe(group);
		expect(builder.getForm(root.id)).toBe(root);
		expect(builder.getParents(field)).toEqual([group]);
		expect(builder.getParents(group.id)).toEqual([root]);
		expect(builder.contains(root, field.id)).toBe(true);
		expect(builder.contains(field, field)).toBe(true);
		expect(builder.contains(field, root)).toBe(false);
		expect(builder.getElementById('missing')).toBeNull();
		expect(builder.getParents('missing')).toEqual([]);
	});

	test('replaces every occurrence and adopts the replacement descendants', () => {
		const builder = createTestBuilder();
		const root = builder.newForm('root', ContainerRenderer, {});
		const left = builder.newContainer('left', ContainerRenderer, {});
		const right = builder.newContainer('right', ContainerRenderer, {});
		const shared = newTextField(builder, 'shared');
		const contribution = queryFragment(filter('type', 'literal', 'selected'))!;
		left.addChild(shared, { queryWhenActive: contribution });
		right.addChild(shared, { queryWhenActive: contribution });
		root.addChildren(left, right);

		const descendant = replacementTextField('descendant');
		const replacement = { id: shared.id, kind: 'container', component: ContainerRenderer, children: [descendant] } satisfies ContainerNode;
		expect(builder.replaceNode(shared.id, replacement)).toBe(shared);
		expect(builder.getContainer(shared.id)).toBe(replacement);
		expect(left.children[0]).toBe(replacement);
		expect(right.children[0]).toBe(replacement);
		expect(builder.getField(descendant.id)).toBe(descendant);
		expect(left.activeChildQueryContributions?.[shared.id]).toBe(contribution);
		expect(right.activeChildQueryContributions?.[shared.id]).toBe(contribution);
		expect(() => builder.replaceNode(shared.id, replacementTextField('different-id'))).toThrow(/preserve id/);
	});

	test('distinguishes removing one parent edge from removing a node everywhere', () => {
		const builder = createTestBuilder();
		const root = builder.newForm('root', ContainerRenderer, {});
		const left = builder.newContainer('left', ContainerRenderer, {});
		const right = builder.newContainer('right', ContainerRenderer, {});
		const shared = newTextField(builder, 'shared');
		const contribution = queryFragment(filter('type', 'literal', 'selected'))!;
		left.addChild(shared, { queryWhenActive: contribution });
		right.addChild(shared, { queryWhenActive: contribution });
		root.addChildren(left, right);

		expect(left.removeChild(shared)).toBe(shared);
		expect(builder.getField(shared.id)).toBe(shared);
		expect(builder.getParents(shared)).toEqual([right]);
		expect(left.activeChildQueryContributions).toBeUndefined();

		expect(builder.removeNode(shared.id)).toBe(shared);
		expect(builder.getElementById(shared.id)).toBeNull();
		expect(right.children).toEqual([]);
		expect(right.activeChildQueryContributions).toBeUndefined();
	});

	test('prunes detached subgraphs but retains reachable shared DAG nodes', () => {
		const builder = createTestBuilder();
		const root = builder.newForm('root', ContainerRenderer, {});
		const left = builder.newContainer('left', ContainerRenderer, {});
		const right = builder.newContainer('right', ContainerRenderer, {});
		const shared = newTextField(builder, 'shared');
		left.addChild(shared);
		right.addChild(shared);
		root.addChildren(left, right);
		const detached = builder.newContainer('detached', ContainerRenderer, {}).addChild(shared);
		const detachedField = newTextField(builder, 'detached-field');
		detached.addChild(detachedField);

		expect(builder.pruneDetachedNodes().map(node => node.id)).toEqual(['detached', 'detached-field']);
		expect(builder.getElementById('detached')).toBeNull();
		expect(builder.getElementById('detached-field')).toBeNull();
		expect(builder.getField(shared.id)).toBe(shared);
		expect(builder.getParents(shared)).toEqual([left, right]);
	});

	test('rejects duplicate direct edges and cycles through parent-scoped edits', () => {
		const builder = createTestBuilder();
		const root = builder.newForm('root', ContainerRenderer, {});
		const parent = builder.newContainer('parent', ContainerRenderer, {});
		const child = builder.newContainer('child', ContainerRenderer, {});
		root.addChild(parent);
		parent.addChild(child);

		expect(() => parent.appendChild(child)).toThrow(/already contains child/);
		expect(() => child.appendChild(root)).toThrow(/cycle/);
	});
});
