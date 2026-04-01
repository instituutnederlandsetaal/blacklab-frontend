import { reactive, ref, computed, watch, markRaw } from 'vue';
import { merge } from 'ts-deepmerge';
import stripJsonComments from 'strip-json-comments';
import { watchStorage } from '@/utils/localstore';
interface LocaleState {
	value: string;
	label: string;
	loading: Promise<any>|null;
	error: string | null;
	messages: unknown | null;
}

const importBuiltinLocale = (() => {
	const cache: Record<string, Promise<{default: string}>> = {};
	return (localeId: string): Promise<{default: string}> => {
		return (cache[localeId] ??= import(`@/locales/${localeId}.json?raw`));
	}
})();

/**
 * A helper for managing and caching locale message bundles.
 * It does not actually interface with with the vue-i18n plugin directly,
 * only exposes the currently active locale, its messages, and loading/error states.
 * 
 * Setting a new (fallback-)locale will trigger loading of the corresponding messages.
 * After which the active locale will be updated.
 * This way, there should never be a state where the locale is set, but the messages are not loaded yet.
 * 
 * It still requires wiring to vue-i18n to push the new messages/active locale to the plugin,
 * but all you need for this is a simple watch() on the localeState object.
 * 
 * After that, you should *not* use the vue-i18n API directly for updating the locale,
 * but always go through this manager, so that the state is properly updated and messages are loaded as needed.
 * 
 * Since locales can be overridden per corpus/index, we also support an optional indexId, 
 * which will trigger a refresh of the active locale's messages when changed, to ensure the local overrides are applied correctly.
 */
class I18nManager {
	private readonly localeStates = reactive<Record<string, LocaleState>>({});

	public static PRIORITY_SET_BY_USER = 3;
	public static PRIORITY_EXPLICIT_DEFAULT = 2;
	public static PRIORITY_BROWSER = 1;
	public static PRIORITY_UNSET = 0;
	private highestLocalePrecedence = 0;
	
	// Internals
	private readonly indexId = ref<string|null>(null);
	private readonly locale = ref<string>('');
	private readonly fallbackLocale = ref<string>('');
	private readonly pendingLocaleSwitch = ref<string|null>(null);
	private readonly pendingFallbackLocaleSwitch = ref<string|null>(null);

	// Public read-only state
	public readonly localeState = computed<LocaleState|null>(() => this.localeStates[this.locale.value] || null);
	public readonly fallbackLocaleState = computed<LocaleState|null>(() => this.localeStates[this.fallbackLocale.value] || null);
	
	public readonly loading = computed(() => !!this.pendingLocaleSwitch.value);
	public readonly availableLocales = computed(() => Object.values(this.localeStates).map(s => ({ value: s.value, label: s.label })));

	constructor(localStorageKey?: string, initialIndexId?: string|null) {
		this.indexId.value = initialIndexId ?? null;
		if (localStorageKey) {
			if (localStorage.getItem(localStorageKey)) {
				this.setLocale(localStorage.getItem(localStorageKey)!, I18nManager.PRIORITY_SET_BY_USER);
			}
			// Only save actual explicit locale choices user changes
			watch(() => this.locale.value, newVal => {
				if (this.highestLocalePrecedence >= I18nManager.PRIORITY_SET_BY_USER) {
					localStorage.setItem(localStorageKey, newVal);
				}
			});
			watchStorage(localStorageKey, newVal => this.setLocale(newVal, I18nManager.PRIORITY_SET_BY_USER), {immediate: true});
		}
		// Wait a moment, because maybe another script wants to set locale with a higher prio.
		// which will work, but by waiting we allow that to happen first and can potentially save a download.
		setTimeout(() => this.setLocale(navigator.language, I18nManager.PRIORITY_BROWSER), 0);
	}

	/**
	 * Set the active index id for locale override fetching and refresh loaded locale messages.
	 * Returns a promise that will resolve once the locale has been reloaded with the new index ID (if needed).
	 */
	public setIndexId(indexId: string|null|undefined): Promise<void> {
		const normalizedIndexId = indexId || null;
		if (this.indexId.value === normalizedIndexId) {
			return Promise.resolve();
		}
		this.indexId.value = normalizedIndexId;
		return this.invalidateLocaleMessages();
	}

	private invalidateLocaleMessages(): Promise<void> {
		Object.values(this.localeStates).forEach(state => {
			state.messages = null;
			state.error = null;
			state.loading = null;
		});

		return Promise.allSettled([
			this.setLocale(this.locale.value, this.highestLocalePrecedence),
			this.setFallbackLocale(this.fallbackLocale.value)
		]).then(() => {});
	}

	/**
	 * Register a new locale. Does not load messages immediately.
	 */
	registerLocale(localeId: string, label: string): void {
		const locale = this.resolveLocale(localeId);
		locale.label = label;
		if (!this.localeStates[locale.value]) {
			this.localeStates[locale.value] = {
				value: locale.value,
				label,
				loading: null,
				error: null,
				messages: null,
			};
		}
	}

	/**
	 * Remove a locale from the available list and clean up its state.
	 */
	async removeLocale(localeId: string): Promise<void> {
		const locale = this.resolveLocale(localeId);
		if (locale.loading) await locale.loading;
		delete this.localeStates[locale.value];
	}

	/**
	 * Set the fallback locale. This will load messages if needed and update when complete.
	 */
	async setFallbackLocale(localeId: string): Promise<void> {
		localeId = this.resolveLocale(localeId).value;
		const loadingForIndexId = this.indexId.value;
		this.pendingFallbackLocaleSwitch.value = localeId;
		this.ensureLocaleLoaded(localeId, this.indexId.value)
			.finally(() => {
				// check if stale
				if (loadingForIndexId === this.indexId.value && this.pendingFallbackLocaleSwitch.value === localeId) {
					// always clear loading state
					this.pendingFallbackLocaleSwitch.value = null;
					// only activate if locale loaded successfully
					if (this.localeStates[localeId]?.messages) {
						this.locale.value = localeId;
					}
				}
			});
	}

