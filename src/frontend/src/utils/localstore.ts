import Vue from 'vue';

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

	public addListener<T>(storageKey: string, callback: (newValue: T) => void) {
		if (!this.listeners.has(storageKey)) this.listeners.set(storageKey, callback);
		else console.error(`LocalStorageWatcher - Already watching ${storageKey}`);
	}

	public removeListener(key: string) { this.listeners.delete(key); }
}

// We need an instance to watch for changes
// It doesn't matter where the variable lives, it can be outside the Vue instance.
// As long as it's reactive, this will work.
// When migrating to vue 3, just use a ref or a library that does this for us...
const watcher = new Vue();
const storageWatcher = new StorageWatcher();

const putNewValueInStorage = (key: string) => (newValue: any) => {
	const storedValue = localStorage.getItem(key);
	const newStoredValue = JSON.stringify(newValue);
	// prevent recursion
	if (storedValue === newStoredValue) return;

	if (newValue === null) localStorage.removeItem(key);
	else localStorage.setItem(key, JSON.stringify(newValue));
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
	watcher.$watch(() => v.value, putNewValueInStorage(storageKey));
	if (watchStorage) storageWatcher.addListener<T>(storageKey, newValue => {
		v.isFromStorage = true;
		v.value = newValue;
	});

	return v;
}

export function syncPropertyWithLocalStorage<T extends object, K extends keyof T>(storageKey: string, props: T, prop: K, watchStorage = false) {
	if (localStorage.getItem(storageKey)) {
		try { props[prop] = JSON.parse(localStorage.getItem(storageKey) as string); }
		catch { console.error(`Failed to parse stored value for ${storageKey}`); }
	}

	const v = Vue.observable(props);
	watcher.$watch(() => v[prop], putNewValueInStorage(storageKey));
	if (watchStorage) storageWatcher.addListener<T[K]>(storageKey, newValue => props[prop] = newValue);
	return v;
}