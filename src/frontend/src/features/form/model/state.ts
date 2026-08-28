import { ref, toRaw } from 'vue';

import { isContainerNode, walkFormNodes } from '@/features/form/model/form-utils';
import type { FormNode } from '@/features/form/model/types';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';

export type FormOverrides = Record<string, unknown>;

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
	const state = ref<Record<string, unknown>>(structuredClone(toRaw(initialState?.state ?? {})));
	const uiState = ref<Record<string, string | null>>(structuredClone(toRaw(initialState?.uiState ?? {})));
	const rawOverrides = ref<FormOverrides>(structuredClone(toRaw(initialState?.rawOverrides ?? {})));

	function replaceState(newState: NewFormState): void {
		state.value = structuredClone(toRaw(newState.state));
		uiState.value = structuredClone(toRaw(newState.uiState));
		rawOverrides.value = structuredClone(toRaw(newState.rawOverrides));
	}

	function getReactiveState(): NewFormState {
		return {
			state: state.value,
			uiState: uiState.value,
			rawOverrides: rawOverrides.value,
		};
	}

	return {
		replaceState,
		getReactiveState,
		state,
		uiState,
		rawOverrides,
	};
}
