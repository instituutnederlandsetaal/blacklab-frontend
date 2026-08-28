import type { AnyBaseFormNode, FormContainerLikeNode, FormNode, FormNodeKind, NodeKindMap } from '@/features/form/model/types/form-shape';

import { lenientIter, type LenientArray } from '@/shared/utils/array-utils';

export function isContainerNode(node: AnyBaseFormNode | null | undefined): node is FormContainerLikeNode {
	return !!node && 'kind' in node && 'children' in node && Array.isArray(node.children);
}
/** Iterate all nodes in the form graph, filtered by uniqueness. Duplicate nodes are skipped. */
export function* walkFormNodes<K extends FormNodeKind>(nodes: FormNode | FormNode[], ...kind: K[]): Generator<NodeKindMap[K]> {
	const seen = new Set<FormNode>();
	const stack = Array.isArray(nodes) ? [...nodes] : [nodes];
	while (stack.length) {
		const node = stack.pop()!;
		if (seen.has(node)) continue;
		seen.add(node);
		if (kind.length === 0 || kind.includes(node.kind as K)) yield node as any;
		if (isContainerNode(node)) {
			// Push in reverse order so traversal is in the order you would expect
			for (let i = node.children.length - 1; i >= 0; i--) {
				stack.push(node.children[i]);
			}
		}
	}
}
/** Get all nodes in the form graph, deduplicated, and optionally filtered by kind. */
export function getAllNodes(root: FormNode): FormNode[];
export function getAllNodes<K extends FormNodeKind>(root: FormNode, ...kind: K[]): NodeKindMap[K][];
export function getAllNodes(root: FormNode, ...kind: FormNodeKind[]): FormNode[] {
	return Array.from(walkFormNodes(root, ...kind));
}
export function checkNoLoops(root: AnyBaseFormNode): void {
	const visited = new Set<AnyBaseFormNode>();
	const visiting = new Set<AnyBaseFormNode>();

	const visit = (node: AnyBaseFormNode): void => {
		if (visited.has(node)) return;
		if (visiting.has(node)) throw new Error(`Node with id ${node.id} is part of a loop`);

		visiting.add(node);

		if (isContainerNode(node)) {
			for (const child of node.children) {
				visit(child);
			}
		}

		visiting.delete(node);
		visited.add(node);
	};

	visit(root);
}

export function findPathToNode(root: FormNode, targetId: string): string[] | null {
	if (!isContainerNode(root)) return null;
	for (const child of root.children) {
		if (child.id === targetId) return [root.id, child.id];
		const path = findPathToNode(child, targetId);
		if (path) return [root.id, ...path];
	}
	return null;
}

export function decodeVariants<Variant extends string>(variants: LenientArray<Variant>): Partial<Record<Variant, boolean>> {
	const r: Partial<Record<Variant, boolean>> = {};
	for (const v of lenientIter(variants)) r[v] = true;
	return r;
}
