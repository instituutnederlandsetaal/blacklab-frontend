import { computed, type DebuggerOptions } from 'vue';

export function memoize<T>(getter: () => T, debuggerOptions?: DebuggerOptions): () => T {
	const value = computed(getter, debuggerOptions);
	return () => value.value;
}
