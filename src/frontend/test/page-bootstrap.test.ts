import { describe, expect, test } from 'vitest';

import { createPageBootstrapContext } from '@/navigation/page-bootstrap';
import type { PageMeta } from '@/navigation/page-context';

function afterBootstrapPage(name: string): PageMeta {
	return {
		name,
		customScriptTiming: 'after-page-bootstrap',
	};
}

describe('page bootstrap state', () => {
	test('content readiness does not enable page scripts', () => {
		const pageBootstrap = createPageBootstrapContext();
		pageBootstrap.changePage(afterBootstrapPage('search'), false);

		pageBootstrap.markContentReady();

		expect(pageBootstrap.contentReady.value).toBe(true);
		expect(pageBootstrap.scriptsReady.value).toBe(false);
	});

	test('keeps scripts ready across navigations to the same page instance', () => {
		const pageBootstrap = createPageBootstrapContext();
		const articlePage = afterBootstrapPage('article');

		pageBootstrap.changePage(articlePage, false);
		expect(pageBootstrap.scriptsReady.value).toBe(false);
		expect(pageBootstrap.contentReady.value).toBe(false);

		pageBootstrap.markScriptsReady();
		expect(pageBootstrap.scriptsReady.value).toBe(true);
		expect(pageBootstrap.contentReady.value).toBe(true);

		pageBootstrap.changePage(articlePage, true);
		expect(pageBootstrap.scriptsReady.value).toBe(true);
		expect(pageBootstrap.contentReady.value).toBe(true);
	});

	test('keeps scripts waiting across same-instance navigation before bootstrap', () => {
		const pageBootstrap = createPageBootstrapContext();
		const articlePage = afterBootstrapPage('article');

		pageBootstrap.changePage(articlePage, false);
		pageBootstrap.changePage(articlePage, true);

		expect(pageBootstrap.scriptsReady.value).toBe(false);
	});

	test('resets an after-bootstrap page when the page changes', () => {
		const pageBootstrap = createPageBootstrapContext();
		const articlePage = afterBootstrapPage('article');
		const aboutPage = afterBootstrapPage('about');

		pageBootstrap.changePage(articlePage, false);
		pageBootstrap.markScriptsReady();

		pageBootstrap.changePage(aboutPage, false);
		expect(pageBootstrap.scriptsReady.value).toBe(false);
	});

	test('resets the same semantic page for a different routed page instance', () => {
		const pageBootstrap = createPageBootstrapContext();
		const aboutPage = afterBootstrapPage('about');

		pageBootstrap.changePage(aboutPage, false);
		pageBootstrap.markScriptsReady();
		pageBootstrap.changePage(aboutPage, false);

		expect(pageBootstrap.scriptsReady.value).toBe(false);
	});

	test('enables scripts for immediate pages as soon as they become current', () => {
		const pageBootstrap = createPageBootstrapContext();

		pageBootstrap.changePage({ name: 'search', customScriptTiming: 'immediate' }, false);

		expect(pageBootstrap.scriptsReady.value).toBe(true);
		expect(pageBootstrap.contentReady.value).toBe(false);
	});

	test('enables scripts when no custom script timing is specified', () => {
		const pageBootstrap = createPageBootstrapContext();

		pageBootstrap.changePage({ name: 'search' }, false);

		expect(pageBootstrap.scriptsReady.value).toBe(true);
	});

	test('enables scripts across same-page transitions with different timing', () => {
		const pageBootstrap = createPageBootstrapContext();

		pageBootstrap.changePage(afterBootstrapPage('article'), false);
		expect(pageBootstrap.scriptsReady.value).toBe(false);

		pageBootstrap.changePage({ name: 'article', customScriptTiming: 'immediate' }, true);
		expect(pageBootstrap.scriptsReady.value).toBe(true);

		pageBootstrap.changePage(afterBootstrapPage('article'), true);
		expect(pageBootstrap.scriptsReady.value).toBe(true);

		pageBootstrap.changePage({ name: 'article' }, true);
		expect(pageBootstrap.scriptsReady.value).toBe(true);
	});
});
