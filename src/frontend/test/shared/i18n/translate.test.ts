import { describe, expect, test } from 'vitest';

import { createTranslate } from '@/shared/i18n/translate';

describe('translate', () => {
	test('uses the dedicated document label for an empty within span value', () => {
		const translatedKeys: string[] = [];
		const translate = createTranslate({
			t: key => {
				translatedKeys.push(key);
				return key === 'search.extended.withinDocument' ? 'Document' : key;
			},
			te: key => key === 'search.extended.withinDocument',
			locale: { value: 'en-us' },
			fallbackLocale: { value: 'en-us' },
		});

		expect(translate.$tSpanDisplayName({ value: '' })).toBe('Document');
		expect(translatedKeys).toEqual(['search.extended.withinDocument']);
	});

	test('keeps an explicit label for an empty within span value', () => {
		const translate = createTranslate({
			t: key => key,
			te: () => false,
			locale: { value: 'en-us' },
			fallbackLocale: { value: 'en-us' },
		});

		expect(translate.$tSpanDisplayName({ value: '', label: 'Entire corpus' })).toBe('Entire corpus');
	});
});
