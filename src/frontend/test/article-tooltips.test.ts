// @vitest-environment jsdom

import { expect, test, vi } from 'vitest';

import createTooltips from '@/pages/article/expandable-tooltips';

test('handles hover and click on the same word and discards pending events on teardown', ({ onTestFinished }) => {
	vi.useFakeTimers();
	const word = document.createElement('span');
	word.title = 'Word';
	document.body.append(word);
	const stop = createTooltips({ mode: 'title', tooltippableSelector: '[title]', excludeAttributes: [] });
	onTestFinished(() => {
		stop();
		word.remove();
		vi.useRealTimers();
	});
	const hover = () => word.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

	hover();
	expect(word.classList.contains('tooltip-open')).toBe(true);
	hover();
	vi.advanceTimersByTime(25);
	expect(word.classList.contains('tooltip-open')).toBe(true);
	word.click();
	expect(word.classList.contains('tooltip-open')).toBe(true);
	vi.advanceTimersByTime(25);
	expect(word.classList.contains('tooltip-open')).toBe(false);

	hover();
	stop();
	vi.advanceTimersByTime(25);
	expect(word.classList.contains('tooltip-open')).toBe(false);
});
