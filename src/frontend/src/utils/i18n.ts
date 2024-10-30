import Vue from 'vue';
import VueI18n, { LocaleMessageObject } from 'vue-i18n';
import { merge } from 'ts-deepmerge';
import { NormalizedAnnotatedField, NormalizedAnnotation, NormalizedAnnotationGroup, NormalizedMetadataField, NormalizedMetadataGroup, Option } from '@/types/apptypes';
import SelectPicker from '@/components/SelectPicker.vue';
import { localStorageSynced } from '@/utils/localstore';

// This is some cool typescript magic to get the paths of the keys in the i18n json files.
// This way we can typecheck the keys in the code and get autocompletion.
// However we can't use this yet because it's currently not possible to
// overwrite the $t function in the Vue prototype with the correct types.
// For that we'd need to overwrite the declaration in the vue-i18n package
// but that's not supported by typescript currently.
// See https://github.com/microsoft/TypeScript/issues/36146
// type Path<T> = {
// [K in keyof T]: K extends string ? T[K] extends object
// 	? `${K}.${Path<T[K]>}`
// 	: K
// 	: never;
// }[keyof T];
// type ValidPaths = Path<typeof import('@/locales/en-us.json')>;

Vue.use(VueI18n);
const defaultFallbackLocale = 'en-us';
const defaultLocale = navigator.language.toLowerCase();
const locale = localStorageSynced('cf/locale', defaultLocale, true);
const availableLocales: Option[] = Vue.observable([]);

// Language selector will pick up the new entry, after which it can be loaded.
function registerLocale(locale: string, label: string) {
	availableLocales.push({value: locale, label})
}

function removeLocale(locale: string) {
	const index = availableLocales.findIndex(l => l.value === locale);
	if (index >= 0) availableLocales.splice(index, 1);
}

const i18n = new VueI18n({
	locale: locale.value,
	fallbackLocale: defaultFallbackLocale,
	messages: {},
});

function setFallbackLocale(locale: string) {
	if (availableLocales.some(l => l.value === locale))
		i18n.fallbackLocale = locale;
	else
		console.warn(`Fallback locale ${locale} is not in the list of available locales!`);
}

function setDefaultLocale(defaultLocale: string) {
	// If there is no explicit locale stored, set the locale to the value.
	if (!locale.isFromStorage) locale.value = defaultLocale;
}

async function loadLocaleMessages(locale: string) {
	if (!locale) return;
	// also allow loading locales not defined in the availableLocales.
	// This is useful for loading overrides for locales that are not available in the UI.
	// Also, because the UI list can be updated asynchronously (from customjs), we might have a locale in localStorage that is not in the list yet.
	// if it errors, you'll just see the fallbackLocale and a bunch of warnings.

	let messages: LocaleMessageObject|null = null;
	let overrides: LocaleMessageObject|null = null;

	try { messages = await import(`@/locales/${locale}.json`); }
	catch (e) { console.info(`Failed to load builtin locale messages for ${locale}: ${e}`); }

	overrides =  await fetch(`${CONTEXT_URL}${INDEX_ID ? `/${INDEX_ID}` : ''}/static/locales/${locale}.json`)
		.then(r => {
			if (!r.ok) {
				// If the file doesn't exist, that's fine, we just won't have any overrides.
				// NOTE: browsers will typically log the 404 in the console anyway, there's no way to suppress that from code AFAIK.
				if (r.status !== 404) console.info(`Failed to fetch locale overrides for ${locale}: ${r.statusText}`)
				else console.error(`No locale overrides found for ${locale}. It's safe to ignore the 404 error.`)
				return null;
			} else {
				return r.json();
			}
		})
		.catch(e => {
			console.warn(`Override ${INDEX_ID}/static/locales/${locale}.json does not appear to be valid JSON! Skipping overrides.`, e)
			return null;
		});

	if (messages || overrides) {
		i18n.setLocaleMessage(locale, merge(messages || {}, overrides || {}));
	} else {
		console.error(`Failed to load locale messages for ${locale}`);
	}
}

registerLocale('en-us', 'English')
registerLocale('zh-cn', '中文')
registerLocale('nl-nl', 'Nederlands')

const LocaleSelector = Vue.extend({
	i18n,
	components: { SelectPicker },
	data: () => ({ availableLocales, loading: false, locale }),
	template: `
		<SelectPicker
			class="locale-select navbar-dropdown"
			data-class="btn-link navbar-brand navbar-dropdown-button"
			data-width="auto"
			data-menu-width="auto"
			right
			hideEmpty
			placeholder="🌐"

			:options="availableLocales"
			:loading="loading"
			:showValues="false"
			v-model="locale.value"
		/>`,

	watch: {
		async 'locale.value'() {
			if (this.loading) return;
			if (!this.$i18n.availableLocales.includes(this.locale.value)) {
				this.loading = true
				await loadLocaleMessages(this.locale.value);
				this.loading = false
			}
			this.$i18n.locale = locale.value
		},
	},
	async created() {
		await loadLocaleMessages(defaultLocale);
		if (locale.value !== defaultLocale)
			await loadLocaleMessages(locale.value);
	}
});
const localeSelectorInstance = new LocaleSelector().$mount('#locale-selector');



