import { tryOnScopeDispose } from '@vueuse/core';
import { watch, type ObjectPlugin } from 'vue';
import { createI18n as createVueI18n } from 'vue-i18n';

import { createTranslate, provideTranslate } from './translate';
import type { Translate } from './types';

import { I18nManager } from '@/shared/i18n/i18n-manager';
import useInjectable from '@/shared/lib/vue/useInjectable';

/**
 * This module contains the glue code between our internal i18n message bundle manager (i18n-manager) and the Vue I18n plugin.
 *
 * The i18n manager is responsible for managing the available locales, loading locale messages from the server, and determining the active locale and fallback locale.
 * This module connects the i18n manager to the Vue I18n plugin, so that when the active locale changes, the Vue I18n plugin is updated with the new messages.
 * It also provides some helper functions that can be used in Vue components to get translated display names and descriptions for various objects based on the loaded locale messages.
 */

const LOCALE_STORAGE_KEY = 'cf/locale';

const [_i18nManagerInjectionKey, provideI18nManager, useI18nManager] = useInjectable<I18nManager>('i18nManager');

export { useI18nManager };

export type AppI18n = ObjectPlugin & {
	manager: I18nManager;
	translate: Translate;
	init: Promise<void>;
	registerLocale: I18nManager['registerLocale'];
	removeLocale: I18nManager['removeLocale'];
	getFallbackLocale: I18nManager['getFallbackLocale'];
	setFallbackLocale: I18nManager['setFallbackLocale'];
	getLocale: I18nManager['getLocale'];
	setLocale: I18nManager['setLocale'];
	setDefaultLocale: (defaultLocale: string) => Promise<void>;
	setIndexId: I18nManager['setIndexId'];
};

type VueI18nBridge = {
	locale: { value: string };
	fallbackLocale: { value: string };
	setLocaleMessage: (locale: string, messages: Record<string, any>) => void;
};

function registerDefaultLocales(manager: I18nManager) {
	manager.registerLocale('en-us', 'English');
	manager.registerLocale('zh-cn', '中文');
	manager.registerLocale('nl-nl', 'Nederlands');
}

function createInitPromise(manager: I18nManager) {
	return new Promise<void>(resolve => {
		if (!manager.loading.value) {
			resolve();
			return;
		}

		const cancel = setInterval(() => {
			if (!manager.loading.value) {
				clearInterval(cancel);
				resolve();
			}
		}, 10);
	});
}

function bridgeManagerToVueI18n(manager: I18nManager, i18n: VueI18nBridge) {
	const stopLocaleWatch = watch(
		manager.localeState,
		newVal => {
			if (newVal?.messages) {
				i18n.locale.value = newVal.value;
				i18n.setLocaleMessage(newVal.value, newVal.messages);
			}
		},
		{ immediate: true },
	);

	const stopFallbackWatch = watch(manager.fallbackLocaleState, newVal => {
		if (newVal?.messages) {
			i18n.fallbackLocale.value = newVal.value;
			i18n.setLocaleMessage(newVal.value, newVal.messages);
		}
	});

	const cleanup = () => {
		stopLocaleWatch();
		stopFallbackWatch();
	};

	tryOnScopeDispose(() => cleanup());
	return cleanup;
}

export function createI18n(): AppI18n {
	const manager = new I18nManager(LOCALE_STORAGE_KEY);
	registerDefaultLocales(manager);
	void manager.setFallbackLocale('en-us');

	const vueI18nPlugin = createVueI18n({
		legacy: false,
		globalInjection: false,
		missingWarn: true,
		fallbackWarn: true,
	});
	const vueI18n = vueI18nPlugin.global as unknown as VueI18nBridge;
	const translate = createTranslate(vueI18nPlugin.global as Parameters<typeof createTranslate>[0]);

	const api: AppI18n = {
		install(app) {
			const stopBridge = bridgeManagerToVueI18n(manager, vueI18n);
			app.onUnmount(stopBridge);
			app.use(vueI18nPlugin);
			provideTranslate(app, translate);
			provideI18nManager(app, manager);
		},
		manager,
		translate,
		init: createInitPromise(manager),
		registerLocale: manager.registerLocale.bind(manager),
		removeLocale: manager.removeLocale.bind(manager),
		getFallbackLocale: manager.getFallbackLocale.bind(manager),
		setFallbackLocale: manager.setFallbackLocale.bind(manager),
		getLocale: manager.getLocale.bind(manager),
		setLocale: manager.setLocale.bind(manager),
		setDefaultLocale: (defaultLocale: string) => manager.setLocale(defaultLocale, I18nManager.PRIORITY_EXPLICIT_DEFAULT),
		setIndexId: manager.setIndexId.bind(manager),
	};

	// Legacy interop, we used to expose this surface (for customjs), so keep it intact for now.
	(globalThis as typeof globalThis & { i18n: AppI18n }).i18n = api;

	return api;
}
