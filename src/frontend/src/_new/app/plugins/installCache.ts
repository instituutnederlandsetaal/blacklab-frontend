import { inject, provide, reactive } from "vue";

const useCache = <T> (name: string) => {
	name = `cache_${name}`;
	if (!inject(name)) {
		provide(name, reactive<Record<string|symbol, T>>({}));
	}
	
	return inject(name) as Record<string|symbol, T>;
}

/**
 * Create a lazy getter for the cache. 
 * The cache will be created on first use of the getter, and will be shared across all components that use the same cache name.
 * 
 * @param name 
 * @returns 
 */
export const createCache = <T>(name: string) => {
	return () => useCache<T>(name);
}
export const null_cache_key = Symbol('null_cache_key');
