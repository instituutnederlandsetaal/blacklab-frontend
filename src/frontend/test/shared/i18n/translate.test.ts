import { describe, expect, test } from 'vitest';

import { createTranslate } from '@/shared/i18n/translate';

describe('translate', () => {
	test('uses the dedicated document label for an empty within element value', () => {
		const translate = createTranslate({
			t: key => {
				return key === 'search.extended.withinDocument' ? 'Document' : key;
			},
			te: key => key === 'search.extended.withinDocument',
			locale: { value: 'en-us' },
			fallbackLocale: { value: 'en-us' },
		});

		expect(translate.$tWithinElementDisplayName({ value: '' })).toBe('Document');
		expect(translate.$tSpanDisplayName).toBe(translate.$tWithinElementDisplayName);
	});

	test('keeps an explicit label for an empty within element value', () => {
		const translate = createTranslate({
			t: key => key,
			te: () => false,
			locale: { value: 'en-us' },
			fallbackLocale: { value: 'en-us' },
		});

		expect(translate.$tWithinElementDisplayName({ value: '', label: 'Entire corpus' })).toBe('Entire corpus');
		expect(translate.$tSpanAttributeDisplay).toBe(translate.$tWithinAttributeDisplayName);
	});
});
