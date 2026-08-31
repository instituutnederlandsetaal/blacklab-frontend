import { reactive, watch } from 'vue';

type StoredValue<T> = { value: T; expiry: number | null };

export function localStorageSynced<T>(storageKey: string, defaultValue: T, watchStorage = false, ttlSeconds?: number): { value: T } {
	const parse = (json: string | null): StoredValue<T> | null => {
		if (json == null) return null;
		try {
			const stored: unknown = JSON.parse(json);
			if (stored && typeof stored === 'object' && 'value' in stored && 'expiry' in stored && (stored.expiry === null || typeof stored.expiry === 'number')) {
				return stored as StoredValue<T>;
			}
			if ((stored === null || typeof stored !== 'object') && typeof stored === typeof defaultValue) return { value: stored as T, expiry: null };
		} catch {
			console.warn(`Failed to parse value for ${storageKey}`);
		}
		return null;
	};

	const stored = parse(typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey));
	const value = reactive({ value: !stored || (stored.expiry !== null && stored.expiry < Date.now()) ? defaultValue : stored.value }) as { value: T };
	let serializedValue = JSON.stringify(value.value);

	watch(
		() => value.value,
		newValue => {
			const serialized = JSON.stringify(newValue);
			if (serialized === serializedValue) return;
			serializedValue = serialized;
			if (typeof localStorage === 'undefined') return;

			const envelope = JSON.stringify({ value: newValue, expiry: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
			if (localStorage.getItem(storageKey) !== envelope) localStorage.setItem(storageKey, envelope);
		},
	);

	if (watchStorage && typeof window !== 'undefined') {
		window.addEventListener('storage', event => {
			if (event.key !== storageKey || event.newValue == null) return;
			const stored = parse(event.newValue);
			if (!stored) return;
			serializedValue = JSON.stringify(stored.value);
			value.value = stored.value;
		});
	}

	return value;
}
