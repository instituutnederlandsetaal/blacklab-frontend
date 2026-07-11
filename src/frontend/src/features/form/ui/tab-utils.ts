import { nextTick, toValue } from 'vue';

import type { BaseNode } from '@/features/form/model/types/form-shape';

type TabChild = { props: Pick<BaseNode, 'id'> };

function idPart(value: string): string {
	return Array.from(value, character => character.codePointAt(0)!.toString(16)).join('_');
}

export function resolveNodeTitle(node: Pick<BaseNode, 'id' | 'title'>): string {
	return node.title ? toValue(node.title) : node.id;
}

export function tabId(parentId: string, childId: string): string {
	return `form-tab-${idPart(parentId)}--${idPart(childId)}`;
}

export function tabPanelId(parentId: string, childId: string): string {
	return `form-panel-${idPart(parentId)}--${idPart(childId)}`;
}

export function handleTabKeydown(event: KeyboardEvent, index: number, children: readonly TabChild[], parentId: string, activate: (id: string) => void): void {
	let nextIndex: number | null = null;
	if (event.key === 'ArrowRight') nextIndex = (index + 1) % children.length;
	if (event.key === 'ArrowLeft') nextIndex = (index - 1 + children.length) % children.length;
	if (event.key === 'Home') nextIndex = 0;
	if (event.key === 'End') nextIndex = children.length - 1;
	if (nextIndex == null) return;

	event.preventDefault();
	const child = children[nextIndex];
	if (!child) return;
	activate(child.props.id);
	void nextTick(() => document.getElementById(tabId(parentId, child.props.id))?.focus());
}
