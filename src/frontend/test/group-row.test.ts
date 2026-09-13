// @vitest-environment jsdom

import { enableAutoUnmount, shallowMount } from '@vue/test-utils';
import { afterEach, describe, expect, test } from 'vitest';

import type { GroupRowData } from '@/pages/search/results/table/table-layout';

import GroupRow from '@/pages/search/results/table/GroupRow.vue';

enableAutoUnmount(afterEach);

describe('association score cells', () => {
	test.each([0.0000123456, 0.00000000098765, -0.0000123456, 0, 8.123456])('keeps a score of %s readable and exposes the full value', score => {
		const wrapper = render(score);
		const cell = wrapper.get('td');
		expect(cell.text()).toBe(score.toLocaleString(undefined, { maximumSignificantDigits: 4 }));
		expect(cell.text() === '0').toBe(score === 0);
		expect(cell.attributes('title')).toBe(String(score));
	});

	test.each([undefined, NaN, Infinity, -Infinity])('displays an unavailable score %s without a misleading number or bar', score => {
		const wrapper = render(score);
		expect(wrapper.get('td').text()).toBe('—');
		expect(wrapper.get('td').attributes('title')).toBeUndefined();
		expect(wrapper.get('.progress-bar').attributes('style')).toContain('min-width: 0');
	});
});

function render(score: number | undefined) {
	return shallowMount(GroupRow, {
		props: {
			type: 'hits',
			info: {} as never,
			row: { score } as GroupRowData,
			maxima: { score: 10 } as never,
			cols: {
				hitColumns: [],
				docColumns: [],
				groupModeOptions: [],
				groupColumns: [{ field: 'group', key: 'association', label: 'Association', labelField: 'score', barField: 'score' }],
			},
		},
	});
}
