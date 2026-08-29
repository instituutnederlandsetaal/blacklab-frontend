// @vitest-environment jsdom

import en from '@assets/locales/en-us.json';
import { enableAutoUnmount, flushPromises, mount, shallowMount } from '@vue/test-utils';
import type * as VueUse from '@vueuse/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref } from 'vue';

import * as ArticleStore from '@/features/article/model/article-state';

import { ApiError } from '@/shared/api/lib/api-types';
import { Loadable } from '@/shared/utils/loadable/loadable-core';

import ArticlePage from '@/pages/article/ArticlePage.vue';

enableAutoUnmount(afterEach);

const mock = vi.hoisted(() => ({
	articleRoute: undefined as unknown,
	corpus: undefined as unknown,
	createTooltips: vi.fn(() => vi.fn()),
	markSettled: vi.fn(),
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
vi.mock('@/modules/expandable-tooltips', () => ({ default: mock.createTooltips }));
vi.mock('@/navigation/page-bootstrap', () => ({ usePageBootstrap: () => ({ markSettled: mock.markSettled }) }));
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
	mock.createTooltips.mockReset();
	mock.createTooltips.mockImplementation(() => vi.fn());
	mock.markSettled.mockReset();
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

function mountArticle() {
	return mount(ArticlePage, {
		global: {
			mocks: { $t: (key: string) => key },
			stubs: { ArticlePageStatistics: true, Collapsible: true, Debug: true, Pagination: true, Spinner: true },
		},
	});
}

describe('ArticlePage bootstrap settlement', () => {
	test('settles only after rendered content is inside the live article', async () => {
		const wrapper = mountArticle();
		const marker = document.createElement('p');
		marker.className = 'article-marker';
		marker.textContent = 'Ready';
		mock.markSettled.mockImplementationOnce(() => {
			expect(wrapper.get('.article .article-marker').element).toBe(marker);
		});

		((mock.streams as ReturnType<typeof createStreams>).contents$ as BehaviorSubject<unknown>).next(Loadable.Loaded({ html: marker }));
		await flushPromises();

		expect(mock.markSettled).toHaveBeenCalledOnce();
	});

	test('does not run queued settlement after the article instance is unmounted', async () => {
		const obsolete = mountArticle();
		const marker = document.createElement('p');
		((mock.streams as ReturnType<typeof createStreams>).contents$ as BehaviorSubject<unknown>).next(Loadable.Loaded({ html: marker }));

		obsolete.unmount();
		mock.streams = createStreams();
		const current = mountArticle();
		await flushPromises();

		expect(mock.markSettled).not.toHaveBeenCalled();
		current.unmount();
	});

	test('settles errors only after the article error is rendered', async () => {
		const wrapper = mountArticle();
		mock.markSettled.mockImplementationOnce(() => {
			expect(wrapper.get('#content .alert').text()).toContain('Could not load document contents. Request failed');
		});

		((mock.streams as ReturnType<typeof createStreams>).contents$ as BehaviorSubject<unknown>).next(Loadable.LoadingError(new ApiError('Error', 'Request failed', 'Error', 500)));
		await flushPromises();

		expect(mock.markSettled).toHaveBeenCalledOnce();
	});
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

test('replaces and disposes tooltip contexts with article contents', async () => {
	const firstCleanup = vi.fn();
	const secondCleanup = vi.fn();
	mock.createTooltips.mockReturnValueOnce(firstCleanup).mockReturnValueOnce(firstCleanup).mockReturnValueOnce(secondCleanup).mockReturnValueOnce(secondCleanup);
	const wrapper = shallowMount(ArticlePage);
	const contents$ = (mock.streams as ReturnType<typeof createStreams>).contents$ as BehaviorSubject<unknown>;

	contents$.next(Loadable.Loaded({ html: document.createElement('div') }));
	await nextTick();
	expect(mock.createTooltips).toHaveBeenNthCalledWith(2, expect.objectContaining({ mode: 'title' }), firstCleanup);

	contents$.next(Loadable.Loaded({ html: document.createElement('div') }));
	await nextTick();
	expect(firstCleanup).toHaveBeenCalledOnce();
	expect(mock.createTooltips).toHaveBeenNthCalledWith(4, expect.objectContaining({ mode: 'title' }), secondCleanup);

	wrapper.unmount();
	expect(secondCleanup).toHaveBeenCalledOnce();
});
