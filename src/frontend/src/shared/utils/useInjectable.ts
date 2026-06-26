import { type App, hasInjectionContext, inject, type InjectionKey } from 'vue';

/**
 * Define a new injection key and corresponding provide/inject functions with the correct typings.
 */
export default function useInjectable<T>(key: string): [key: InjectionKey<T>, provide: (app: App, value: T) => void, inject: () => T] {
	const injectionKey: InjectionKey<T> = Symbol(key);
	return [
		injectionKey,
		function provideValue(app: App, value: T) {
			app.provide(injectionKey, value);
		},
		function injectValue() {
			if (!hasInjectionContext()) throw new Error(`inject() for ${key} called without an injection context. Make sure to call this function within a setup() function or a lifecycle hook.`);
			const resolved = inject(injectionKey);
			if (!resolved) throw new Error(`${key} not provided. Make sure the corresponding provider plugin is installed.`);
			return resolved;
		},
	];
}
