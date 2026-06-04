import { reactivePick } from '@vueuse/core';
import { isRef, reactive, toRaw } from 'vue';

import type { FormBoundaryNode, FormContainerLikeNode, FormFieldNode, FormNode, FormNodeBase, FormNodeKind, NodeKindMap } from '@/features/form/model/types/form-shape';
import type { FormState } from '@/features/form/model/types/form-state';

import { lenientIter } from '@/shared/utils/array-utils';
import { hashJavaDJB2 } from '@/shared/utils/string-utils';

/** Iterate all nodes in the form graph, filtered by uniqueness. Duplicate nodes are skipped. */
export function* walkFormNodes(root: FormNode) {
	const seen = new Set<FormNode>();
	const stack = [root];
	while (stack.length) {
		const node = stack.pop()!;
		if (seen.has(node)) continue;
		seen.add(node);
		yield node;
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
export function getAllNodes(root: FormNode, ...kind: string[]): FormNode[] {
	return Array.from(walkFormNodes(root)).filter(node => (kind?.length ? kind.includes(node.kind) : true));
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

export function checkNoLoops(root: FormNode, completedSubgraphs = new Set<FormNode>()): void {
	const visited = new Set<FormNode>();
	const visiting = new Set<FormNode>();

	const visit = (node: FormNode): void => {
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

export function generateSchemaVersion(root: FormNode): string {
	// pretty naive hash function, just to get a different version string when the form changes. We could use a proper hash function if needed.
	const str = JSON.stringify(toSchemaVersionPayload(root), (_key, value) => (typeof value === 'function' ? '[Function]' : isRef(value) ? '[Ref]' : value));
	return hashJavaDJB2(str).toString();
}

function toSchemaVersionPayload(node: FormNode, seen = new Set<FormNode>()): unknown {
	const base = {
		class: node.class,
		id: node.id,
		kind: node.kind,
		title: node.title,
	};

	if (seen.has(node)) {
		return { ...base, ref: true };
	}
	seen.add(node);

	if (node.kind === 'field') {
		const { component: _component, controller, ...config } = node;
		return {
			...config,
			controller: controller.toJSON(),
		};
	}

	if (node.kind === 'view') {
		const { component: _component, ...config } = node;
		return config;
	}

	if (isContainerNode(node)) {
		const {
			addChildren: _addChildren,
			addContainer: _addContainer,
			addField: _addField,
			addForm: _addForm,
			addView: _addView,
			builder: _builder,
			children,
			component: _component,
			...config
		} = node as typeof node & {
			addChildren?: unknown;
			addContainer?: unknown;
			addField?: unknown;
			addForm?: unknown;
			addView?: unknown;
			builder?: unknown;
		};
		return {
			...config,
			children: children.map(child => toSchemaVersionPayload(child, seen)),
		};
	}

	return base;
}

export function isContainerNode(node: FormNode): node is FormContainerLikeNode {
	return node.kind === 'container' || node.kind === 'form';
}

/**
 * Walk all fields and container-like nodes, picking only the active branches of the form tree, and copying their state.
 * @param form the form for which to pick the active descendant state.
 * @param formState the current state of the form.
 * @returns a new FormState object containing only the active branches.
 */
export function pickActiveFormState(form: FormBoundaryNode, formState: FormState): FormState {
	const r: FormState = {
		controllerState: {},
		uiState: {
			activeContainers: {},
		},
		rawOverrides: structuredClone(toRaw(formState.rawOverrides ?? {})),
	};

	for (const field of getAllNodes(form, 'field', 'container', 'form')) {
		if (field.kind === 'field') r.controllerState[field.id] = structuredClone(toRaw(formState.controllerState[field.id]));
		else r.uiState.activeContainers[field.id] = formState.uiState.activeContainers[field.id];
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
export function reactivePickActiveFormState(form: FormBoundaryNode, formState: FormState): FormState {
	const r: FormState = reactive({
		controllerState: {},
		uiState: {
			activeContainers: {},
		},
		rawOverrides: formState.rawOverrides ?? {},
	});

	const fieldsToInclude = new Set<string>();
	const containersToInclude = new Set<string>();
	for (const node of getAllNodes(form, 'field', 'container', 'form')) {
		if (node.kind === 'field') fieldsToInclude.add(node.id);
		else containersToInclude.add(node.id);
	}

	r.controllerState = reactivePick(formState.controllerState, ...fieldsToInclude);
	r.uiState.activeContainers = reactivePick(formState.uiState.activeContainers, ...containersToInclude);
	return r;
}

export function decodeVariants<Variant extends string>(variants: Variant | undefined | null | Array<Variant | undefined | null>): Partial<Record<Variant, boolean>> {
	const r: Partial<Record<Variant, boolean>> = {};
	for (const v of lenientIter(variants)) r[v] = true;
	return r;
}
