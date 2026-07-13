import { toValue } from 'vue';

import type { BaseNode } from '@/features/form/model/types/form-shape';
import type { Tab } from '@/shared/ui/Tabs.types';

type TabChild = { props: Pick<BaseNode, 'id' | 'title'> };

function idPart(value: string): string {
	return Array.from(value, character => {
		if (/^[A-Za-z0-9-]$/.test(character)) return character;
		// Escape the escape marker itself so e.g. "a_2e" cannot collide with "a.".
		if (character === '_') return '__';
		return `_${character.codePointAt(0)!.toString(16)}`;
	}).join('');
}

function childIdPart(parentId: string, childId: string): string {
	const parentPrefix = `${parentId}.`;
	if (childId.startsWith(parentPrefix)) return `r-${idPart(childId.slice(parentPrefix.length))}`;
	return `a-${idPart(childId)}`;
}

export function resolveNodeTitle(node: Pick<BaseNode, 'id' | 'title'>): string {
	return node.title ? toValue(node.title) : node.id;
}

export function tabId(parentId: string, childId: string): string {
	return `form-tab-${idPart(parentId)}--${childIdPart(parentId, childId)}`;
}

export function tabPanelId(parentId: string, childId: string): string {
	return `form-panel-${idPart(parentId)}--${childIdPart(parentId, childId)}`;
}

export function createTabs(parentId: string, children: readonly TabChild[]): Tab[] {
	return children.map(child => ({
		value: child.props.id,
		label: resolveNodeTitle(child.props),
		id: tabId(parentId, child.props.id),
		controls: tabPanelId(parentId, child.props.id),
	}));
}
