import { reactivePick } from '@vueuse/core';
import { computed, reactive, toRaw } from 'vue';

import type { NewFormState } from '@/features/form/model/state';
import type { AnyBaseFormNode, FormBoundaryNode, FormContainerLikeNode, FormFieldNode, FormNode, FormNodeBase, FormNodeKind, NodeKindMap } from '@/features/form/model/types/form-shape';

import { lenientIter } from '@/shared/utils/array-utils';

export function isContainerNode(node: AnyBaseFormNode | null | undefined): node is FormContainerLikeNode {
	return !!node && 'kind' in node && 'children' in node && Array.isArray(node.children);
}
export function isFieldNode(node: AnyBaseFormNode | null | undefined): node is FormFieldNode {
	return !!node && node.kind === 'field' && 'controller' in node && typeof node.controller === 'object';
}

/** Iterate all nodes in the form graph, filtered by uniqueness. Duplicate nodes are skipped. */
export function* walkFormNodes<K extends FormNodeKind>(nodes: FormNode | FormNode[], ...kind: K[]): Generator<NodeKindMap[K]> {
	const seen = new Set<FormNode>();
	const stack = Array.isArray(nodes) ? [...nodes] : [nodes];
	while (stack.length) {
		const node = stack.pop()!;
		if (seen.has(node)) continue;
		seen.add(node);
		if (kind && kind.includes(node.kind as K)) yield node as any;
		if (isContainerNode(node)) {
			// Push in reverse order so traversal is in the order you would expect
			for (let i = node.children.length - 1; i >= 0; i--) {
				stack.push(node.children[i]);
			}
		}
	}
}
/** Iterate all child nodes of the given root node, filtered by uniqueness. The root node itself is skipped. */
export function* walkFormNodeChildren(root: FormNode) {
	const it = walkFormNodes(root);
	it.next(); // skip root
	for (const node of it) {
		yield node;
	}
}

/** Get all nodes in the form graph, deduplicated, and optionally filtered by kind. */
export function getAllNodes(root: FormNode): FormNode[];
export function getAllNodes<K extends FormNodeKind>(root: FormNode, ...kind: K[]): NodeKindMap[K][];
export function getAllNodes(root: FormNode, ...kind: FormNodeKind[]): FormNode[] {
	return Array.from(walkFormNodes(root, ...kind));
}
export function getAllFields(root: FormNode): FormFieldNode[] {
	return getAllNodes(root, 'field');
}

export function getFormsWithFields(root: FormNode): { form: FormNodeBase; fields: FormNodeBase[] }[] {
	const forms: { form: FormNodeBase; fields: FormNodeBase[] }[] = [];
	for (const node of walkFormNodes(root)) {
		if (node.kind === 'form') {
			forms.push({ form: node, fields: getAllNodes(node, 'field') });
		}
	}
	return forms;
}

export function checkNoLoops(root: AnyBaseFormNode, completedSubgraphs = new Set<AnyBaseFormNode>()): void {
	const visited = new Set<AnyBaseFormNode>();
	const visiting = new Set<AnyBaseFormNode>();

	const visit = (node: AnyBaseFormNode): void => {
		if (completedSubgraphs.has(node) || visited.has(node)) return;
		if (visiting.has(node)) throw new Error(`Node with id ${node.id} is part of a loop`);

		visiting.add(node);

		if (isContainerNode(node)) {
			for (const child of node.children) {
				visit(child);
			}
		}

		visiting.delete(node);
		visited.add(node);
		completedSubgraphs.add(node);
	};

	visit(root);
}

function findPathToNodeImpl(node: FormContainerLikeNode, targetId: string): string[] | null {
	for (const child of node.children) {
		if (child.id === targetId) return [node.id, child.id];
		if (isContainerNode(child)) {
			const path = findPathToNodeImpl(child, targetId);
			if (path) return [node.id, ...path];
		}
	}
	return null;
}

export function findPathToNode(roots: FormNode[], targetId: string): string[] | null {
	for (const root of roots) {
		if (isContainerNode(root)) {
			const path = findPathToNodeImpl(root, targetId);
			if (path) return path;
		}
	}
	return null;
}

/**
 * Walk all fields and container-like nodes, picking only the active branches of the form tree, and copying their state.
 * @param form the form for which to pick the active descendant state.
 * @param formState the current state of the form.
 * @returns a new FormState object containing only the active branches.
 */
export function pickActiveFormState(form: FormBoundaryNode, formState: NewFormState): NewFormState {
	const r: NewFormState = {
		state: {},
		uiState: {},
		rawOverrides: structuredClone(toRaw(formState.rawOverrides ?? {})),
	};

	for (const field of getAllNodes(form, 'field', 'container', 'form')) {
		if (field.kind === 'field') r.state[field.id] = structuredClone(toRaw(formState.state[field.id]));
		else r.uiState[field.id] = formState.uiState[field.id];
	}

	return r;
}

/**
 * Like pickActiveFormState, but the returned object is reactive and "writes through" to the source object.
 *
 * @param form
 * @param formState
 * @returns
 */
export function reactivePickActiveFormState(form: FormBoundaryNode, formState: NewFormState): NewFormState {
	const fieldsInForm = computed(() => new Set(getAllNodes(form, 'field').map(field => field.id)));
	const containersInForm = computed(() => new Set([...walkFormNodes(form, 'field', 'container')].map(node => node.id)));

	return reactive({
		state: reactivePick(formState.state, (v, k) => fieldsInForm.value.has(k)),
		uiState: reactivePick(formState.uiState, (v, k) => containersInForm.value.has(k)),
		rawOverrides: formState.rawOverrides,
	});
}

export function decodeVariants<Variant extends string>(variants: Variant | undefined | null | Array<Variant | undefined | null>): Partial<Record<Variant, boolean>> {
	const r: Partial<Record<Variant, boolean>> = {};
	for (const v of lenientIter(variants)) r[v] = true;
	return r;
}
