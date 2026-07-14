import { ref, toRaw } from 'vue';

import { isContainerNode, walkFormNodes } from '@/features/form/model/form-utils';
import type { FormNode } from '@/features/form/model/types';
import type { BlackLabParameters } from '@/features/form/model/types/blacklab-params';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';

export type NewFormState = {
	state: Record<string, unknown>;
	uiState: Record<string, string | null>;
	rawOverrides: BlackLabParameters;
};

export type FormStateInput = {
	readonly state: Readonly<Record<string, unknown>>;
	readonly uiState: Readonly<Record<string, string | null>>;
	readonly rawOverrides: Readonly<BlackLabParameters>;
};

export type DeepReadonly<T> = T extends (...args: any[]) => unknown
	? T
	: T extends readonly (infer Item)[]
		? readonly DeepReadonly<Item>[]
		: T extends object
			? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
			: T;

function freezeDeep<T>(value: T, seen = new WeakSet<object>()): DeepReadonly<T> {
	if (value === null || typeof value !== 'object' || seen.has(value)) return value as DeepReadonly<T>;
	seen.add(value);
	for (const child of Object.values(value)) freezeDeep(child, seen);
	return Object.freeze(value) as DeepReadonly<T>;
}

/** Create a detached, immutable value that can later be cloned into a runtime. */
export function createFormStateSnapshot<T extends FormStateInput>(value: T): DeepReadonly<T> {
	return freezeDeep(structuredClone(toRaw(value)));
}

/**
 * Walk all nodes, look for field nodes, and create initial states for them using their controller's createDefaultState function, and return an object containing all field states.
 *
 * @param rootNode the root
 * @param context
 * @returns
 */
function createInitialControllerStates(context: FormRuntimeContext, ...rootNodes: FormNode[]): Record<string, unknown> {
	const states: Record<string, unknown> = {};
	for (const field of walkFormNodes(rootNodes, 'field')) {
		const initialState = field.controller.createDefaultState(field, context);
		states[field.id] = initialState;
	}
	return states;
}

/**
 * Walk all nodes, look for container nodes, and create initial ui states for them by setting their active child to the first child in their children array (if any),
 * so that tabs and similar container types will have an active child by default.
 *
 * @param definition the form graph
 * @returns the container ui map
 */
function createInitialUiStates(...rootNodes: FormNode[]): Record<string, string | null> {
	const activeContainers: Record<string, string | null> = {};
	for (const node of walkFormNodes(rootNodes).filter(isContainerNode)) {
		const firstChild = node.children[0];
		if (firstChild) activeContainers[node.id] = firstChild.id;
	}
	return activeContainers;
}

export function createDefaultFormState(context: FormRuntimeContext, ...rootNodes: FormNode[]): NewFormState {
	return {
		state: createInitialControllerStates(context, ...rootNodes),
		uiState: createInitialUiStates(...rootNodes),
		rawOverrides: {},
	};
}

export default function createFormState(initialState?: FormStateInput) {
	const state = ref<Record<string, unknown>>(structuredClone(toRaw(initialState?.state ?? {})));
	const uiState = ref<Record<string, string | null>>(structuredClone(toRaw(initialState?.uiState ?? {})));
	const rawOverrides = ref<BlackLabParameters>(structuredClone(toRaw(initialState?.rawOverrides ?? {})));

	function replaceState(newState: FormStateInput): void {
		state.value = structuredClone(toRaw(newState.state));
		uiState.value = structuredClone(toRaw(newState.uiState));
		rawOverrides.value = structuredClone(toRaw(newState.rawOverrides));
	}

	function getRawState(): NewFormState {
		return {
			state: structuredClone(toRaw(state.value)),
			uiState: structuredClone(toRaw(uiState.value)),
			rawOverrides: structuredClone(toRaw(rawOverrides.value)),
		};
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
		getRawState,
		getReactiveState,
		state,
		uiState,
		rawOverrides,
	};
}
