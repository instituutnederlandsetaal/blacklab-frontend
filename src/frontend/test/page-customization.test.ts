// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

import { useCustomJs } from '@/interop/page-customization';
import type { CFCustomJsEntry } from '@/types/apptypes';

describe('page customization', () => {
	beforeEach(() => {
		document.body.replaceChildren();
	});

	test('inserts custom scripts as ordered by default', async () => {
		const entries = ref<CFCustomJsEntry[]>([
			{ index: 0, attributes: { src: '/first.js' } },
			{ index: 1, attributes: { src: '/second.js' } },
		]);
		const scope = effectScope();
		const customJs = scope.run(() => useCustomJs(entries, { immediate: false }))!;

		try {
			customJs.enable();
			await nextTick();

			const scripts = Array.from(document.body.querySelectorAll<HTMLScriptElement>('script[data-page-customization-js]'));

			expect(scripts.map(script => script.getAttribute('src'))).toEqual(['/first.js', '/second.js']);
			scripts.forEach(script => expect(script.async).toBe(false));
		} finally {
			scope.stop();
		}
	});

	test('respects explicitly async custom scripts', async () => {
		const entries = ref<CFCustomJsEntry[]>([{ index: 0, attributes: { src: '/async.js', async: true } }]);
		const scope = effectScope();
		const customJs = scope.run(() => useCustomJs(entries, { immediate: false }))!;

		try {
			customJs.enable();
			await nextTick();

			const script = document.body.querySelector<HTMLScriptElement>('script[data-page-customization-js]');

			expect(script).toBeInstanceOf(HTMLScriptElement);
			expect(script?.getAttribute('async')).toBe('true');
		} finally {
			scope.stop();
		}
	});
});
