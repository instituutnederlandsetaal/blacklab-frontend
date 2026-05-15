import { type App, inject, type InjectionKey } from "vue";

/**
 * Define a new injection key and corresponding provide/inject functions with the correct typings.
 * @param key 
 * @returns 
 */
export default function useInjectable<T>(key: string): [key: InjectionKey<T>, provide: (app: App, value: T) => void, inject: () => T] {
	const injectionKey: InjectionKey<T> = Symbol(key);
	return [
		injectionKey, 
		function provideValue(app: App, value: T) {
			app.provide(injectionKey, value); 
		},
		function injectValue() {
			const r = inject(injectionKey);
			if (!r) throw new Error(`${key} not provided. Make sure createCorpusData() is installed.`);
			return r;
		}
	];
}