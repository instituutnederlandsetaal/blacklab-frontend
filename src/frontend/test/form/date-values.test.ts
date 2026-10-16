import { expect, test } from 'vitest';

import { DateUtils } from '@/shared/utils/date-utils';

test('date values fill partial bounds and reject invalid dates', () => {
	expect(DateUtils.dateValueToString(null, 'start')).toBe('');
	expect(DateUtils.dateValueToString({ y: 'bad', m: '', d: '' }, 'start')).toBe('');
	expect(DateUtils.dateValueToString({ y: '24', m: '', d: '' }, 'start')).toBe('00240101');
	expect(DateUtils.dateValueToString({ y: '2024', m: '02', d: '' }, 'end')).toBe('20240229');
	expect(DateUtils.dateValueToDisplayString(undefined)).toBe('');
	expect(DateUtils.normalizeBoundaryDate('not-a-date')).toBeNull();
	expect(DateUtils.normalizeBoundaryDate({ y: '1', m: '2', d: '3' })).toEqual({ y: '1', m: '2', d: '3' });
});
