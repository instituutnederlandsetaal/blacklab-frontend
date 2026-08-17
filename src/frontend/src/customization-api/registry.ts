import { computed, ref, shallowRef, toValue, triggerRef, watch, type MaybeRefOrGetter, type ObjectPlugin, type Ref, type ShallowRef } from 'vue';

import type { SearchFormConfigurationCallback, SearchFormCustomization, SearchFormCustomizationCallback, SearchResultsCustomization } from '@/customization-api/external/external-api';
import { createLegacyCustomizationApi, type LegacyCustomizationApi } from '@/customization-api/external/legacy';
import { customJsDisposeEvent } from '@/interop/page-customization';
import type { Corpus } from '@/types/apptypes';

import useInjectable from '@/shared/utils/useInjectable';

type UnregisterCustomization = () => void;
export type CustomizationRegistry = {
	applyLegacyCustomization: (callback: (customizations: LegacyCustomizationApi) => void) => void;
	registerForm: (customization: SearchFormCustomization) => UnregisterCustomization;
	registerResults: (customization: SearchResultsCustomization) => UnregisterCustomization;

	readonly legacyApi: Readonly<ShallowRef<LegacyCustomizationApi | undefined>>;
	/** Callbacks that configure the standard form before its graph is constructed. */
	readonly formConfigurators: Ref<readonly SearchFormConfigurationCallback[]>;
	/** Callbacks that customize the completed form graph. */
	readonly formCustomizers: Ref<readonly SearchFormCustomizationCallback[]>;
	readonly resultCustomizations: Ref<readonly SearchResultsCustomization[]>;
};
export type CustomizationRegistryPlugin = ObjectPlugin & CustomizationRegistry;

const [_key, provideCustomizationRegistry, useCustomizationRegistry] = useInjectable<CustomizationRegistry>('customization-registry');
export { useCustomizationRegistry };

export function createCustomizationRegistry(corpus: MaybeRefOrGetter<Corpus | undefined>): CustomizationRegistryPlugin {
	const formRegistrations = ref(new Set<SearchFormCustomization>());
	const resultRegistrations = ref(new Set<SearchResultsCustomization>());
	const legacyApi = shallowRef<LegacyCustomizationApi>();

	watch(
		() => toValue(corpus),
		currentCorpus => {
			// Invalidate the legacy target first so synchronous downstream watchers
			// cannot combine the incoming corpus with registrations from the previous
			// generation. Disposal events from old scripts may arrive later; deleting
			// from these fresh sets is harmless.
			legacyApi.value = undefined;
			formRegistrations.value = new Set();
			resultRegistrations.value = new Set();
			legacyApi.value = currentCorpus ? createLegacyCustomizationApi(currentCorpus) : undefined;
		},
		{ flush: 'sync', immediate: true },
	);

	function currentScriptIsValid(): boolean {
		const script = typeof document === 'undefined' ? null : document.currentScript;
		if (!script || script.isConnected) return true;
		console.warn('Ignored customization from a script that is not connected to the document. Do not register customizations asynchronously or from after script has been removed.');
		return false;
	}

	function register<T>(collection: Ref<Set<T>>, customization: T): UnregisterCustomization {
		if (!legacyApi.value) {
			console.warn('Ignored customization because no corpus is loaded. Corpus customizations cannot be registered before corpus publication.');
			return () => {};
		}
		if (!currentScriptIsValid()) return () => {};

		const script = typeof document === 'undefined' ? null : document.currentScript;
		collection.value.add(customization);
		const unregister = () => collection.value.delete(customization);
		script?.addEventListener(customJsDisposeEvent, unregister, { once: true });
		return unregister;
	}

	const formConfigurators = computed<SearchFormConfigurationCallback[]>(() =>
		Array.from(formRegistrations.value).flatMap(customization => (typeof customization === 'function' ? customization : (customization.configure ?? []))),
	);
	const formCustomizers = computed<SearchFormCustomizationCallback[]>(() =>
		Array.from(formRegistrations.value).flatMap(customization => (typeof customization !== 'function' ? (customization.customize ?? []) : [])),
	);
	const resultCustomizations = computed(() => Array.from(resultRegistrations.value));

	const registry: CustomizationRegistry = {
		applyLegacyCustomization(callback) {
			const currentLegacy = legacyApi.value;
			if (!currentLegacy) {
				console.warn('Ignored legacy customization because no corpus is loaded. Legacy customizations cannot be registered before corpus publication.');
				return;
			}
			if (!currentScriptIsValid()) return;
			try {
				callback(currentLegacy);
			} catch (error) {
				console.error('Error in legacy customization callback:', error);
			} finally {
				// The legacy target deliberately is not Vue-reactive. Notify downstream
				// systems once after the immediate callback has installed its hooks.
				triggerRef(legacyApi);
			}
		},
		registerForm: customization => register(formRegistrations, customization),
		registerResults: customization => register(resultRegistrations, customization),
		legacyApi,
		formConfigurators,
		formCustomizers,
		resultCustomizations,
	};
	return {
		...registry,
		install(app) {
			provideCustomizationRegistry(app, registry);
		},
	};
}
