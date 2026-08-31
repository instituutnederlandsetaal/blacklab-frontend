import stripJsonComments from 'strip-json-comments';
import { merge } from 'ts-deepmerge';
import { computed, reactive, ref, watch } from 'vue';

import { localStorageSynced } from '@/shared/utils/localstore';

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
 *
 * Some internal workings:
 * 1. locale changes must be triggered through setLocale/setFallbackLocale
 * 2. change is written to pendingLocaleSwitch/pendingFallbackLocaleSwitch, this will trigger the loading state
 * 3. if the messages already exist, the locale is switched immediately and we're done
 * 4. locale object is created in this.localeStates, with the loading promise set
 * 5. once messages are loaded, check if pending state hasn't changed (corpus change, or another locale switch)
 *   5.1 clear pending state
 *   5.2 if not stale and any messages loaded, write messages to locale object
 *   5.3 if messages written: switch active locale to the new value.
 *
 * This means that the locale state might have null messages, even when it's loaded.
 * This is the case when the locale is loaded, but there are no messages for it (e.g. because of a failed fetch and no built-in messages).
 * In that case, the locale will not actually switch.
 * This is useful for e.g. trying to apply the browser's default locale, without it causing the locale selector to switch to a nonexistent locale.
 */
interface LocaleState {
	value: string;
	label: string;
	loading: Promise<any> | null;
	error: string | null;
	messages: null | Record<string, any>;
}

class I18nManager {
	private readonly localeStates = reactive<Record<string, LocaleState>>({});

	public static PRIORITY_SET_BY_USER = 3;
	public static PRIORITY_EXPLICIT_DEFAULT = 2;
	public static PRIORITY_BROWSER = 1;
	public static PRIORITY_UNSET = 0;
	private highestLocalePrecedence = 0;

	// Internals
	private readonly indexId = ref<string | null>(null);
	private readonly locale = ref<string>('');
	private readonly fallbackLocale = ref<string>('');
	private readonly pendingLocaleSwitch = ref<string | null>(null);
	private readonly pendingFallbackLocaleSwitch = ref<string | null>(null);

	// Public read-only state
	public readonly localeState = computed<LocaleState | null>(() => this.localeStates[this.locale.value] || null);
	public readonly fallbackLocaleState = computed<LocaleState | null>(() => this.localeStates[this.fallbackLocale.value] || null);

	public readonly loading = computed(() => !!this.pendingLocaleSwitch.value);
	/**
	 * Separate list of registered locales for display purposes
	 * A non-registered locale could still be active if e.g. the browser requested it, but it won't be in this list until it's registered.
	 * The overrides will be downloaded, but the locale won't be selectable in the default UI until it's registered.
	 */
	private readonly registeredLocales = ref<{ value: string; label: string }[]>([]);

	public readonly availableLocales = computed(() =>
		this.registeredLocales.value.map<{
			value: string;
			label: string;
			loading?: boolean;
			error?: string;
		}>(l => ({
			value: l.value,
			label: l.label,
			loading: this.localeStates[l.value]?.loading ? true : undefined,
			error: this.localeStates[l.value]?.error ?? undefined,
		})),
	);

	constructor(localStorageKey?: string, initialIndexId?: string | null) {
		this.indexId.value = initialIndexId ?? null;
		if (localStorageKey) {
			const localeFromStorage = localStorageSynced<string>(localStorageKey, '', true);
			watch(
				() => ({ own: this.locale.value, stored: localeFromStorage.value }),
				(cur, prev) => {
					const { own, stored } = cur;
					if (prev) {
						const { own: prevOwn, stored: prevStored } = prev;
						if (prevStored !== stored && own !== stored) void this.setLocale(stored, I18nManager.PRIORITY_SET_BY_USER);
						else if (prevOwn !== own && own !== stored && this.highestLocalePrecedence >= I18nManager.PRIORITY_SET_BY_USER) localeFromStorage.value = own;
					} else {
						// init
						if (stored !== own) void this.setLocale(stored, I18nManager.PRIORITY_SET_BY_USER);
					}
				},
				{ immediate: true },
			);
		}
		// Wait a moment, because maybe another script wants to set locale with a higher prio.
		// which will work, but by waiting we allow that to happen first and can potentially save a download.
		setTimeout(() => this.setLocale(navigator.language, I18nManager.PRIORITY_BROWSER), 0);
	}

