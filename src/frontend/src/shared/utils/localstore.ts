import { reactive, watch } from 'vue';

class StorageWatcher {
	private listeners: Map<string, (newValue: any) => void> = new Map();

	// check for window to account for test environments
	constructor() {
		if (typeof window !== 'undefined') window.addEventListener('storage', this.callback);
	}
	public close() {
		if (typeof window !== 'undefined') window.removeEventListener('storage', this.callback);
	}

	// arrow so 'this' context is correct
	private callback = (e: StorageEvent) => {
		if (!e.key || e.newValue == null) return;
		const listener = this.listeners.get(e.key);
		if (!listener) return;

		let newValue: any;
		try {
			newValue = JSON.parse(e.newValue!);
		} catch {
			console.error(`LocalStorageWatcher - Failed to parse stored value for ${e.key}`);
			return;
		}

		this.listeners.delete(e.key); // prevent recursion
		listener(newValue);
		this.listeners.set(e.key, listener);
	};

	public addListener<T>(storageKey: string, callback: (newValue: T) => void, { immediate = false }: { immediate?: boolean } = {}) {
		if (!this.listeners.has(storageKey)) this.listeners.set(storageKey, callback);
		else console.error(`LocalStorageWatcher - Already watching ${storageKey}`);
		const item = localStorage.getItem(storageKey);
		if (immediate && item != null) {
			try {
				callback(JSON.parse(item));
			} catch {
				callback(item as T);
			}
		}
	}

	public removeListener(key: string) {
		this.listeners.delete(key);
	}
}

// We need an instance to watch for changes
// It doesn't matter where the variable lives, it can be outside the Vue instance.
// As long as it's reactive, this will work.
// When migrating to vue 3, just use a ref or a library that does this for us...
const storageWatcher = new StorageWatcher();

const putNewValueInStorage = (key: string) => (newValue: any) => {
	if (typeof localStorage === 'undefined') return;
	const storedValue = localStorage.getItem(key);
	const newStoredValue = JSON.stringify(newValue);
	// prevent recursion when there is also a listener on localStorage
	if (storedValue === newStoredValue) return;

	if (newValue === null) localStorage.removeItem(key);
	else localStorage.setItem(key, newStoredValue);
};

type ExpiringValue<T> = { value: T; expiry: number | null; isFromStorage: boolean };
export function localStorageSynced<T>(storageKey: string, defaultValue: T, watchStorage = false, ttlSeconds?: number): ExpiringValue<T> {
	function nextExpiry(): number | null {
		return ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
	}
	function isExpired(v: ExpiringValue<T>): boolean {
		return !!v.expiry && v.expiry < Date.now();
	}
	/** Parse the json, check the expiry (if any) and return the value if still current, or the default value with expiry of ttl. */
	function fromJson(json: string | null): ExpiringValue<T> {
		let v: ExpiringValue<T> | null = null;
		if (json) {
			try {
				const obj = JSON.parse(json);
				if (typeof obj === 'object' && 'value' in obj && 'expiry' in obj) v = { ...obj, isFromStorage: true };
				else if (typeof obj === typeof defaultValue) v = { value: obj as T, expiry: nextExpiry(), isFromStorage: true };
			} catch {
				console.warn(`Failed to parse value for ${storageKey}`);
			}
		}
		if (!v || isExpired(v)) v = { value: defaultValue, expiry: nextExpiry(), isFromStorage: false };
		return v;
	}

	// Make the value observable so updates will trigger our watcher and propagate to localStorage
	const v: ExpiringValue<T> = reactive(fromJson(typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey))) as ExpiringValue<T>;
	// Every time the value changes, update the localStorage with the new value + reset the ttl.
	watch((): Omit<ExpiringValue<T>, 'isFromStorage'> => ({ value: v.value, expiry: nextExpiry() }), putNewValueInStorage(storageKey));

	// For simplicity, we only check expiry during initial read
	if (watchStorage && typeof localStorage !== 'undefined') storageWatcher.addListener<ExpiringValue<T>>(storageKey, newValue => Object.assign(v, newValue));
	return v;
}