	/**
	 * Set the active locale. This will load messages if needed and update when complete.
	 * @param localeId The locale ID to set
	 * @param priority The highest priority that has requested a locale change. Only changes the locale if this is higher than any previous request.
	 *   This is so that we can have graceful fallback from localstorage -> explicitly configured default -> navigator -> hardcoded default.
	 */
	setLocale(localeId: string, priority = I18nManager.PRIORITY_SET_BY_USER): Promise<void> {
		if (priority < this.highestLocalePrecedence || !localeId) { return Promise.resolve(); }
		localeId = this.resolveLocale(localeId).value;
		this.highestLocalePrecedence = priority;
		this.pendingLocaleSwitch.value = localeId;
		const loadingForIndexId = this.indexId.value;
		return this
			.ensureLocaleLoaded(localeId, loadingForIndexId)
			.finally(() => {
				// check if stale
				if (loadingForIndexId === this.indexId.value && this.pendingLocaleSwitch.value === localeId) {
					// always clear loading state
					this.pendingLocaleSwitch.value = null;
					// only activate if locale loaded successfully
					if (this.localeStates[localeId]?.messages) {
						this.locale.value = localeId;
					}
				}
			})
	}

	/**
	 * Get the current active locale.
	 */
	getLocale(): string {
		return this.locale.value;
	}

	/**
	 * Resolve a locale string to the best available match.
	 * If there's an exact locale registered, returns that one.
	 * If there's an approximate locale (prefix matches, but not exact), returns that one.
	 * 
	 * Required because some browsers report e.g. 'en', but others report 'en-us' or 'en-gb',
	 * this way we automatically use the best available match, and we can also ensure consistent casing of locale IDs.
	 */
	private resolveLocale(requestedLocale: string): LocaleState {
		requestedLocale = requestedLocale.toLowerCase();
		// If exact match exists, use it
		if (this.localeStates[requestedLocale]) {
			return this.localeStates[requestedLocale];
		}

		// Try to find a locale that starts with the requested prefix (e.g. 'nl' -> 'nl-nl')
		const prefix = requestedLocale.split('-')[0];
		let match = Object.values(this.localeStates).find(locale => locale.value.startsWith(prefix + '-'));
		if (!match) {
			this.localeStates[requestedLocale] = {
				value: requestedLocale,
				label: requestedLocale,
				loading: null,
				error: null,
				messages: null,
			};
			match = this.localeStates[requestedLocale];
		}
		return match;
	}

	/**
	 * Trigger a load on the locale if required, 
	 * Does not update state, only updates the locale's state.
	 * 
	 * @returns A promise that resolves once the locale has settled (meaning either in loaded or error state).
	 */
	private ensureLocaleLoaded(localeId: string, indexId: string|null): Promise<void> {
		const state = this.localeStates[localeId];
		if (!state) { throw new Error(`Locale ${localeId} is not registered`); }
		// If already loaded, return immediately
		if (state.loading) return state.loading;
		else if (state.messages) return Promise.resolve();
		else if (state.error) { return Promise.reject(); }

		return state.loading = I18nManager.loadLocaleMessages(localeId, indexId)
			.then(r => { if (indexId === this.indexId.value) state.messages = r; })
			.catch(e => { if (indexId === this.indexId.value) state.error = e?.toString() ?? 'Unknown error'; })
			.finally(() => { if (indexId === this.indexId.value) state.loading = null; });
	}

	/**
	 * Helper; Load locale messages from built-in files and external overrides.
	 * Returns the merged messages object
	 */
	private static loadLocaleMessages(localeId: string, indexId: string|null): Promise<any> {
		function processImportResult(r: Promise<{default: string}>): Promise<Record<string, any>> {
			return r
				.catch(e => { throw new Error(`Failed to load built-in locale messages for ${localeId}: ${e}`); })
				.then(m => m.default)
				.then(stripJsonComments)
				.then(JSON.parse)
		}
		function processFetchResult(r: Promise<Response>): Promise<Record<string, any>> {
			return r.then<string>(async response => { 
				if (response.status === 404) {console.info(`Locale overrides for ${localeId} not found`); return '{}'; }
				if (!response.ok) { throw new Error(`Received ${response.status} ${response.statusText} while fetching locale overrides for ${localeId}: ${await response.text()}`); }
				return response.text().catch(e => { throw new Error(`Locale override ${localeId} does not appear to be valid JSON! Skipping overrides: ${e}`); });
			})
			.then(stripJsonComments)
			.then(JSON.parse);
		}

		return Promise.allSettled([
			// vite async module import, as string
			// https://vite.dev/guide/features#custom-queries
			processImportResult(importBuiltinLocale(localeId)), 
			processFetchResult(fetch(`${CONTEXT_URL}${indexId ? `/${indexId}` : ''}/static/locales/${localeId}.json`, { headers: { accept: 'application/json' } }))
		]).then(results => {
			try {
				const rejected: PromiseRejectedResult[] = [], fulfilled: Record<string, any>[] = [];
				results.forEach(r => r.status === 'rejected' ? rejected.push(r) : fulfilled.push(r.value));
				rejected.forEach(r => console.info(r.reason));
				if (!fulfilled.length) {
					throw new Error(`No messages found for locale ${localeId}`);
				}
				return markRaw(merge(...fulfilled));
			} catch (e) {
				console.error(e); throw e;
			}
		});
	}
}

export { I18nManager, type LocaleState };