/** Get the i18n text or fall back to a default value if the key doesn't exist.
 *  Useful for dynamic key values such as field names.
 */
function textOrDefault<T extends string|null|undefined>(i18n: VueI18n, key: string, defaultText: T): T|string {
	return i18n.te(key) ? i18n.t(key).toString() : defaultText;
}

// 1. Define the functions
// For various reasons sometimes we don't have the exact object for which we want to get the translation.
// So some of the parameters might be a little more generic than the actual annotation/metadata field object.
// Especially for metadata/filters.
// (filters are technically not directly equal to metadata objects, but for translation purposes we use the same keys)
const i18nExtensionFunctions = {
	$td<T extends string|null|undefined>(this: Vue, key: string, defaultText: T): T|string {
		if (this.$te(key)) return this.$t(key).toString();
		if (this.$i18n.locale !== this.$i18n.fallbackLocale && this.$te(key, this.$i18n.fallbackLocale as string)) return this.$t(key, this.$i18n.fallbackLocale as string).toString();
		return defaultText;
	},
	/** Get the localized display name for an annotated field or the default value.
	 * Note that the field ID should be *including* the parallel suffix. So just e.g. "contents__en" for a parallel field. */
	$tAnnotatedFieldDisplayName(this: Vue, f: NormalizedAnnotatedField): string {
		return this.$td(`index.annotatedFields.${f.id}`, (f.isParallel ? f.version : f.defaultDisplayName || f.id));
	},
	$tAnnotatedFieldDescription(this: Vue, f: NormalizedAnnotatedField): string {
		return this.$td(`index.annotatedFields.${f.id}_description`, f.defaultDescription);
	},
	/** Get the localized display name for an annotation or the default value */
	$tAnnotDisplayName(this: Vue, a: Pick<NormalizedAnnotation, 'id'|'defaultDisplayName'>) {
		return this.$td(`index.annotations.${a.id}`, a.defaultDisplayName || a.id);
	},
	/** Get the localized description for an annotation or the default value */
	$tAnnotDescription(this: Vue, a: NormalizedAnnotation) {
		return this.$td(`index.annotations.${a.id}_description`, a.defaultDescription);
	},
	// /** Get the localized display name for specific value of an annotation or the default value */
	// $tAnnotValue(this: Vue, a: Pick<NormalizedAnnotation, 'id'|'annotatedFieldId'>, value: string|Option) {
	// 	const key = `index.annotations.${a.annotatedFieldId}.${a.id}_values.${value}`;
	// 	return this.$td(key, typeof value === 'string' ? value : value.label || value.value);
	// },
	/** Get the localized display name for an annotation group or the default value */
	$tAnnotGroupName(this: Vue, g: NormalizedAnnotationGroup) {
		return this.$td(`index.annotationGroups.${g.id}`, g.id);
	},
	/** Get the localized display name for a metadata field or the default value */
	$tMetaDisplayName(this: Vue, m: {id: string, defaultDisplayName?: string}) {
		return this.$td(`index.metadata.${m.id}`, m.defaultDisplayName || m.id);
	},
	/** Get the localized description for a metadata field or the default value */
	$tMetaDescription(this: Vue, m: {id: string, defaultDescription?: string;}) {
		return this.$td(`index.metadata.${m.id}_description`, m.defaultDescription);
	},
	// /** Get the localized display name for a specific value of a metadata field or the default value */
	// $tMetaValue(this: Vue, m: {id: string}, value: string) {
	// 	const key = `index.metadata.${m.id}_values.${value}`;
	// 	return this.$td(key, value);
	// },
	/** Get the localized display name of a metadata group or the default value  */
	$tMetaGroupName<T extends string|undefined|null>(this: Vue, g: {id: string}|T): T|string {
		const originalName = g ? typeof g === 'string' ? g : g.id : undefined;
		if (!originalName) return undefined as T;
		const key = `index.metadataGroups.${originalName}`;
		return this.$td(key, originalName);
	},
	$tWithinDisplayName(this: Vue, within: Option): string {
		return this.$td(`index.within.${within.value}`, within.label || within.value);
	},
	$tAlignByDisplayName(this: Vue, alignBy: Option): string {
		return this.$td(`index.alignBy.${alignBy.value}`, alignBy.label || alignBy.value);
	}
}

// 2. Add the functions to the vue prototype
Object.assign(Vue.prototype, i18nExtensionFunctions);
// 3. Required hoop to make TypeScript happy
type Ii18nExtensionFunctions = typeof i18nExtensionFunctions;
declare module 'vue/types/vue' {
	// 4. Tell TypeScript that this extension adds the functions to the Vue prototype
	interface Vue extends Ii18nExtensionFunctions {}
}

export {
	loadLocaleMessages,
	registerLocale,
	removeLocale,
	i18n,
	textOrDefault,
}

// @ts-ignore
window.i18n = {
	registerLocale,
	removeLocale,
	setFallbackLocale,
	setDefaultLocale,
	setLocale(locale: string) {
		i18n.locale = locale;
	},
	i18n
}