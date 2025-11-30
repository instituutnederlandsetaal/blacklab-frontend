import { reactive, ref, computed, watch } from 'vue';
import { LocaleMessageObject } from 'vue-i18n';
import { merge } from 'ts-deepmerge';
import stripJsonComments from 'strip-json-comments';
import { Option } from '@/types/apptypes';
import { watchStorage } from '@/utils/localstore';

function parseJsonWithComments<T = any>(jsonResponse: Response): Promise<T> {
	return jsonResponse.text().then(text => JSON.parse(stripJsonComments(text)));
}

interface LocaleState {
	value: string;
	label: string;
	loading: Promise<any>|null;
	error: string | null;
	messages: LocaleMessageObject | null;
}

class I18nManager {
	private readonly registeredLocaleIds = reactive<Record<string, true>>({});
	private readonly localeStates = reactive<Record<string, LocaleState>>({});
	private readonly nextLocale = ref<string|null>(null);
	private nextFallbackLocale: string | null = null;

	public static PRIORITY_SET_BY_USER = 3;
	public static PRIORITY_EXPLICIT_DEFAULT = 2;
	public static PRIORITY_BROWSER = 1;
	public static PRIORITY_UNSET = 0;
	private highestLocalePrecedence = 0;

	// Public reactive state
	private readonly locale = ref<string>('');
	private readonly fallbackLocale = ref<string>('');

	public readonly localeState = computed<LocaleState|null>(() => this.localeStates[this.locale.value] || null);
	public readonly fallbackLocaleState = computed<LocaleState|null>(() => this.localeStates[this.fallbackLocale.value] || null);
	public readonly messages = computed<Record<string, LocaleMessageObject>>(() =>
		Object.fromEntries(
			Object
			.entries(this.localeStates)
			.filter(([_, state]) => !!state.messages)
			.map(([localeId, state]) => [localeId, state.messages as LocaleMessageObject])
		)
	);
	public readonly loading = computed(() => this.nextLocale.value != null);

	// Computed available locales with state information
	public readonly availableLocales = computed<(Option & { loading: boolean; error: string | null })[]>(() => {
		return Object.keys(this.registeredLocaleIds)
			.map(id => this.localeStates[id])
			.map(state => ({
				value: state.value,
				label: state.label,
				loading: !!state.loading,
				error: state.error
			}));
	});

	constructor(localStorageKey?: string) {
		if (localStorageKey) {
			if (localStorage.getItem(localStorageKey)) {
				this.setLocale(localStorage.getItem(localStorageKey)!, I18nManager.PRIORITY_SET_BY_USER);
			}
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
	 * Register a new locale. Does not load messages immediately.
	 */
	registerLocale(localeId: string, label: string): void {
		const locale = this.resolveLocale(localeId);
		locale.label = label;
		this.registeredLocaleIds[locale.value] = true;
	}

	/**
	 * Remove a locale from the available list and clean up its state.
	 */
	async removeLocale(localeId: string): Promise<void> {
		const locale = this.resolveLocale(localeId);
		if (locale.loading) await locale.loading;
		delete this.localeStates[localeId];
		delete this.registeredLocaleIds[localeId];
	}

	/**
	 * Set the fallback locale. This will load messages if needed and update when complete.
	 */
	async setFallbackLocale(localeId: string): Promise<void> {
		localeId = this.resolveLocale(localeId).value;

		this.nextFallbackLocale = localeId;
		this.ensureLocaleLoaded(localeId)
			.then(state => {
				const canApply = state.messages
				// Only perform any state updates if this is still the requested locale (thunk hasn't changed)
				if (this.nextFallbackLocale === localeId) {
					if (canApply) this.fallbackLocale.value = this.nextFallbackLocale;
					if (state.error) console.error(`Failed to load locale ${localeId}:`, state.error);
					this.nextFallbackLocale = null;
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
		this.nextLocale.value = localeId;
		return this.ensureLocaleLoaded(localeId)
			.then(state => {
				const canApply = state.messages
				// Only perform any state updates if this is still the requested locale (thunk hasn't changed)
				if (this.nextLocale.value === localeId) {
					if (canApply) this.locale.value = this.nextLocale.value;
					if (state.error) console.error(`Failed to load locale ${localeId}:`, state.error);
					this.nextLocale.value = null;
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
	 * Return the original locale if we have no match.
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
			match = this.localeStates[requestedLocale] = {
				value: requestedLocale,
				label: requestedLocale,
				loading: null,
				error: null,
				messages: null,
			};
		}
		return match;
	}

	/**
	 * Ensure a locale's messages are loaded. Returns immediately if already loaded.
	 */
	private ensureLocaleLoaded(localeId: string): Promise<LocaleState> {
		const state = this.localeStates[localeId];
		if (!state) { throw new Error(`Locale ${localeId} is not registered`); }
		// If already loaded, return immediately
		if (state.messages) return Promise.resolve(state);
		else if (state.error) { return Promise.reject(state); }
		if (state.loading) return state.loading;

		return state.loading = I18nManager.loadLocaleMessages(localeId)
			.then(messages => { state.messages = messages; return state; })
			.catch(error => { state.error = error; return state; })
			.finally(() => state.loading = null);
	}

	/**
	 * Load locale messages from built-in files and external overrides.
	 */
	private static async loadLocaleMessages(localeId: string): Promise<LocaleMessageObject> {
		let messages: LocaleMessageObject | null = null;
		let overrides: LocaleMessageObject | null = null;

		// Try to load built-in messages
		try {
			messages = await import(`@/locales/${localeId}.json`);
		} catch (e) {
			console.info(`No built-in locale messages for ${localeId}: ${e}`);
		}

		// Try to load external overrides
		try {
			const response = await fetch(`${CONTEXT_URL}${INDEX_ID ? `/${INDEX_ID}` : ''}/static/locales/${localeId}.json`, {
				headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
				cache: 'no-store',
			});

			if (response.ok) {
				overrides = await parseJsonWithComments(response);
			} else if (response.status !== 404) {
				console.info(`Failed to fetch locale overrides for ${localeId}: ${response.statusText}`);
			}
		} catch (e) {
			console.warn(`Override ${INDEX_ID}/static/locales/${localeId}.json does not appear to be valid JSON! Skipping overrides.`, e);
		}

		// If we have neither built-in messages nor overrides, and this isn't a registered locale, throw an error
		if (!messages && !overrides) {
			throw new Error(`No messages found for locale ${localeId}`);
		}

		// Merge messages with overrides taking priority
		return merge(messages || {}, overrides || {});
	}
}

export { I18nManager, type LocaleState };