	/**
	 * Set the active index id for locale override fetching and refresh loaded locale messages.
	 * Returns a promise that will resolve once the locale has been reloaded with the new index ID (if needed).
	 */
	public setIndexId(indexId: string | null | undefined): Promise<void> {
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
			this.setLocale(this.pendingLocaleSwitch.value || this.locale.value, this.highestLocalePrecedence),
			this.setFallbackLocale(this.pendingFallbackLocaleSwitch.value || this.fallbackLocale.value),
		]).then(() => {});
	}

	/**
	 * Register a new locale. Does not load messages immediately.
	 */
	registerLocale(localeId: string, label: string): void {
		const locale = this.resolveLocale(localeId);
		locale.label = label;
		if (!this.registeredLocales.value.some(l => l.value === locale.value)) {
			this.registeredLocales.value.push({ value: locale.value, label });
		}
	}

	/**
	 * Remove a locale from the available list and clean up its state.
	 */
	removeLocale(localeId: string): void {
		const locale = this.resolveLocale(localeId);
		delete this.localeStates[locale.value];
		this.registeredLocales.value = this.registeredLocales.value.filter(l => l.value !== locale.value);
	}

	/**
	 * Set the fallback locale. This will load messages if needed and update when complete.
	 */
	setFallbackLocale(localeId: string): Promise<void> {
		if (!localeId) return Promise.resolve();
		localeId = this.resolveLocale(localeId).value;
		const loadingForIndexId = this.indexId.value;
		this.pendingFallbackLocaleSwitch.value = localeId;
		return this.ensureLocaleLoaded(localeId, this.indexId.value).finally(() => {
			// check if stale
			if (loadingForIndexId === this.indexId.value && this.pendingFallbackLocaleSwitch.value === localeId) {
				// always clear loading state
				this.pendingFallbackLocaleSwitch.value = null;
				// only activate if locale loaded successfully
				if (this.localeStates[localeId]?.messages) {
					this.fallbackLocale.value = localeId;
				} else if (this.localeStates[localeId]?.error) {
					console.info(`Skipping fallback locale switch to '${localeId}' due to error: ${this.localeStates[localeId].error}`);
				}
			}
		});
	}

	getFallbackLocale(): string {
		return this.fallbackLocale.value;
	}

	/**
	 * Set the active locale. This will load messages if needed and update when complete.
	 * @param localeId The locale ID to set
	 * @param priority The highest priority that has requested a locale change. Only changes the locale if this is higher than any previous request.
	 *   This is so that we can have graceful fallback from localstorage -> explicitly configured default -> navigator -> hardcoded default.
	 */
	setLocale(localeId: string, priority = I18nManager.PRIORITY_SET_BY_USER): Promise<void> {
		if (priority < this.highestLocalePrecedence || !localeId) {
			return Promise.resolve();
		}
		localeId = this.resolveLocale(localeId).value;
		this.highestLocalePrecedence = priority;
		this.pendingLocaleSwitch.value = localeId;
		const loadingForIndexId = this.indexId.value;
		return this.ensureLocaleLoaded(localeId, loadingForIndexId).finally(() => {
			// check if stale
			if (loadingForIndexId === this.indexId.value && this.pendingLocaleSwitch.value === localeId) {
				// always clear loading state
				this.pendingLocaleSwitch.value = null;
				// only activate if locale loaded successfully
				if (this.localeStates[localeId]?.messages) {
					this.locale.value = localeId;
				} else if (this.localeStates[localeId]?.error) {
					console.info(`Skipping locale switch to '${localeId}' due to error: ${this.localeStates[localeId].error}`);
				}
			}
		});
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
	private ensureLocaleLoaded(localeId: string, indexId: string | null): Promise<void> {
		const state = this.localeStates[localeId];
		if (!state) {
			throw new Error(`Locale ${localeId} is not registered`);
		}
		// If already loaded, return immediately
		if (state.loading) return state.loading;
		else if (state.error || state.messages) {
			return Promise.resolve();
		}

		return (state.loading = I18nManager.loadLocaleMessages(localeId, indexId)
			.then(r => {
				if (indexId === this.indexId.value) state.messages = r;
			})
			.catch(e => {
				if (indexId === this.indexId.value) state.error = e?.toString() ?? 'Unknown error';
			})
			.finally(() => {
				if (indexId === this.indexId.value) state.loading = null;
			}));
	}

	/**
	 * Helper; Load locale messages from built-in files and external overrides.
	 * Returns the merged messages object
	 */
	private static loadLocaleMessages(localeId: string, indexId: string | null): Promise<Record<string, any>> {
		// NOTE: throw errors for unexpected thing, throw strings for expected things that need to be logged, throw undefined/null for generic expected failures (no overrides).
		// We always log every failure, and this way you get a stack for errors, nothing for expected control flow, and simple message for other things.
		function processImportResult(r: Promise<{ default: string }>): Promise<Record<string, any>> {
			return r
				.catch(e => {
					throw `Built-in messages for locale '${localeId}' not found.`;
				})
				.then(m => {
					try {
						return JSON.parse(stripJsonComments(m.default));
					} catch (e) {
						throw new Error(`Failed to parse built-in messages for locale '${localeId}': ${JSON.stringify(e)}`);
					}
				});
		}
		function processFetchResult(r: Promise<Response>): Promise<Record<string, any>> {
			return r
				.then<string>(async response => {
					if (response.status === 404)
						throw `Custom messages for locale '${localeId}' not found. If this is unintentional, ensure ${indexId ? `${indexId}` : '<corporaInterfaceDefault>'}/static/locales/${localeId}.json exists and is readable.`;
					if (!response.ok)
						throw new Error(`Custom messages for locale '${localeId}' coult not be loaded:\n\tReceived ${response.status} ${response.statusText} while fetching: ${await response.text()}`);
					return response.text();
				})
				.then<Record<string, string>>(m => {
					try {
						return JSON.parse(stripJsonComments(m));
					} catch (e) {
						throw new Error(`Failed to parse custom messages for locale '${localeId}': ${JSON.stringify(e)}`);
					}
				});
		}

		return Promise.allSettled([
			// vite async module import, as string
			// https://vite.dev/guide/features#custom-queries
			processImportResult(import(`@assets/locales/${localeId}.json?raw`)),
			processFetchResult(
				fetch(`${CONTEXT_URL}${indexId ? `/${indexId}` : ''}/static/locales/${localeId}.json`, {
					headers: { accept: 'application/json' },
				}),
			),
		]).then(results => {
			const rejected: PromiseRejectedResult[] = [],
				fulfilled: Record<string, any>[] = [];
			results.forEach(r => (r.status === 'rejected' ? rejected.push(r) : fulfilled.push(r.value)));
			rejected.forEach(r => console.info(r.reason));
			if (!fulfilled.length) {
				throw new Error(`Failed to load locale messages for locale '${localeId}': ${rejected.map(r => r.reason).join(', ')}`);
			}
			try {
				return merge(...fulfilled);
			} catch (e) {
				throw new Error(`Failed to build locale messages for locale '${localeId}': ${JSON.stringify(e)}`);
			}
		});
	}
}

export { I18nManager };
