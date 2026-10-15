import { describe, expect, test } from 'vitest';
import { isReactive } from 'vue';

import { createFormContainerNode, createFormFieldNode, createFormNode, createFormViewNode } from '@/features/form/model/form-node';
import { createDefaultFormState } from '@/features/form/model/state';
import type { FormOutputProducer } from '@/features/form/model/types/form-output';
import { filter } from '@/features/form/model/types/form-query-ir';

import { TestTextField, createTestBuilder, createTestRuntime, parentFormProbeView, testTextController } from './helpers';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

describe('graph construction', () => {
	function createNonReactiveBoundaryFixture() {
		const builder = createTestBuilder();
		const createdController = { ...testTextController };
		const root = builder.newContainer('root', ContainerRenderer, {});
		const createdForm = builder.newForm('created.form', ContainerRenderer, { title: 'Search' });
		const createdField = builder.newField('created.field', createdController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		const createdView = builder.newView('created.view', parentFormProbeView, {});
		const createdContainer = builder.newContainer('created.container', ContainerRenderer, {}).addChildren(createdField, createdView);
		createdForm.addChildren(createdContainer);
		root.addChildren(createdForm);

		const adoptedController = { ...testTextController };
		const adoptedField = createFormFieldNode('adopted.field', adoptedController, TestTextField, {
			annotationId: 'lemma',
			displayName: 'Lemma',
		});
		const adoptedView = createFormViewNode('adopted.view', parentFormProbeView, {});
		const adoptedContainer = createFormContainerNode('adopted.container', ContainerRenderer, {}, [adoptedField, adoptedView]);
		const adoptedForm = createFormNode('adopted.form', ContainerRenderer, {});
		root.addChildren(adoptedContainer, adoptedForm);

		return builder;
	}

	const createdBoundaryNodeIds = ['created.form', 'created.field', 'created.view', 'created.container'];

	const adoptedBoundaryNodeIds = ['adopted.field', 'adopted.view', 'adopted.container', 'adopted.form'];

	test('keeps created and adopted nodes, controllers, and components non-reactive', () => {
		const builder = createNonReactiveBoundaryFixture();
		const nodes = [...createdBoundaryNodeIds, ...adoptedBoundaryNodeIds].map(id => builder.getNode(id));
		const controllers = ['created.field', 'adopted.field'].map(id => builder.getField(id)?.controller);

		expect(nodes.every(node => node != null && !isReactive(node))).toBe(true);
		expect(nodes.every(node => node?.component != null && !isReactive(node.component))).toBe(true);
		expect(controllers.every(controller => controller != null && !isReactive(controller))).toBe(true);
	});

	test('prefers the first form root over earlier reusable orphan containers', () => {
		const builder = createTestBuilder();
		builder.newContainer('reusable.orphan', ContainerRenderer, {});
		const form = builder.newForm('search.form', ContainerRenderer, { title: 'Search' });

		expect(builder.getRoot().id).toBe(form.id);
	});

	test('flattens form and view configuration onto their nodes', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.form', ContainerRenderer, { title: 'Search', class: 'search-form' });
		const view = builder.newView('search.form.probe', parentFormProbeView, { title: 'Probe', class: 'probe-view' });

		form.addChildren(view);

		expect(form).toMatchObject({ title: 'Search', class: 'search-form' });
		expect(view).toMatchObject({ title: 'Probe', class: 'probe-view', component: parentFormProbeView });
		expect('config' in form).toBe(false);
		expect('config' in view).toBe(false);
	});

	test('createFormFieldNode constructs a complete standalone field', () => {
		const field = createFormFieldNode('search.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});

		expect(field).toMatchObject({
			id: 'search.word',
			kind: 'field',
			controller: testTextController,
			component: TestTextField,
			annotationId: 'word',
			displayName: 'Word',
		});
	});

	test('adding a standalone field adopts it into the graph and default state', () => {
		const builder = createTestBuilder();
		const field = createFormFieldNode('search.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});

		const form = builder.newForm('search.form', ContainerRenderer, {}).addChildren(field);

		expect(builder.getField(field.id)).toBe(field);
		expect(createDefaultFormState(builder.context, form).state).toEqual({
			'search.word': { value: '' },
		});
	});

	test('preserves explicit field presentation', () => {
		const field = createFormFieldNode('composite.token.0.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
			layout: 'horizontal',
			size: 'large',
			class: 'custom-field',
			style: 'width: 100%',
		});

		expect(field).toMatchObject({ layout: 'horizontal', size: 'large', class: 'custom-field', style: 'width: 100%' });
	});

	test('builder form registry includes registered sibling forms', () => {
		const builder = createTestBuilder();
		builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });
		builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' });

		expect(Object.keys(builder.formsMap).sort()).toEqual(['search.extended', 'search.simple']);
	});
});

