// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';

import { localStorageSynced } from '@/shared/utils/localstore';

function createStorage() {
	const items = new Map<string, string>();
	const setItem = vi.fn((key: string, value: string) => {
		items.set(key, value);
	});
	const storage = {
		get length() {
			return items.size;
		},
		clear: vi.fn(() => items.clear()),
		getItem: vi.fn((key: string) => items.get(key) ?? null),
		key: vi.fn((index: number) => [...items.keys()][index] ?? null),
		removeItem: vi.fn((key: string) => items.delete(key)),
		setItem,
	} satisfies Storage;
	return { setItem, storage };
}

describe('localStorageSynced', () => {
	let setStoredItem: ReturnType<typeof createStorage>['setItem'];

	beforeEach(() => {
		const local = createStorage();
		setStoredItem = local.setItem;
		vi.stubGlobal('localStorage', local.storage);
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-31T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	test('reads legacy values, rejects expired envelopes, and refreshes TTL after assignment', async () => {
		localStorage.setItem('legacy', JSON.stringify('stored'));
		localStorage.setItem('current', JSON.stringify({ value: 'current', expiry: Date.now() + 1 }));
		localStorage.setItem('expired', JSON.stringify({ value: 'stale', expiry: Date.now() - 1 }));

		expect(localStorageSynced('legacy', 'default').value).toBe('stored');
		expect(localStorageSynced('current', 'default').value).toBe('current');
		expect(localStorageSynced('expired', 'default').value).toBe('default');

		const synced = localStorageSynced('updated', 'initial', false, 60);
		synced.value = 'changed';
		expect(localStorage.getItem('updated')).toBeNull();
		await nextTick();
		expect(JSON.parse(localStorage.getItem('updated')!)).toEqual({ value: 'changed', expiry: Date.now() + 60_000 });
	});

	test('applies a cross-tab envelope without echoing it', async () => {
		const synced = localStorageSynced('locale', 'en', true, 60);
		const envelope = JSON.stringify({ value: 'nl', expiry: Date.now() - 1 });
		localStorage.setItem('locale', envelope);
		setStoredItem.mockClear();

		window.dispatchEvent(new StorageEvent('storage', { key: 'locale', newValue: envelope }));
		await nextTick();

		expect(synced.value).toBe('nl');
		expect(setStoredItem).not.toHaveBeenCalled();

		window.dispatchEvent(new StorageEvent('storage', { key: 'locale', newValue: JSON.stringify('de') }));
		await nextTick();
		expect(synced.value).toBe('de');
		expect(setStoredItem).not.toHaveBeenCalled();
	});
});
