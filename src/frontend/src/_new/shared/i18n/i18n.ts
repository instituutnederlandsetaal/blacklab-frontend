import type { App, FunctionPlugin, InjectionKey } from 'vue';
import { inject, watch } from 'vue';
import { createI18n } from 'vue-i18n';

import type { NormalizedAnnotatedField, NormalizedAnnotation, NormalizedAnnotationGroup } from '@/_new/types/apptypes';

import { elementAndAttributeNameFromFilterId } from '@/_new/shared/blacklab-helpers/span-filters-helper';
import { I18nManager } from '@/_new/shared/i18n/i18n-manager';
import type { Option } from '@/_new/shared/utils/options';

/**
 * This module contains the glue code between our internal i18n message bundle manager (i18n-manager) and the Vue I18n plugin.
 *
 * The i18n manager is responsible for managing the available locales, loading locale messages from the server, and determining the active locale and fallback locale.
 * This module connects the i18n manager to the Vue I18n plugin, so that when the active locale changes, the Vue I18n plugin is updated with the new messages.
 * It also provides some helper functions that can be used in Vue components to get translated display names and descriptions for various objects based on the loaded locale messages.
 */

const LOCALE_STORAGE_KEY = 'cf/locale';
const I18N_FACADE_INJECTION_KEY: InjectionKey<Translate> = Symbol('bf/i18n');

const i18nManager = new I18nManager(LOCALE_STORAGE_KEY);
// Do this first, so that we can validate the default locale from the browser etc.
i18nManager.registerLocale('en-us', 'English');
i18nManager.registerLocale('zh-cn', '中文');
i18nManager.registerLocale('nl-nl', 'Nederlands');
void i18nManager.setFallbackLocale('en-us');

const vueI18nPlugin = createI18n({
	legacy: false,
	globalInjection: false,
});
const i18n = vueI18nPlugin.global;

/** Translate the key, trying the current locale, then the fallbacklocale, before finally returning the default. */
function $td<T extends string | null | undefined>(key: string, defaultText: T): T | string {
	// See if there is a non-null, non-undefined value (may be the empty string!)
	const v = i18n.te(key) ? i18n.t(key) : undefined;
	if (v !== null && v != undefined) return v.toString();
	if (i18n.locale.value !== i18n.fallbackLocale.value && i18n.te(key, i18n.fallbackLocale.value as string)) {
		const v = i18n.te(key, i18n.fallbackLocale.value as string) ? i18n.t(key, i18n.fallbackLocale.value as string) : undefined;
		if (v !== null && v != undefined) return v.toString();
	}
	return defaultText;
}

// 1. Define the functions
// For various reasons sometimes we don't have the exact object for which we want to get the translation.
// So some of the parameters might be a little more generic than the actual annotation/metadata field object.
// Especially for metadata/filters.
// (filters are technically not directly equal to metadata objects, but for translation purposes we use the same keys)
const i18nFacade = {
	$t: i18n.t.bind(i18n),
	$td,
	/** Get the localized display name for an annotated field or the default value.
	 * Note that the field ID should be *including* the parallel suffix. So just e.g. "contents__en" for a parallel field. */
	$tAnnotatedFieldDisplayName(f: { id: string; defaultDisplayName?: string; version?: string; isParallel?: boolean }): string {
		// Use a subset of the full annotation object, we sometimes need to call this when we don't have the full object.
		return this.$td(`index.annotatedFields.${f.id}`, f.isParallel ? f.version || f.id : f.defaultDisplayName || f.id);
	},
	$tAnnotatedFieldDescription(f: NormalizedAnnotatedField): string {
		return this.$td(`index.annotatedFields.${f.id}_description`, f.defaultDescription);
	},
	/** Get the localized display name for an annotation or the default value */
	$tAnnotDisplayName(a: Pick<NormalizedAnnotation, 'id' | 'defaultDisplayName'>) {
		return this.$td(`index.annotations.${a.id}`, a.defaultDisplayName || a.id);
	},
	/** Get the localized description for an annotation or the default value */
	$tAnnotDescription(a: NormalizedAnnotation) {
		return this.$td(`index.annotations.${a.id}_description`, a.defaultDescription);
	},
	// We decided not to allow translation individual field values for now, as it is a footgun
	// users would no longer be able to to see the canonical contents of their corpus
	// as well as it being a neverending source of drift and missing translations
	// in the future, we could perhaps consider allowing it for metadata field values, as those are generally more limited
	// /** Get the localized display name for specific value of an annotation or the default value */
	// $tAnnotValue(a: Pick<NormalizedAnnotation, 'id'|'annotatedFieldId'>, value: string|Option) {
	// 	const key = `index.annotations.${a.annotatedFieldId}.${a.id}_values.${value}`;
	// 	return this.$td(key, typeof value === 'string' ? value : value.label || value.value);
	// },
	/** Get the localized display name for an annotation group or the default value */
	$tAnnotGroupName(g: NormalizedAnnotationGroup) {
		return this.$td(`index.annotationGroups.${g.id}`, g.id);
	},
	/** Get the localized display name for a metadata field or the default value */
	$tMetaDisplayName(m: { id: string; defaultDisplayName?: string; componentName?: string; behaviourName?: string; isSpanFilter?: boolean }) {
		const [tag, attr] = m.isSpanFilter ? elementAndAttributeNameFromFilterId(m.id) : [null, null];
		const subKey = m.isSpanFilter ? `spanFilters.${tag}.${attr}` : m.id;
		return this.$td(`index.metadata.${subKey}`, m.defaultDisplayName || m.id);
	},
	/** Get the localized description for a metadata field or the default value */
	$tMetaDescription(m: { id: string; defaultDescription?: string }) {
		return this.$td(`index.metadata.${m.id}_description`, m.defaultDescription);
	},
	// /** Get the localized display name for a specific value of a metadata field or the default value */
	// $tMetaValue(m: {id: string}, value: string) {
	// 	const key = `index.metadata.${m.id}_values.${value}`;
	// 	return this.$td(key, value);
	// },
	/** Get the localized display name of a metadata group or the default value  */
	$tMetaGroupName<T extends string | undefined | null>(g: { id: string } | T): T | string {
		const originalName = g ? (typeof g === 'string' ? g : g.id) : undefined;
		if (!originalName) return undefined as T;
		const key = `index.metadataGroups.${originalName}`;
		return this.$td(key, originalName);
	},
	$tSpanDisplayName(span: Option): string {
		return this.$td(`index.spans.${span.value}`, span.label || span.value);
	},
	$tSpanAttributeDisplay(span: string, attribute: string): string {
		const defaultValue = this.$t('results.shared.spanAttribute', { span, attribute }).toString();
		return this.$td(`index.spanAttributes.${span}.${attribute}`, defaultValue);
	},
	$tAlignByDisplayName(alignBy: Option): string {
		return this.$td(`index.alignBy.${alignBy.value}`, alignBy.label || alignBy.value);
	},
};

