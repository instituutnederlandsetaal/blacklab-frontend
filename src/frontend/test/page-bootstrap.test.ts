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
	test('keeps an after-bootstrap page settled across navigations to the same page', () => {
		const pageBootstrap = createPageBootstrapContext();
		const articlePage = afterBootstrapPage('article');

		pageBootstrap.changePage(articlePage, false);
		expect(pageBootstrap.settled.value).toBe(false);

		pageBootstrap.markSettled();
		expect(pageBootstrap.settled.value).toBe(true);

		pageBootstrap.changePage(articlePage, true);
		expect(pageBootstrap.settled.value).toBe(true);
	});

	test('keeps an unsettled after-bootstrap page unsettled across same-instance navigation', () => {
		const pageBootstrap = createPageBootstrapContext();
		const articlePage = afterBootstrapPage('article');

		pageBootstrap.changePage(articlePage, false);
		pageBootstrap.changePage(articlePage, true);

		expect(pageBootstrap.settled.value).toBe(false);
	});

	test('resets an after-bootstrap page when the page changes', () => {
		const pageBootstrap = createPageBootstrapContext();
		const articlePage = afterBootstrapPage('article');
		const aboutPage = afterBootstrapPage('about');

		pageBootstrap.changePage(articlePage, false);
		pageBootstrap.markSettled();

		pageBootstrap.changePage(aboutPage, false);
		expect(pageBootstrap.settled.value).toBe(false);
	});

	test('resets the same semantic page for a different routed page instance', () => {
		const pageBootstrap = createPageBootstrapContext();
		const aboutPage = afterBootstrapPage('about');

		pageBootstrap.changePage(aboutPage, false);
		pageBootstrap.markSettled();
		pageBootstrap.changePage(aboutPage, false);

		expect(pageBootstrap.settled.value).toBe(false);
	});

	test('settles immediate pages as soon as they become current', () => {
		const pageBootstrap = createPageBootstrapContext();

		pageBootstrap.changePage({ name: 'search', customScriptTiming: 'immediate' }, false);

		expect(pageBootstrap.settled.value).toBe(true);
	});

	test('settles pages with absent custom script timing as soon as they become current', () => {
		const pageBootstrap = createPageBootstrapContext();

		pageBootstrap.changePage({ name: 'search' }, false);

		expect(pageBootstrap.settled.value).toBe(true);
	});

	test('settles transitions to the same page name with different or absent timing', () => {
		const pageBootstrap = createPageBootstrapContext();

		pageBootstrap.changePage(afterBootstrapPage('article'), false);
		expect(pageBootstrap.settled.value).toBe(false);

		pageBootstrap.changePage({ name: 'article', customScriptTiming: 'immediate' }, true);
		expect(pageBootstrap.settled.value).toBe(true);

		pageBootstrap.changePage(afterBootstrapPage('article'), true);
		expect(pageBootstrap.settled.value).toBe(true);

		pageBootstrap.changePage({ name: 'article' }, true);
		expect(pageBootstrap.settled.value).toBe(true);
	});
});
