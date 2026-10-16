// @vitest-environment jsdom

import { createMockCorpusContext } from '@test/mocks/corpus';
import { describe, expect, test, vi } from 'vitest';
import { computed, createApp, effectScope, nextTick, ref } from 'vue';

import { startCustomizationInterop } from '@/features/corpus/effects/page-customization.effect';
import { createPageBootstrapContext } from '@/navigation/page-bootstrap';
import { provideCorpusId } from '@/navigation/page-context';
import type { CFPageConfig } from '@/types/apptypes';

const config = (src: string): CFPageConfig =>
	({
		analytics: { google: null, plausible: null },
		bannerMessage: null,
		customCss: { '': [{ index: 0, attributes: { href: `/style-${src}.css`, rel: 'stylesheet' } }] },
		customJs: {
			'': [{ index: 2, attributes: { src: `/global-${src}.js`, defer: true } }],
			article: [{ index: 1, attributes: { src: `/article-${src}.js` } }],
			search: [{ index: 1, attributes: { src: `/search-${src}.js` } }],
		},
		displayName: null,
		faviconDir: '',
		footerMessage: null,
		navbarLinks: [],
		pageSize: null,
	}) satisfies CFPageConfig;

describe('page customization effect', () => {
	test('waits through a route transition and inserts the latest scripts once after settlement', async () => {
		const savedIndexId = Object.getOwnPropertyDescriptor(window, 'INDEX_ID');
		const savedTitle = document.title;
		const hadTitle = document.head.querySelector('title') !== null;
		const favicons = new Map(Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel*="icon"]'), link => [link, link.getAttribute('href')]));
		const contextValue = ref({ config: config('initial') });
		const context = createMockCorpusContext({ config: computed(() => contextValue.value.config) });
		const pageBootstrap = createPageBootstrapContext();
		pageBootstrap.changePage({ name: 'search', customScriptTiming: 'after-page-bootstrap' }, false);
		pageBootstrap.markScriptsReady();
		const app = createApp({}).use(context).use(pageBootstrap);
		provideCorpusId(app, ref('owner:corpus'));
		const scope = effectScope();
		const nativeAppendChild = document.body.appendChild.bind(document.body);
		const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
			expect((window as Window & { INDEX_ID?: string }).INDEX_ID).toBe('owner:corpus');
			return nativeAppendChild(node);
		});

		try {
			(window as Window & { INDEX_ID?: string }).INDEX_ID = 'previous-corpus';
			app.runWithContext(() => scope.run(startCustomizationInterop));
			expect(Array.from(document.body.querySelectorAll<HTMLScriptElement>('script[data-page-customization-js]'), script => script.getAttribute('src'))).toEqual([
				'/search-initial.js',
				'/global-initial.js',
			]);
			expect(pageBootstrap.customizationsReady.value).toBe(false);
			const initialScripts = document.body.querySelectorAll<HTMLScriptElement>('script[data-page-customization-js]');
			initialScripts[0].dispatchEvent(new Event('load'));
			await nextTick();
			expect(pageBootstrap.customizationsReady.value).toBe(false);
			initialScripts[1].dispatchEvent(new Event('error'));
			await nextTick();
			expect(pageBootstrap.customizationsReady.value).toBe(true);

			pageBootstrap.changePage({ name: 'article', customScriptTiming: 'after-page-bootstrap' }, false);
			contextValue.value = { config: config('latest') };
			await nextTick();
			expect(pageBootstrap.scriptsReady.value).toBe(false);
			expect(pageBootstrap.customizationsReady.value).toBe(false);
			expect(document.body.querySelectorAll('script[data-page-customization-js]')).toHaveLength(0);
			expect(document.head.querySelector('link[data-page-customization-css]')?.getAttribute('href')).toBe('/style-latest.css');

			pageBootstrap.markScriptsReady();
			await nextTick();

			expect(pageBootstrap.scriptsReady.value).toBe(true);
			expect(appendChild).toHaveBeenCalledTimes(4);
			const scripts = Array.from(document.body.querySelectorAll<HTMLScriptElement>('script[data-page-customization-js]'));
			expect(scripts.map(script => script.getAttribute('src'))).toEqual(['/article-latest.js', '/global-latest.js']);
			expect(scripts[1].getAttribute('defer')).toBe('true');
			expect(pageBootstrap.customizationsReady.value).toBe(false);
			scripts.forEach(script => script.dispatchEvent(new Event('load')));
			await nextTick();
			expect(pageBootstrap.customizationsReady.value).toBe(true);
		} finally {
			appendChild.mockRestore();
			scope.stop();
			document.title = savedTitle;
			if (!hadTitle) document.head.querySelector('title')?.remove();
			document.head.querySelectorAll<HTMLLinkElement>('link[rel*="icon"]').forEach(link => {
				if (!favicons.has(link)) link.remove();
				else {
					const href = favicons.get(link);
					if (href == null) link.removeAttribute('href');
					else link.setAttribute('href', href);
				}
			});
			if (savedIndexId) Object.defineProperty(window, 'INDEX_ID', savedIndexId);
			else delete (window as Window & { INDEX_ID?: string }).INDEX_ID;
		}
	});
});
