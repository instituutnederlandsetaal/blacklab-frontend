import { describe, expect, test } from 'vitest';
import { ref } from 'vue';

import { isOptGroup, optionLabel, optionText, optionTitle, type OptGroup } from '@/shared/utils/options';

describe('options', () => {
	test('resolves plain, ref, and getter-backed option text', () => {
		const locale = ref('en');
		const label = ref('Label');
		const option = {
			value: 'value',
			label,
			title: () => `${locale.value}:title`,
		};

		expect(optionLabel(option)).toBe('Label');
		expect(optionTitle(option)).toBe('en:title');
		expect(optionText(() => `${locale.value}:group`)).toBe('en:group');

		label.value = 'Etiket';
		locale.value = 'nl';
		expect(optionLabel(option)).toBe('Etiket');
		expect(optionTitle(option)).toBe('nl:title');
		expect(optionText(() => `${locale.value}:group`)).toBe('nl:group');
	});

	test('recognizes groups with deferred or absent labels', () => {
		const deferred: OptGroup = { label: () => 'Group', options: ['value'] };
		const unlabeled: OptGroup = { options: ['value'] };

		expect(isOptGroup(deferred)).toBe(true);
		expect(isOptGroup(unlabeled)).toBe(true);
	});
});
