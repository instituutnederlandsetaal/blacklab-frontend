import { describe, expect, it } from 'vitest';

import { stableStringify } from '@/shared/utils/stable-stringify';

describe('stableStringify', () => {
	it('sorts object keys recursively without reordering arrays', () => {
		expect(stableStringify({ z: { b: 2, a: 1 }, a: [{ d: 4, c: 3 }] })).toBe('{"a":[{"c":3,"d":4}],"z":{"a":1,"b":2}}');
	});

	it('sorts integer-like keys lexically', () => {
		expect(stableStringify({ 2: 'two', 10: 'ten' })).toBe('{"10":"ten","2":"two"}');
	});

	it('matches JSON serialization of unsupported values', () => {
		expect(stableStringify({ omitted: undefined, values: [undefined, null] })).toBe('{"values":[null,null]}');
	});
});
