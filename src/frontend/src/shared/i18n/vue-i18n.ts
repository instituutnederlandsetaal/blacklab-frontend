import type { App, Plugin } from 'vue';
import { createI18n as createVueI18n } from 'vue-i18n';

import { createI18nPlugin, type I18nPlugin } from './plugin';
import { createTranslate } from './translate';
import type { Translate } from './types';

export type LocaleMessages = Record<string, any>;
export type LocaleMessageBundles = Record<string, LocaleMessages>;

export type VueI18nBridge = {
	locale: { value: string };
	fallbackLocale: { value: string };
	setLocaleMessage: (locale: string, messages: LocaleMessages) => void;
};

export type VueI18nParts = {
	vueI18nPlugin: Plugin;
	vueI18n: VueI18nBridge;
	translatePlugin: I18nPlugin;
};

export type VueI18nPartsOptions = {
	locale?: string;
	fallbackLocale?: string;
	messages?: LocaleMessageBundles;
	globalInjection?: boolean;
	translate?: Translate;
};

export function createVueI18nParts(options: VueI18nPartsOptions = {}): VueI18nParts {
	const vueI18nPlugin = createVueI18n({
		legacy: false,
		globalInjection: options.globalInjection ?? false,
		missingWarn: true,
		fallbackWarn: true,
		locale: options.locale,
		fallbackLocale: options.fallbackLocale,
		messages: options.messages,
	});
	const vueI18n = vueI18nPlugin.global as unknown as VueI18nBridge;
	const translate = options.translate ?? createTranslate(vueI18nPlugin.global as Parameters<typeof createTranslate>[0]);
	const translatePlugin = createI18nPlugin({ translate });

	return {
		vueI18nPlugin,
		vueI18n,
		translatePlugin,
	};
}

export function installVueI18nParts(app: App, parts: VueI18nParts) {
	app.use(parts.vueI18nPlugin);
	parts.translatePlugin.install(app);
}
