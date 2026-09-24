// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import * as UIStore from '@/app/state/ui-state';

it('keeps the removed split-batch customization callable without changing UI state', () => {
	const before = { ...UIStore.getState().search.extended };
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		UIStore.actions.search.extended.splitBatch.enable(false);
		expect(UIStore.getState().search.extended).toEqual(before);
		expect(warn).toHaveBeenCalledWith('Split-batch search has been removed.');
	} finally {
		warn.mockRestore();
	}
});
