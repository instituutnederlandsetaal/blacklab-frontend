import { reactive, toRaw, toRefs } from 'vue';

import { isContainerNode, walkFormNodes } from '@/features/form/model/form-utils';
import type { FormNode } from '@/features/form/model/types';
import type { FormOverrides } from '@/features/form/model/types/blacklab-params';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';

export type NewFormState = {
	state: Record<string, unknown>;
	uiState: Record<string, string | null>;
	rawOverrides: FormOverrides;
};

export function createDefaultFormState(context: FormRuntimeContext, ...rootNodes: FormNode[]): NewFormState {
	const state: Record<string, unknown> = {};
	const uiState: Record<string, string | null> = {};
	for (const node of walkFormNodes(rootNodes)) {
		if (node.kind === 'field') state[node.id] = node.controller.createDefaultState(node, context);
		else if (isContainerNode(node) && node.children[0]) uiState[node.id] = node.children[0].id;
	}
	return {
		state,
		uiState,
		rawOverrides: {},
	};
}

export default function createFormState(initialState?: NewFormState) {
	const draft = reactive<NewFormState>({ state: {}, uiState: {}, rawOverrides: {} });
	/** Copy the editable fields so draft edits cannot mutate the submitted snapshot. */
	function replaceState({ state, uiState, rawOverrides }: NewFormState) {
		Object.assign(draft, structuredClone({ state: toRaw(state), uiState: toRaw(uiState), rawOverrides: toRaw(rawOverrides) }));
	}
	if (initialState) replaceState(initialState);
	return {
		...toRefs(draft),
		replaceState,
		getReactiveState: () => ({ ...draft }),
	};
}
