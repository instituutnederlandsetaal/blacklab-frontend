import Vue, { watch } from 'vue';
import VueI18n from 'vue-i18n';
import { NormalizedAnnotatedField, NormalizedAnnotation, NormalizedAnnotationGroup, NormalizedMetadataField, NormalizedMetadataGroup, Option } from '@/types/apptypes';
import SelectPicker from '@/components/SelectPicker.vue';
import { elementAndAttributeNameFromFilterId } from '@/utils';
import { getValueFunctions } from '@/components/filters/filterValueFunctions';
import { I18nManager } from '@/utils/i18n-manager';


const LOCALE_STORAGE_KEY = 'cf/locale';

const i18nManager = new I18nManager(LOCALE_STORAGE_KEY);
// Do this first, so that we can validate the default locale from the browser etc.
i18nManager.registerLocale('en-us', 'English')
i18nManager.registerLocale('zh-cn', '中文')
i18nManager.registerLocale('nl-nl', 'Nederlands')
i18nManager.setFallbackLocale('en-us')

Vue.use(VueI18n);
const i18n = new VueI18n();
watch(() => i18nManager.localeState.value, (newVal) => {
	if (newVal?.messages) {
		i18n.locale = newVal.value;
		if (!i18n.messages[newVal.value]) {
			i18n.setLocaleMessage(newVal.value, newVal.messages);
		}
	}
}, { immediate: true });
watch(() => i18nManager.fallbackLocaleState.value, (newVal) => {
	if (newVal?.messages) {
		i18n.fallbackLocale = newVal.value;
		if (!i18n.messages[newVal.value]) {
			i18n.setLocaleMessage(newVal.value, newVal.messages);
		}
	}
});


const LocaleSelector = Vue.extend({
	i18n,
	components: { SelectPicker },
	template: `
		<SelectPicker
			class="locale-select navbar-dropdown"
			data-class="btn-link navbar-brand navbar-dropdown-button"
			data-width="auto"
			data-menu-width="auto"
			right
			hideEmpty
			placeholder="🌐"
			allowUnknownValues

			:options="availableLocales"
			:loading="loading"
			:showValues="false"
			v-model="value"
		/>`,
	computed: {
		value: {
			get(): string|null|undefined { return i18nManager.localeState.value?.value; },
			set(v: string) { i18nManager.setLocale(v); }
		},
		loading(): boolean { return i18nManager.loading.value; },
		availableLocales() { return i18nManager.availableLocales.value; }
	},
});
const localeSelectorInstance = new LocaleSelector().$mount('#locale-selector');

// 1. Define the functions
// For various reasons sometimes we don't have the exact object for which we want to get the translation.
// So some of the parameters might be a little more generic than the actual annotation/metadata field object.
// Especially for metadata/filters.
// (filters are technically not directly equal to metadata objects, but for translation purposes we use the same keys)
const i18nExtensionFunctions = {
	$td<T extends string|null|undefined>(this: Vue, key: string, defaultText: T): T|string {
		// See if there is a non-null, non-undefined value (may be the empty string!)
		const v = this.$te(key) ? this.$t(key) : undefined;
		if (v !== null && v != undefined)
			return v.toString();
		if (this.$i18n.locale !== this.$i18n.fallbackLocale && this.$te(key, this.$i18n.fallbackLocale as string)) {
			const v = this.$te(key, this.$i18n.fallbackLocale as string) ? this.$t(key, this.$i18n.fallbackLocale as string) : undefined;
			if (v !== null && v != undefined)
				return v.toString();
		}
		return defaultText;
	},
	/** Get the localized display name for an annotated field or the default value.
	 * Note that the field ID should be *including* the parallel suffix. So just e.g. "contents__en" for a parallel field. */
	$tAnnotatedFieldDisplayName(this: Vue, f: {id: string, defaultDisplayName?: string, version?: string, isParallel?: boolean}): string {
		// Use a subset of the full annotation object, we sometimes need to call this when we don't have the full object.
		return this.$td(`index.annotatedFields.${f.id}`, (f.isParallel ? f.version || f.id : f.defaultDisplayName || f.id));
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
	$tMetaDisplayName(this: Vue, m: {id: string, defaultDisplayName?: string, componentName?: string, behaviourName?: string }) {
		const vf = m.componentName ? getValueFunctions(m) : undefined;
		const [ tag, attr ] = vf?.isSpanFilter ? elementAndAttributeNameFromFilterId(m.id) : [null, null];
		const subKey = vf?.isSpanFilter ? `spanFilters.${tag}.${attr}` : m.id;
		return this.$td(`index.metadata.${subKey}`, m.defaultDisplayName || m.id);
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
	$tSpanDisplayName(this: Vue, span: Option): string {
		return this.$td(`index.spans.${span.value}`, span.label || span.value);
	},
	$tSpanAttributeDisplay(this: Vue, span: string, attribute: string): string {
		const defaultValue = this.$t('results.groupBy.summary.spanAttribute', { span, attribute }).toString();
		return this.$td(`index.spanAttributes.${span}.${attribute}`, defaultValue);
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

export { i18n }
export function init() {
	return new Promise<void>((resolve) => {
		if (!i18nManager.loading.value) { resolve(); return; }
		const cancel = setInterval(() => {
			if (!i18nManager.loading.value) {
				clearInterval(cancel);
				resolve();
			}
		}, 10);
	})
}

// @ts-ignore
window.i18n = {
	registerLocale: i18nManager.registerLocale.bind(i18nManager),
	removeLocale: i18nManager.removeLocale.bind(i18nManager),
	setFallbackLocale: i18nManager.setFallbackLocale.bind(i18nManager),
	getFallbackLocale: () => i18nManager.fallbackLocaleState.value?.value,
	setDefaultLocale: (defaultLocale: string) => { i18nManager.setLocale(defaultLocale, I18nManager.PRIORITY_EXPLICIT_DEFAULT); },
	setLocale: (locale: string) => { i18nManager.setLocale(locale); },
	i18n,
	manager: i18nManager,
	getLocale() { return i18nManager.localeState.value?.value; },
}