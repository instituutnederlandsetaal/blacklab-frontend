import stripJsonComments from 'strip-json-comments';

import type { I18nPlugin } from '@/shared/i18n/plugin';
import type { Translate } from '@/shared/i18n/types';
import { createVueI18nParts, installVueI18nParts, type LocaleMessageBundles, type LocaleMessages, type VueI18nParts } from '@/shared/i18n/vue-i18n';

export type MockLocaleBundle = string | LocaleMessages;
export type MockLocaleBundles = Record<string, MockLocaleBundle>;

export type MockI18nOptions = {
	locale?: string;
	fallbackLocale?: string;
	bundles?: MockLocaleBundles;
};

export type MockI18n = I18nPlugin & Pick<VueI18nParts, 'vueI18nPlugin' | 'vueI18n'>;

export const createMockTranslate = (): Translate => {
	const $tWithinElementDisplayName: Translate['$tWithinElementDisplayName'] = element => element.label || element.value;
	const $tWithinAttributeDisplayName: Translate['$tWithinAttributeDisplayName'] = (element, attribute, defaultDisplayName) => defaultDisplayName || `${element} ${attribute}`;

	return {
		$t(key: string) {
			return key;
		},
		$td<T extends string | null | undefined>(_key: string, defaultText: T) {
			return defaultText;
		},
		$tAnnotatedFieldDisplayName(field) {
			return field.isParallel ? field.version || field.id : field.defaultDisplayName || field.id;
		},
		$tAnnotatedFieldDescription(field) {
			return field.defaultDescription;
		},
		$tAnnotDisplayName(annotation) {
			return annotation.defaultDisplayName || annotation.id;
		},
		$tAnnotDescription(annotation) {
			return annotation.defaultDescription;
		},
		$tAnnotGroupName(group) {
			return group.id;
		},
		$tMetaDisplayName(metadata) {
			return metadata.defaultDisplayName || metadata.id;
		},
		$tMetaDescription(metadata) {
			return metadata.defaultDescription || '';
		},
		$tMetaGroupName<T extends string | undefined | null>(group: { id: string } | T) {
			if (!group) return undefined as T;
			return typeof group === 'string' ? group : group.id;
		},
		$tWithinElementDisplayName,
		$tWithinAttributeDisplayName,
		$tSpanDisplayName: $tWithinElementDisplayName,
		$tSpanAttributeDisplay: $tWithinAttributeDisplayName,
		$tAlignByDisplayName(alignBy) {
			return alignBy.label || alignBy.value;
		},
	};
};

function parseLocaleBundle(locale: string, bundle: MockLocaleBundle): LocaleMessages {
	if (typeof bundle !== 'string') return bundle;

	try {
		const parsed = JSON.parse(stripJsonComments(bundle));
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Locale bundle must be a JSON object.');
		return parsed;
	} catch (error) {
		throw new Error(`Failed to parse mock i18n bundle for locale '${locale}': ${error instanceof Error ? error.message : String(error)}`);
	}
}

function parseLocaleBundles(bundles: MockLocaleBundles): LocaleMessageBundles {
	return Object.fromEntries(Object.entries(bundles).map(([locale, bundle]) => [locale, parseLocaleBundle(locale, bundle)]));
}

function resolveAvailableLocale(requestedLocale: string | undefined, messages: LocaleMessageBundles): string | undefined {
	if (!requestedLocale) return undefined;
	const normalized = requestedLocale.toLowerCase();
	const locales = Object.keys(messages);

	return locales.find(locale => locale.toLowerCase() === normalized) ?? locales.find(locale => locale.toLowerCase().startsWith(`${normalized.split('-')[0]}-`));
}

export function createMockI18n(options: MockI18nOptions = {}): MockI18n {
	const messages = options.bundles ? parseLocaleBundles(options.bundles) : undefined;
	const firstLocale = messages ? Object.keys(messages)[0] : undefined;
	if (messages && !firstLocale) throw new Error('createMockI18n requires at least one locale bundle when bundles are provided.');

	const fallbackLocale = messages ? (resolveAvailableLocale(options.fallbackLocale ?? 'en-us', messages) ?? firstLocale) : options.fallbackLocale;
	const locale = messages ? (resolveAvailableLocale(options.locale ?? fallbackLocale, messages) ?? fallbackLocale) : (options.locale ?? fallbackLocale);
	const i18nParts = createVueI18nParts({
		locale,
		fallbackLocale,
		messages,
		globalInjection: true,
		translate: messages ? undefined : createMockTranslate(),
	});

	return {
		...i18nParts.translatePlugin,
		vueI18nPlugin: i18nParts.vueI18nPlugin,
		vueI18n: i18nParts.vueI18n,
		install(app) {
			installVueI18nParts(app, i18nParts);
		},
	};
}