describe('graph editing', () => {
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

	test('keeps editor functions out of rendered props', () => {
		const builder = createTestBuilder();
		const parent = builder.newContainer('parent', ContainerRenderer, {});
		const editorKeys = ownFunctionKeys(parent);

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
		const replacement = createFormContainerNode(shared.id, ContainerRenderer, {}, [descendant]);

		expect(builder.getNode(shared.id)).toBe(shared);
		expect(builder.hasNode(descendant.id)).toBe(false);
		expect(builder.replaceNode(shared.id, replacement)).toBe(shared);
		expect(builder.getContainer(shared.id)).toBe(replacement);
		expect(left.children[0]).toBe(replacement);
		expect(right.children[0]).toBe(replacement);
		expect(builder.getField(descendant.id)).toBe(descendant);
		const added = replacementTextField('added');
		builder.getContainer(shared.id)!.addChildren(added);
		expect(replacement.children).toEqual([descendant, added]);
	});

	test('replacing an empty root keeps the replacement above its newly registered forms', () => {
		const builder = createTestBuilder();
		builder.newContainer('root', ContainerRenderer, {});
		const form = createFormNode('search', ContainerRenderer, {});
		const replacement = createFormContainerNode('root', ContainerRenderer, {}, [form]);

		builder.replaceNode('root', replacement);

		expect(builder.getRoot()).toBe(replacement);
		expect(builder.getForm('search')).toBe(form);
	});

	test('replaceNode preserves each incoming edge contribution', () => {
		const builder = createTestBuilder();
		const root = builder.newForm('root', ContainerRenderer, {});
		const left = builder.newContainer('left', ContainerRenderer, {});
		const right = builder.newContainer('right', ContainerRenderer, {});
		const shared = builder.newContainer('shared', ContainerRenderer, {});
		const leftContribution: FormOutputProducer = emit => emit('filter', filter('type', 'literal', 'left')!);
		const rightContribution: FormOutputProducer = emit => emit('filter', filter('type', 'literal', 'right')!);
		left.prependChild(shared, { outputWhenActive: leftContribution });
		right.prependChild(shared, { outputWhenActive: rightContribution });
		root.addChildren(left, right);

		builder.replaceNode(shared.id, createFormContainerNode(shared.id, ContainerRenderer, {}, [replacementTextField('replacement.field')]));

		expect(createTestRuntime(builder).compile(root.id).params.filter).toBe('(type:(left) AND type:(right))');
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
		const inner = createFormNode('inner', ContainerRenderer, {});
		const outer = createFormNode('outer', ContainerRenderer, {}, [inner]);

		expect(() => parent.addChildren(outer)).toThrow("Form 'inner' cannot be nested inside form 'outer'");
		expect(parent.children).toEqual([]);
	});

	test('rejects replacing a node below a form with a form boundary', () => {
		const builder = createTestBuilder();
		const outer = builder.newForm('outer', ContainerRenderer, {});
		const child = builder.newContainer('child', ContainerRenderer, {});
		outer.addChildren(child);
		const descendant = replacementTextField('descendant');
		const replacement = createFormNode(child.id, ContainerRenderer, {}, [descendant]);
		expect(() => builder.replaceNode(child.id, replacement)).toThrow("Form 'child' cannot be nested inside form 'outer'");
		expect(outer.children).toEqual([child]);
		expect(builder.getContainer(child.id)).toBe(child);
		expect(builder.hasNode(descendant.id)).toBe(false);
	});
});
