// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type {} from 'vitest/jsdom';
import { nextTick } from 'vue';

import { localStorageSynced } from '@/shared/utils/localstore';

describe('localStorageSynced', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', jsdom.window.localStorage);
		localStorage.clear();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-31T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		localStorage.clear();
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
		const setStoredItem = vi.spyOn(Storage.prototype, 'setItem');

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