watch(
	i18nManager.localeState,
	newVal => {
		if (newVal?.messages) {
			i18n.locale.value = newVal.value;
			i18n.setLocaleMessage(newVal.value, newVal.messages);
		}
	},
	{ immediate: true },
);
watch(i18nManager.fallbackLocaleState, newVal => {
	if (newVal?.messages) {
		i18n.fallbackLocale.value = newVal.value;
		i18n.setLocaleMessage(newVal.value, newVal.messages);
	}
});

// augment global functions in vue components
// add the functions to the global interface (ts module augmentation)
// see https://vuejs.org/guide/typescript/options-api.html#type-augmentation-placement
declare module 'vue' {
	interface ComponentCustomProperties extends Translate {}
}
// Install the actual functions
// Make i18n installable as a plugin, so that it can be used with app.use() if desired, and so that the global properties are properly typed.
export const install: FunctionPlugin = function install(app: App) {
	app.use(vueI18nPlugin);
	Object.assign(app.config.globalProperties, i18nFacade);
	app.provide(I18N_FACADE_INJECTION_KEY, i18nFacade);
};
export const registerLocale = i18nManager.registerLocale.bind(i18nManager);
export const removeLocale = i18nManager.removeLocale.bind(i18nManager);

export const getFallbackLocale = i18nManager.getFallbackLocale.bind(i18nManager);
export const setFallbackLocale = i18nManager.setFallbackLocale.bind(i18nManager);

export const getLocale = i18nManager.getLocale.bind(i18nManager);
export const setLocale = i18nManager.setLocale.bind(i18nManager);

export const setDefaultLocale = (defaultLocale: string) => i18nManager.setLocale(defaultLocale, I18nManager.PRIORITY_EXPLICIT_DEFAULT);
export const setIndexId = (indexId: string | null | undefined) => i18nManager.setIndexId(indexId);
export const manager = i18nManager;
export const init = new Promise<void>(resolve => {
	if (!i18nManager.loading.value) {
		resolve();
		return;
	}
	const cancel = setInterval(() => {
		if (!i18nManager.loading.value) {
			clearInterval(cancel);
			resolve();
		}
	}, 10);
});
export function useI18n() {
	return inject(I18N_FACADE_INJECTION_KEY)!;
}
export type Translate = typeof i18nFacade;
export const translate: Translate = i18nFacade;

// customjs interop, expose these on the global object so that they can be used in customjs scripts without needing to import them.
(globalThis as typeof globalThis & { i18n: any }).i18n = {
	registerLocale,
	removeLocale,
	getFallbackLocale,
	setFallbackLocale,
	getLocale,
	setLocale,
	setDefaultLocale,
	manager,
	translate,
};
