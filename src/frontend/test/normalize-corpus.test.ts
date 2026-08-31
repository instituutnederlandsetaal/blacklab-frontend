import { expect, test } from 'vitest';

import type { BLIndex, BLIndexV4 } from '@/types/blacklabtypes';

import { normalizeIndexBase } from '@/shared/blacklab-helpers/normalize/normalize-corpus';

test('uses version-specific counts while preserving the V5-only docVersions property', () => {
	const v4: BLIndexV4 = {
		status: 'indexing',
		timeModified: '',
		indexProgress: undefined,
		tokenCount: 41,
		documentCount: 17,
	};
	const v5: BLIndex = {
		status: 'indexing',
		timeModified: '',
		indexProgress: undefined,
		count: {
			tokens: 83,
			documents: 29,
			docVersions: undefined,
		},
	};

	const normalizedV4 = normalizeIndexBase(v4, 'owner:v4');
	const normalizedV5 = normalizeIndexBase(v5, 'owner:v5');

	expect(normalizedV4).toMatchObject({ tokenCount: 41, documentCount: 17, indexProgress: null });
	expect(normalizedV5).toMatchObject({ tokenCount: 83, documentCount: 29, indexProgress: null });
	expect(Object.hasOwn(normalizedV4, 'docVersions')).toBe(false);
	expect(Object.hasOwn(normalizedV5, 'docVersions')).toBe(true);
	expect(normalizedV5.docVersions).toBeUndefined();
});
