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

		pageBootstrap.changePage(articlePage);
		expect(pageBootstrap.settled.value).toBe(false);

		pageBootstrap.markSettled();
		expect(pageBootstrap.settled.value).toBe(true);

		pageBootstrap.changePage(articlePage);
		expect(pageBootstrap.settled.value).toBe(true);
	});

	test('resets an after-bootstrap page when the page changes', () => {
		const pageBootstrap = createPageBootstrapContext();
		const articlePage = afterBootstrapPage('article');
		const aboutPage = afterBootstrapPage('about');

		pageBootstrap.changePage(articlePage);
		pageBootstrap.markSettled();

		pageBootstrap.changePage(aboutPage);
		expect(pageBootstrap.settled.value).toBe(false);
	});

	test('settles immediate pages as soon as they become current', () => {
		const pageBootstrap = createPageBootstrapContext();

		pageBootstrap.changePage({ name: 'search', customScriptTiming: 'immediate' });

		expect(pageBootstrap.settled.value).toBe(true);
	});

	test('settles pages with absent custom script timing as soon as they become current', () => {
		const pageBootstrap = createPageBootstrapContext();

		pageBootstrap.changePage({ name: 'search' });

		expect(pageBootstrap.settled.value).toBe(true);
	});

	test('settles transitions to the same page name with different or absent timing', () => {
		const pageBootstrap = createPageBootstrapContext();

		pageBootstrap.changePage(afterBootstrapPage('article'));
		expect(pageBootstrap.settled.value).toBe(false);

		pageBootstrap.changePage({ name: 'article', customScriptTiming: 'immediate' });
		expect(pageBootstrap.settled.value).toBe(true);

		pageBootstrap.changePage(afterBootstrapPage('article'));
		expect(pageBootstrap.settled.value).toBe(true);

		pageBootstrap.changePage({ name: 'article' });
		expect(pageBootstrap.settled.value).toBe(true);
	});
});
