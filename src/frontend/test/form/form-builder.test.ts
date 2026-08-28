import { describe, expect, test } from 'vitest';

import { createFormFieldNode, searchTarget, type FormBoundaryNode, type FormOutputProducer } from '@/features/form';
import { filter } from '@/features/form/model/types/form-query-ir';
import type { ContainerNode } from '@/features/form/model/types/form-shape';

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

function createSharedFieldGraph() {
	const builder = createTestBuilder();
	const root = builder.newForm('root', ContainerRenderer, {});
	const left = builder.newContainer('left', ContainerRenderer, {});
	const right = builder.newContainer('right', ContainerRenderer, {});
	const shared = newTextField(builder, 'shared');
	left.addChildren(shared);
	right.addChildren(shared);
	root.addChildren(left, right);
	return { builder, left, right, root, shared };
}

describe('form graph builder editing', () => {
	test('keeps every attached editor function non-enumerable and out of rendered props', () => {
		const builder = createTestBuilder();
		const parent = builder.newContainer('parent', ContainerRenderer, {});
		const editorKeys = ownFunctionKeys(parent);

		expect(editorKeys.length).toBeGreaterThan(0);
		for (const key of editorKeys) expect(Object.getOwnPropertyDescriptor(parent, key)?.enumerable).toBe(false);
		const rendered = createTestRuntime(builder).renderableGraph();
		expect(editorKeys.filter(key => Object.hasOwn(rendered.props, key))).toEqual([]);
	});

	test('prependChild inserts before existing children and returns the child', () => {
		const builder = createTestBuilder();
		const parent = builder.newForm('root', ContainerRenderer, {});
		const first = newTextField(builder, 'first');
		const prepended = newTextField(builder, 'prepended');
		parent.addChildren(first);

		expect(parent.prependChild(prepended)).toBe(prepended);
		expect(parent.children).toEqual([prepended, first]);
	});

	test('insertBefore inserts at the referenced child and returns the child', () => {
		const builder = createTestBuilder();
		const parent = builder.newForm('root', ContainerRenderer, {});
		const first = newTextField(builder, 'first');
		const second = newTextField(builder, 'second');
		const inserted = newTextField(builder, 'inserted');
		parent.addChildren(first, second);

		expect(parent.insertBefore(inserted, second)).toBe(inserted);
		expect(parent.children).toEqual([first, inserted, second]);
	});

	test('replaceChild preserves position and returns the displaced child', () => {
		const builder = createTestBuilder();
		const parent = builder.newForm('root', ContainerRenderer, {});
		const first = newTextField(builder, 'first');
		const displaced = newTextField(builder, 'displaced');
		const replacement = newTextField(builder, 'replacement');
		parent.addChildren(first, displaced);

		expect(parent.replaceChild(replacement, displaced)).toBe(displaced);
		expect(parent.children).toEqual([first, replacement]);
	});

	test('removeChild removes only the requested child and returns it', () => {
		const builder = createTestBuilder();
		const parent = builder.newForm('root', ContainerRenderer, {});
		const removed = newTextField(builder, 'removed');
		const retained = newTextField(builder, 'retained');
		parent.addChildren(removed, retained);

		expect(parent.removeChild(removed)).toBe(removed);
		expect(parent.children).toEqual([retained]);
	});

	test('looks up registered nodes by id and kind', () => {
		const builder = createTestBuilder();
		const root = builder.newForm('root', ContainerRenderer, {});
		const group = builder.newContainer('group', ContainerRenderer, {});
		const field = newTextField(builder, 'field');
		group.addChildren(field);
		root.addChildren(group);

		expect(builder.getNode(field.id)).toBe(field);
		expect(builder.getField(field.id)).toBe(field);
		expect(builder.getContainer(group.id)).toBe(group);
		expect(builder.getForm(root.id)).toBe(root);
		expect(builder.getNode('missing')).toBeNull();
	});

	test('returns every direct parent of a shared node', () => {
		const { builder, left, right, shared } = createSharedFieldGraph();

		expect(builder.getParents(shared)).toEqual([left, right]);
		expect(builder.getParents('missing')).toEqual([]);
	});

	test('contains is reflexive, transitive, and directional', () => {
		const builder = createTestBuilder();
		const root = builder.newForm('root', ContainerRenderer, {});
		const group = builder.newContainer('group', ContainerRenderer, {});
		const field = newTextField(builder, 'field');
		group.addChildren(field);
		root.addChildren(group);

		expect(builder.contains(root, field.id)).toBe(true);
		expect(builder.contains(field, field)).toBe(true);
		expect(builder.contains(field, root)).toBe(false);
	});

	test('replaceNode rewrites every incoming edge and adopts replacement descendants', () => {
		const { builder, left, right, shared } = createSharedFieldGraph();
		const descendant = replacementTextField('descendant');
		const replacement = { id: shared.id, kind: 'container', component: ContainerRenderer, children: [descendant] } satisfies ContainerNode;

		expect(builder.replaceNode(shared.id, replacement)).toBe(shared);
		expect(builder.getContainer(shared.id)).toBe(replacement);
		expect(left.children[0]).toBe(replacement);
		expect(right.children[0]).toBe(replacement);
		expect(builder.getField(descendant.id)).toBe(descendant);
	});

	test('replaceNode preserves each incoming edge contribution', () => {
		const builder = createTestBuilder();
		const root = builder.newForm('root', ContainerRenderer, {});
		const left = builder.newContainer('left', ContainerRenderer, {});
		const right = builder.newContainer('right', ContainerRenderer, {});
		const shared = newTextField(builder, 'shared');
		const leftContribution: FormOutputProducer = emit => emit('filter', filter('type', 'literal', 'left-selected')!);
		const rightContribution: FormOutputProducer = emit => emit('filter', filter('type', 'literal', 'right-selected')!);
		left.prependChild(shared, { outputWhenActive: leftContribution });
		right.prependChild(shared, { outputWhenActive: rightContribution });
		root.addChildren(left, right);

		builder.replaceNode(shared.id, replacementTextField(shared.id));

		expect(left.activeChildOutputProducers?.[shared.id]).toBe(leftContribution);
		expect(right.activeChildOutputProducers?.[shared.id]).toBe(rightContribution);
	});

	test('replaceNode rejects a replacement with a different id', () => {
		const builder = createTestBuilder();
		const shared = newTextField(builder, 'shared');

		expect(() => builder.replaceNode(shared.id, replacementTextField('different-id'))).toThrow(/preserve id/);
	});

	test('distinguishes removing one parent edge from removing a node everywhere', () => {
		const builder = createTestBuilder();
		const root = builder.newForm('root', ContainerRenderer, {});
		const left = builder.newContainer('left', ContainerRenderer, {});
		const right = builder.newContainer('right', ContainerRenderer, {});
		const shared = newTextField(builder, 'shared');
		const contribution: FormOutputProducer = emit => emit('filter', filter('type', 'literal', 'selected')!);
		left.prependChild(shared, { outputWhenActive: contribution });
		right.prependChild(shared, { outputWhenActive: contribution });
		root.addChildren(left, right);

		expect(left.removeChild(shared)).toBe(shared);
		expect(builder.getField(shared.id)).toBe(shared);
		expect(builder.getParents(shared)).toEqual([right]);
		expect(left.activeChildOutputProducers).toBeUndefined();

		expect(builder.removeNode(shared.id)).toBe(shared);
		expect(builder.getNode(shared.id)).toBeNull();
		expect(right.children).toEqual([]);
		expect(right.activeChildOutputProducers).toBeUndefined();
	});

	test('prunes detached subgraphs but retains reachable shared DAG nodes', () => {
		const builder = createTestBuilder();
		const root = builder.newForm('root', ContainerRenderer, {});
		const left = builder.newContainer('left', ContainerRenderer, {});
		const right = builder.newContainer('right', ContainerRenderer, {});
		const shared = newTextField(builder, 'shared');
		left.addChildren(shared);
		right.addChildren(shared);
		root.addChildren(left, right);
		const detached = builder.newContainer('detached', ContainerRenderer, {}).addChildren(shared);
		const detachedField = newTextField(builder, 'detached-field');
		detached.addChildren(detachedField);

		expect(builder.pruneDetachedNodes().map(node => node.id)).toEqual(['detached', 'detached-field']);
		expect(builder.getNode('detached')).toBeNull();
		expect(builder.getNode('detached-field')).toBeNull();
		expect(builder.getField(shared.id)).toBe(shared);
		expect(builder.getParents(shared)).toEqual([left, right]);
	});

	test('rejects a duplicate direct edge', () => {
		const builder = createTestBuilder();
		const parent = builder.newContainer('parent', ContainerRenderer, {});
		const child = builder.newContainer('child', ContainerRenderer, {});
		parent.addChildren(child);

		expect(() => parent.addChildren(child)).toThrow(/already contains child/);
	});

	test('rejects a parent-scoped edit that would create a cycle', () => {
		const builder = createTestBuilder();
		const root = builder.newForm('root', ContainerRenderer, {});
		const parent = builder.newContainer('parent', ContainerRenderer, {});
		const child = builder.newContainer('child', ContainerRenderer, {});
		root.addChildren(parent);
		parent.addChildren(child);

		expect(() => child.addChildren(root)).toThrow(/cycle/);
	});

	test('rejects a form added directly below another form', () => {
		const builder = createTestBuilder();
		const outer = builder.newForm('outer', ContainerRenderer, {});
		const inner = builder.newForm('inner', ContainerRenderer, {});

		expect(() => outer.addChildren(inner)).toThrow("Form 'inner' cannot be nested inside form 'outer'");
		expect(outer.children).toEqual([]);
	});

	test('rejects a form added through a container already below a form', () => {
		const builder = createTestBuilder();
		const outer = builder.newForm('outer', ContainerRenderer, {});
		const container = builder.newContainer('container', ContainerRenderer, {});
		const inner = builder.newForm('inner', ContainerRenderer, {});
		outer.addChildren(container);

		expect(() => container.addChildren(inner)).toThrow("Form 'inner' cannot be nested inside form 'outer'");
		expect(container.children).toEqual([]);
	});

	test('rejects an adopted subgraph that already contains nested forms', () => {
		const builder = createTestBuilder();
		const parent = builder.newContainer('parent', ContainerRenderer, {});
		const inner = { id: 'inner', kind: 'form', component: ContainerRenderer, children: [], target: searchTarget } satisfies FormBoundaryNode;
		const outer = { id: 'outer', kind: 'form', component: ContainerRenderer, children: [inner], target: searchTarget } satisfies FormBoundaryNode;

		expect(() => parent.addChildren(outer)).toThrow("Form 'inner' cannot be nested inside form 'outer'");
		expect(parent.children).toEqual([]);
	});

	test('rejects replacing a node below a form with a form boundary', () => {
		const builder = createTestBuilder();
		const outer = builder.newForm('outer', ContainerRenderer, {});
		const child = builder.newContainer('child', ContainerRenderer, {});
		outer.addChildren(child);
		const replacement = { id: child.id, kind: 'form', component: ContainerRenderer, children: [], target: searchTarget } satisfies FormBoundaryNode;

		expect(() => builder.replaceNode(child.id, replacement)).toThrow("Form 'child' cannot be nested inside form 'outer'");
		expect(outer.children).toEqual([child]);
		expect(builder.getContainer(child.id)).toBe(child);
	});
});
