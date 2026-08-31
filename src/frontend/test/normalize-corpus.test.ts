import { expect, test } from 'vitest';

import type { BLIndex, BLIndexV4 } from '@/types/blacklabtypes';

import { normalizeIndexBase } from '@/shared/blacklab-helpers/normalize/normalize-corpus';

test('normalizes falsy V4/V5 summaries while preserving the V5-only docVersions property', () => {
	const v4: BLIndexV4 = {
		status: 'indexing',
		timeModified: '',
		indexProgress: undefined,
		tokenCount: Number.NaN,
		documentCount: 0,
	};
	const v5: BLIndex = {
		status: 'indexing',
		timeModified: '',
		indexProgress: undefined,
		count: {
			tokens: 0,
			documents: Number.NaN,
			docVersions: undefined,
		},
	};

	const normalizedV4 = normalizeIndexBase(v4, 'owner:v4');
	const normalizedV5 = normalizeIndexBase(v5, 'owner:v5');

	expect(normalizedV4).toMatchObject({ tokenCount: 0, documentCount: 0, indexProgress: null });
	expect(normalizedV5).toMatchObject({ tokenCount: 0, documentCount: 0, indexProgress: null });
	expect(Object.hasOwn(normalizedV4, 'docVersions')).toBe(false);
	expect(Object.hasOwn(normalizedV5, 'docVersions')).toBe(true);
	expect(normalizedV5.docVersions).toBeUndefined();
});
