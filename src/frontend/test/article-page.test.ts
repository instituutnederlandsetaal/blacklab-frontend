// @vitest-environment jsdom

import en from '@assets/locales/en-us.json';
import { enableAutoUnmount, shallowMount } from '@vue/test-utils';
import type * as VueUse from '@vueuse/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref } from 'vue';

import * as ArticleStore from '@/features/article/model/article-state';

import { Loadable } from '@/shared/utils/loadable/loadable-core';

import ArticlePage from '@/pages/article/ArticlePage.vue';

enableAutoUnmount(afterEach);

const mock = vi.hoisted(() => ({
	articleRoute: undefined as unknown,
	corpus: undefined as unknown,
	streams: undefined as unknown,
}));

vi.mock('@vueuse/core', async importOriginal => ({
	...(await importOriginal<typeof VueUse>()),
	useDraggable: () => ({ style: ref({}), x: ref(0), y: ref(0) }),
	useLocalStorage: (_key: string, initialValue: unknown) => ref(initialValue),
	useWindowSize: () => ({ width: ref(1024), height: ref(768) }),
}));
vi.mock('@/app/state/useCorpusContext', () => ({
	useCfPageConfig: () => ref({ pageSize: null }),
	useCorpus: () => ref(mock.corpus),
}));
vi.mock('@/customization-api/internal/internal-api', () => ({
	useCustomizations: () => ({ resultDetailedMetadataIds: () => [] }),
}));
vi.mock('@/modules/expandable-tooltips', () => ({ default: vi.fn(() => vi.fn()) }));
vi.mock('@/navigation/page-bootstrap', () => ({ usePageBootstrap: () => ({ markSettled: vi.fn() }) }));
vi.mock('@/navigation/router', () => ({
	useArticleRoute: () => ({ articleRoute: ref(mock.articleRoute), updateArticleQuery: vi.fn() }),
}));
vi.mock('@/pages/article/article', () => ({ createArticleStreams: () => mock.streams }));
vi.mock('@/shared/api', () => ({ useBlackLabApi: vi.fn(), useFrontendApi: vi.fn() }));

function createStreams() {
	const empty = () => new BehaviorSubject(Loadable.Empty());
	return {
		contents$: empty(),
		currentPageSnippet$: empty(),
		hitToHighlight$: empty(),
		hits$: empty(),
		input$: new Subject(),
		metadata$: empty(),
		retrieveSnippetToggle$: new BehaviorSubject(false),
		validPaginationParameters$: empty(),
	};
}

beforeEach(() => {
	ArticleStore.actions.distributionAnnotation(null);
	ArticleStore.actions.growthAnnotations(null);
	ArticleStore.actions.statisticsTableFn(null);
	mock.corpus = {
		id: 'test',
		allAnnotatedFieldsMap: { contents: { id: 'contents' } },
		allMetadataFieldsMap: {},
		isParallelCorpus: false,
		mainAnnotatedField: { id: 'contents' },
		metadataGroups: [],
	};
	mock.articleRoute = { docId: 'document', viewField: 'contents' };
	mock.streams = createStreams();
});

describe('ArticlePage statistics tab', () => {
	test('shows the localized not-configured state without retrieving statistics', async () => {
		const wrapper = shallowMount(ArticlePage, {
			global: {
				mocks: {
					$t: (key: string) => (key === 'article.statistics.notConfigured' ? en.article.statistics.notConfigured : key),
				},
			},
		});

		await wrapper.get('#articleTabs a[href="#statistics"]').trigger('click');

		expect(wrapper.get('#statistics').text()).toContain('No statistics have been configured for this corpus.');
		expect((mock.streams as ReturnType<typeof createStreams>).retrieveSnippetToggle$.value).toBe(false);

		ArticleStore.actions.distributionAnnotation({ id: 'word', displayName: 'Words' });
		await nextTick();

		expect(wrapper.get('#statistics').text()).not.toContain('No statistics have been configured for this corpus.');
		expect((mock.streams as ReturnType<typeof createStreams>).retrieveSnippetToggle$.value).toBe(true);
	});
});
