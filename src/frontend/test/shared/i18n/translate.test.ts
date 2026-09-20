import { describe, expect, test } from 'vitest';

import { createTranslate } from '@/shared/i18n/translate';

const messages: Record<string, string> = {
	'results.shared.spanAttribute': 'Span attribute',
	'search.extended.withinDocument': 'Document',
	'index.spans.p': 'Paragraph',
	'index.spanAttributes.p.type': 'Paragraph type',
};

describe('translate', () => {
	test('uses the dedicated document label for an empty within element value', () => {
		const translate = createTranslate({
			t: key => messages[key] ?? key,
			te: key => key in messages,
			locale: { value: 'en-us' },
			fallbackLocale: { value: 'en-us' },
		});

		expect(translate.$tWithinElementDisplayName({ value: '' })).toBe('Document');
		expect(translate.$tSpanDisplayName({ value: '' })).toBe('Document');
		expect(translate.$tSpanDisplayName({ value: 'p' })).toBe('Paragraph');
	});

	test('keeps an explicit label for an empty within element value', () => {
		const translate = createTranslate({
			t: key => messages[key] ?? key,
			te: key => key in messages,
			locale: { value: 'en-us' },
			fallbackLocale: { value: 'en-us' },
		});

		expect(translate.$tWithinElementDisplayName({ value: '', label: 'Entire corpus' })).toBe('Entire corpus');
		expect(translate.$tSpanDisplayName({ value: '', label: 'Entire corpus' })).toBe('Entire corpus');
		expect(translate.$tSpanAttributeDisplay('p', 'type')).toBe('Paragraph type');
		expect(translate.$tSpanAttributeDisplay('p', 'missing')).toBe('Span attribute');
	});
});
