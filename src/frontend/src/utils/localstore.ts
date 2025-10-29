import Vue, { watch } from 'vue';

class StorageWatcher {
	private listeners: Map<string, ((newValue: any) => void)> = new Map();

	constructor() { window.addEventListener('storage', this.callback); }
	public close() { window.removeEventListener('storage', this.callback); }

	// arrow so 'this' context is correct
	private callback = (e: StorageEvent) => {
		if (!e.key || e.newValue == null) return;
		const listener = this.listeners.get(e.key);
		if (!listener) return;

		let newValue: any;
		try { newValue = JSON.parse(e.newValue!); }
		catch { console.error(`LocalStorageWatcher - Failed to parse stored value for ${e.key}`); return; }

		this.listeners.delete(e.key); // prevent recursion
		listener(newValue);
		this.listeners.set(e.key, listener);
	}

	public addListener<T>(storageKey: string, callback: (newValue: T) => void, { immediate = false }: { immediate?: boolean } = {}) {
		if (!this.listeners.has(storageKey)) this.listeners.set(storageKey, callback);
		else console.error(`LocalStorageWatcher - Already watching ${storageKey}`);
		const item = localStorage.getItem(storageKey);
		if (immediate && item != null) {
			try { callback(JSON.parse(item)); }
			catch { callback(item as T); }
		}
	}

	public removeListener(key: string) { this.listeners.delete(key); }
}

// We need an instance to watch for changes
// It doesn't matter where the variable lives, it can be outside the Vue instance.
// As long as it's reactive, this will work.
// When migrating to vue 3, just use a ref or a library that does this for us...
const storageWatcher = new StorageWatcher();

const putNewValueInStorage = (key: string) => (newValue: any) => {
	const storedValue = localStorage.getItem(key);
	const newStoredValue = JSON.stringify(newValue);
	// prevent recursion
	if (storedValue === newStoredValue) return;

	if (newValue === null) localStorage.removeItem(key);
	else localStorage.setItem(key, newStoredValue);
}

export function localStorageSynced<T>(storageKey: string, defaultValue: T, watchStorage = false): {value: T, isFromStorage: boolean} {
	let isFromStorage = false;
	if (localStorage.getItem(storageKey)) {
		try {
			defaultValue = JSON.parse(localStorage.getItem(storageKey) as string);
			isFromStorage = true;
		}
		catch { console.error(`Failed to parse stored value for ${storageKey}`); }
	}

	const v = Vue.observable({
		value: defaultValue,
		isFromStorage,
	});
	watch(() => v.value, putNewValueInStorage(storageKey));
	if (watchStorage) storageWatcher.addListener<T>(storageKey, newValue => {
		v.isFromStorage = true;
		v.value = newValue;
	});

	return v;
}

export function watchStorage(key: string, callback: (newValue: any) => void, settings?: { immediate?: boolean }) {
	storageWatcher.addListener(key, callback, settings);
	return () => storageWatcher.removeListener(key);
}

/** Read the value written by localStorageSynced in the past, without setting up any reactivity */
export function probeLocalStorageSynced<T>(storageKey: string, defaultValue: T): {value: T, isFromStorage: boolean} {
	const v = { value: defaultValue, isFromStorage: false };
	if (localStorage.getItem(storageKey)) {
		try { v.value = JSON.parse(localStorage.getItem(storageKey)!); v.isFromStorage = true; }
		catch { console.error(`Failed to parse stored value for ${storageKey}`); }
	}
	return v;
}

export function syncPropertyWithLocalStorage<T extends object, K extends keyof T>(storageKey: string, props: T, prop: K, watchStorage = false) {
	if (localStorage.getItem(storageKey)) {
		try { props[prop] = JSON.parse(localStorage.getItem(storageKey) as string); }
		catch { console.error(`Failed to parse stored value for ${storageKey}`); }
	}

	const v = Vue.observable(props);
	watch(() => v[prop], putNewValueInStorage(storageKey));
	if (watchStorage) storageWatcher.addListener<T[K]>(storageKey, newValue => props[prop] = newValue);
	return v;
}