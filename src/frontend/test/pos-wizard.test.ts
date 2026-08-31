// @vitest-environment jsdom

import { shallowMount } from '@vue/test-utils';
import { afterEach, expect, test, vi } from 'vitest';

import type { NormalizedIndex } from '@/types/apptypes';

import POS from '@/pages/config/POS.vue';

const index = {
	id: 'owner:corpus',
	annotatedFields: {
		contents: {
			annotations: {
				pos: { id: 'pos' },
			},
		},
	},
} as unknown as NormalizedIndex;

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

test('discards corrupt persisted wizard state and restores the current corpus', () => {
	const key = `cf/config/${index.id}/stepstate`;
	const storage = { getItem: vi.fn(() => '{broken'), removeItem: vi.fn(), setItem: vi.fn() };
	vi.stubGlobal('localStorage', storage);

	const wrapper = shallowMount(POS, { props: { index } });

	expect(storage.removeItem).toHaveBeenCalledWith(key);
	expect(wrapper.vm.stepstate).toMatchObject({ version: 2, index, annotations: [{ id: 'pos' }] });
});
