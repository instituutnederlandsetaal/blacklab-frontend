// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

import { customCssChangedEvent, useCustomCss, useCustomJs } from '@/interop/page-customization';
import type { CFCustomCssEntry, CFCustomJsEntry } from '@/types/apptypes';

describe('page customization', () => {
	beforeEach(() => {
		document.body.replaceChildren();
		document.head.querySelectorAll('[data-page-customization-css]').forEach(element => element.remove());
	});

	test('notifies once after all custom stylesheets settle', async () => {
		const entries = ref<CFCustomCssEntry[]>([]);
		const listener = vi.fn();
		const scope = effectScope();
		scope.run(() => useCustomCss(entries));
		window.addEventListener(customCssChangedEvent, listener);

		try {
			entries.value = [
				{ index: 0, attributes: { href: '/first.css', ref: 'stylesheet' } },
				{ index: 1, attributes: { href: '/second.css', ref: 'stylesheet' } },
			];
			await nextTick();

			const links = document.head.querySelectorAll<HTMLLinkElement>('link[data-page-customization-css]');
			expect(links).toHaveLength(2);

			links[0].dispatchEvent(new Event('load'));
			expect(listener).not.toHaveBeenCalled();

			links[1].dispatchEvent(new Event('load'));
			expect(listener).toHaveBeenCalledOnce();
		} finally {
			window.removeEventListener(customCssChangedEvent, listener);
			scope.stop();
		}
	});

	test('ignores stale load events from replaced custom stylesheets', async () => {
		const entries = ref<CFCustomCssEntry[]>([]);
		const listener = vi.fn();
		const scope = effectScope();
		scope.run(() => useCustomCss(entries));
		window.addEventListener(customCssChangedEvent, listener);

		try {
			entries.value = [{ index: 0, attributes: { href: '/old.css', ref: 'stylesheet' } }];
			await nextTick();
			const oldLink = document.head.querySelector<HTMLLinkElement>('link[data-page-customization-css]')!;

			entries.value = [{ index: 0, attributes: { href: '/new.css', ref: 'stylesheet' } }];
			await nextTick();
			const newLink = document.head.querySelector<HTMLLinkElement>('link[data-page-customization-css]')!;
			listener.mockClear();

			oldLink.dispatchEvent(new Event('load'));
			expect(listener).not.toHaveBeenCalled();

			newLink.dispatchEvent(new Event('load'));
			expect(listener).toHaveBeenCalledOnce();
		} finally {
			window.removeEventListener(customCssChangedEvent, listener);
			scope.stop();
		}
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
