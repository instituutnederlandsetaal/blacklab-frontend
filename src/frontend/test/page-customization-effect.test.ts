// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { effectScope, nextTick, reactive, ref } from 'vue';

import { startCustomizationInterop } from '@/features/corpus/effects/page-customization.effect';
import { installIndexIdGlobal } from '@/interop/window-globals';
import type { CFPageConfig } from '@/types/apptypes';

const mocks = vi.hoisted(() => ({
	context: undefined as unknown,
	indexId: undefined as unknown,
	pageBootstrap: undefined as unknown as { page: ReturnType<typeof ref<{ name: string }>>; settled: ReturnType<typeof ref<boolean>> },
}));

vi.mock('@/app/state/useCorpusContext', () => ({ useCorpusContextLoader: () => mocks.context }));
vi.mock('@/navigation/page-bootstrap', () => ({ usePageBootstrap: () => mocks.pageBootstrap }));
vi.mock('@/navigation/router', () => ({ useCorpusId: () => mocks.indexId }));
vi.mock('@/interop/window-globals', () => ({ installIndexIdGlobal: vi.fn() }));
vi.mock('@vueuse/core', () => ({ useFavicon: vi.fn(), useTitle: vi.fn() }));

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
	beforeEach(() => {
		vi.clearAllMocks();
		document.body.replaceChildren();
		document.head.querySelectorAll('[data-page-customization-css]').forEach(element => element.remove());
	});

	test('waits through a route transition and inserts the latest scripts once after settlement', async () => {
		const contextValue = ref({ config: config('initial') });
		mocks.context = reactive({
			get value() {
				return contextValue.value;
			},
			isLoaded: () => true,
		});
		mocks.indexId = ref('owner:corpus');
		mocks.pageBootstrap = { page: ref({ name: 'search' }), settled: ref(true) };
		const scope = effectScope();
		const appendChild = vi.spyOn(document.body, 'appendChild');
		scope.run(startCustomizationInterop);

		try {
			expect(vi.mocked(installIndexIdGlobal).mock.invocationCallOrder[0]).toBeLessThan(appendChild.mock.invocationCallOrder[0]);
			expect(Array.from(document.body.querySelectorAll<HTMLScriptElement>('script[data-page-customization-js]'), script => script.getAttribute('src'))).toEqual([
				'/search-initial.js',
				'/global-initial.js',
			]);

			mocks.pageBootstrap.settled.value = false;
			mocks.pageBootstrap.page.value = { name: 'article' };
			contextValue.value = { config: config('latest') };
			await nextTick();
			expect(document.body.querySelectorAll('script[data-page-customization-js]')).toHaveLength(0);
			expect(document.head.querySelector('link[data-page-customization-css]')?.getAttribute('href')).toBe('/style-latest.css');

			mocks.pageBootstrap.settled.value = true;
			await nextTick();

			expect(appendChild).toHaveBeenCalledTimes(4);
			const scripts = Array.from(document.body.querySelectorAll<HTMLScriptElement>('script[data-page-customization-js]'));
			expect(scripts.map(script => script.getAttribute('src'))).toEqual(['/article-latest.js', '/global-latest.js']);
			scripts.forEach(script => expect(script.async).toBe(false));
			expect(scripts[1].getAttribute('defer')).toBe('true');
		} finally {
			appendChild.mockRestore();
			scope.stop();
		}
	});
});
