import { describe, expect, test } from 'vitest';

import type { NormalizedAnnotatedField } from '@/types/apptypes';
import type { BLDocInfo } from '@/types/blacklabtypes';

import { getDocumentLength, resolveAnnotatedField } from '@/shared/blacklab-helpers/corpus';

const corpus = {
	mainAnnotatedField: 'contents__nl_1939',
	allAnnotatedFieldsMap: Object.fromEntries(['contents__de_1460', 'contents__nl_1939', 'contents__en_1611', 'contents__missing'].map(id => [id, { id } as NormalizedAnnotatedField])),
};

describe('resolveAnnotatedField', () => {
	test('resolves the corpus default, complete names, and existing short parallel versions', () => {
		expect(resolveAnnotatedField(corpus)?.id).toBe('contents__nl_1939');
		expect(resolveAnnotatedField(corpus, 'contents__en_1611')?.id).toBe('contents__en_1611');
		expect(resolveAnnotatedField(corpus, 'en_1611')?.id).toBe('contents__en_1611');
		expect(resolveAnnotatedField(corpus, 'unknown')).toBeUndefined();
		const ambiguous = { ...corpus, allAnnotatedFieldsMap: { ...corpus.allAnnotatedFieldsMap, notes__en_1611: { id: 'notes__en_1611' } as NormalizedAnnotatedField } };
		expect(resolveAnnotatedField(ambiguous, 'en_1611')).toBeUndefined();
	});
});

describe('getDocumentLength', () => {
	test('reads the selected version while distinguishing empty and unavailable versions', () => {
		// Counts and ordering from the BlackLab 5 edges / 1Chr document response.
		const docInfo: BLDocInfo = {
			metadata: {},
			mayView: true,
			tokenCounts: [
				{ fieldName: 'contents__de_1460', tokens: 0 },
				{ fieldName: 'contents__en_1611', tokens: 21448 },
				{ fieldName: 'contents__nl_1939', tokens: 18318 },
			],
		};
		expect(getDocumentLength(corpus, docInfo)).toBe(18318);
		expect(getDocumentLength(corpus, docInfo, 'contents__en_1611')).toBe(21448);
		expect(getDocumentLength(corpus, docInfo, 'contents__de_1460')).toBe(0);
		expect(getDocumentLength(corpus, docInfo, 'contents__missing')).toBeUndefined();
		expect(getDocumentLength(corpus, docInfo, 'unknown')).toBeUndefined();
	});

	test('uses a legacy unnamed count only for the main field', () => {
		const docInfo: BLDocInfo = { metadata: {}, mayView: true, tokenCounts: [{ fieldName: '', tokens: 273 }] };
		expect(getDocumentLength(corpus, docInfo)).toBe(273);
		expect(getDocumentLength(corpus, docInfo, 'contents__nl_1939')).toBe(273);
		expect(getDocumentLength(corpus, docInfo, 'contents__en_1611')).toBeUndefined();
	});
});
