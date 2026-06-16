import { computed } from 'vue';

export function memoize<T>(getter: () => T): () => T {
	const value = computed(getter);
	return () => value.value;
}
