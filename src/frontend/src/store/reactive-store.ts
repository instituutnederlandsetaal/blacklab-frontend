import { computed } from 'vue';

/**
 * Wrapper to enable memoization of getters and avoid unnecessary recomputations when getter is used in multiple places.<br>
 * Basically make sure every invocation returns the same instance of the return value,<br>
 * and make it reactive so that when called from within a component, the component will update when the return value changes
 */
export function memoize<T>(getter: () => T): (() => T) {
  const v = computed(getter);
  return () => v.value;
};