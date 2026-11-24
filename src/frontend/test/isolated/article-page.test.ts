// @vitest-environment jsdom

import en from '@assets/locales/en-us.json';
import { createMockApi } from '@test/mocks/api';
import { createMockCorpusContext } from '@test/mocks/corpus';
import { flushPromises, mount, shallowMount } from '@vue/test-utils';
import type * as VueUse from '@vueuse/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, nextTick, ref, shallowRef, type Ref } from 'vue';

import * as ArticleStore from '@/app/legacy-stores/article-configuration-store';
import type { CFPageConfig, Corpus } from '@/types/apptypes';

import { ApiError } from '@/shared/api/lib/api-types';
import { Loadable } from '@/shared/utils/loadable/loadable-core';

import ArticlePage from '@/pages/article/ArticlePage.vue';

const mock = vi.hoisted(() => ({
	cfPageConfig: undefined as unknown,
	corpus: undefined as unknown,
	createTooltips: vi.fn(() => vi.fn()),
	markScriptsReady: vi.fn(),
	statisticsEnabled: (): boolean => false,
}));

vi.mock('@vueuse/core', async importOriginal => ({
	...(await importOriginal<typeof VueUse>()),
	useDraggable: () => ({ style: ref({}), x: ref(0), y: ref(0) }),
	useLocalStorage: (_key: string, initialValue: unknown) => ref(initialValue),
	useWindowSize: () => ({ width: ref(1024), height: ref(768) }),
}));
vi.mock('@/pages/article/expandable-tooltips', () => ({ default: mock.createTooltips }));
vi.mock('@/app/router/page-bootstrap', () => ({ usePageBootstrap: () => ({ markScriptsReady: mock.markScriptsReady }) }));
vi.mock('@/pages/article/model/article-page-state', () => ({
	useArticlePageState: () => ({ query: ref({ indexId: 'test', docId: 'document' }), showPage: vi.fn(), showHit: vi.fn() }),
}));
vi.mock('@/pages/article/model/article-resources', () => ({
	createArticleResources: (_blacklab: unknown, _frontend: unknown, _inputs: unknown, enabled: () => boolean) => {
		mock.statisticsEnabled = enabled;
		return resources;
	},
}));

function createResources() {
	const empty = () => shallowRef<Loadable<unknown>>(Loadable.Empty());
	return { contents: empty(), statistics: empty(), hitToHighlight: empty(), hits: empty(), metadata: empty(), pagination: empty() };
}
let resources: ReturnType<typeof createResources>;

const StatisticsProbe = defineComponent({
	props: { isPaginated: Boolean },
	template: '<div data-testid="statistics-probe" :data-paginated="String(isPaginated)" />',
});

let api: ReturnType<typeof createMockApi>;
let corpusContext: ReturnType<typeof createMockCorpusContext>;

beforeEach(() => {
	mock.cfPageConfig = ref({ pageSize: null });
	mock.createTooltips.mockReset();
	mock.createTooltips.mockImplementation(() => vi.fn());
	mock.markScriptsReady.mockReset();
	ArticleStore.actions.distributionAnnotation(null);
	ArticleStore.actions.growthAnnotations(null);
	ArticleStore.actions.statisticsTableFn(null);
	mock.corpus = {
		id: 'test',
		allAnnotatedFieldsMap: { contents: { id: 'contents' } },
		isParallelCorpus: false,
		mainAnnotatedField: 'contents',
	};
	api = createMockApi();
	corpusContext = createMockCorpusContext({ corpus: () => mock.corpus as Corpus, config: mock.cfPageConfig as Ref<Partial<CFPageConfig>> });
	resources = createResources();
});

function mountArticle() {
	return mount(ArticlePage, {
		global: {
			plugins: [api, corpusContext],
			mocks: { $t: (key: string) => key },
			stubs: { ArticlePageStatistics: StatisticsProbe, Collapsible: true, Debug: true, Pagination: true, Spinner: true },
		},
	});
}

describe('ArticlePage bootstrap settlement', () => {
	test('settles only after rendered content is inside the live article', async () => {
		const wrapper = mountArticle();
		expect(mock.markScriptsReady).not.toHaveBeenCalled();
		const marker = document.createElement('p');
		marker.className = 'article-marker';
		marker.textContent = 'Ready';
		mock.markScriptsReady.mockImplementationOnce(() => {
			expect(wrapper.get('.article .article-marker').text()).toBe('Ready');
		});

		resources.contents.value = Loadable.Loaded({ html: marker });
		await flushPromises();

		expect(mock.markScriptsReady).toHaveBeenCalledOnce();
	});

	test('does not run queued settlement after the article instance is unmounted', async () => {
		const obsolete = mountArticle();
		const marker = document.createElement('p');
		resources.contents.value = Loadable.Loaded({ html: marker });

		obsolete.unmount();
		resources = createResources();
		const current = mountArticle();
		await flushPromises();

		expect(mock.markScriptsReady).not.toHaveBeenCalled();
		current.unmount();
	});

	test('settles errors only after the article error is rendered', async () => {
		const wrapper = mountArticle();
		mock.markScriptsReady.mockImplementationOnce(() => {
			expect(wrapper.get('#content .alert').text()).toContain('Could not load document contents. Request failed');
		});

		resources.contents.value = Loadable.LoadingError(new ApiError('Error', 'Request failed', 'Error', 500));
		await flushPromises();

		expect(mock.markScriptsReady).toHaveBeenCalledOnce();
	});
});

describe('ArticlePage statistics tab', () => {
	test('shows the localized not-configured state without retrieving statistics', async () => {
		const wrapper = shallowMount(ArticlePage, {
			global: {
				plugins: [api, corpusContext],
				mocks: {
					$t: (key: string) => (key === 'article.statistics.notConfigured' ? en.article.statistics.notConfigured : key),
				},
			},
		});

		await wrapper.get('#articleTabs a[href="#statistics"]').trigger('click');

		expect(wrapper.get('#statistics').text()).toContain('No statistics have been configured for this corpus.');
		expect(mock.statisticsEnabled()).toBe(false);

		ArticleStore.actions.distributionAnnotation({ id: 'word', displayName: 'Words' });
		await nextTick();

		expect(wrapper.get('#statistics').text()).not.toContain('No statistics have been configured for this corpus.');
		expect(mock.statisticsEnabled()).toBe(true);
	});

	test.each([
		[null, false],
		[0, false],
		[-10, false],
		[10, true],
		[Number.NaN, false],
	])('treats page size %s as paginated=%s', async (pageSize, expected) => {
		(mock.cfPageConfig as { value: { pageSize: number | null } }).value.pageSize = pageSize;
		ArticleStore.actions.distributionAnnotation({ id: 'word', displayName: 'Words' });
		const wrapper = mountArticle();
		await wrapper.get('#articleTabs a[href="#statistics"]').trigger('click');
		resources.statistics.value = Loadable.Loaded({ snippet: {}, document: {} });
		resources.pagination.value = Loadable.Loaded({ pageSize: expected ? pageSize : null });
		await flushPromises();

		expect(wrapper.get('[data-testid="statistics-probe"]').attributes('data-paginated')).toBe(String(expected));
	});
});

test('replaces and disposes tooltip contexts with article contents', async () => {
	const firstCleanup = vi.fn();
	const secondCleanup = vi.fn();
	mock.createTooltips.mockReturnValueOnce(firstCleanup).mockReturnValueOnce(firstCleanup).mockReturnValueOnce(secondCleanup).mockReturnValueOnce(secondCleanup);
	const wrapper = shallowMount(ArticlePage, { global: { plugins: [api, corpusContext] } });

	resources.contents.value = Loadable.Loaded({ html: document.createElement('div') });
	await nextTick();
	expect(mock.createTooltips).toHaveBeenCalledWith(expect.objectContaining({ mode: 'title' }), firstCleanup);

	resources.contents.value = Loadable.Loaded({ html: document.createElement('div') });
	await nextTick();
	expect(firstCleanup).toHaveBeenCalledOnce();
	expect(mock.createTooltips).toHaveBeenCalledWith(expect.objectContaining({ mode: 'title' }), secondCleanup);

	wrapper.unmount();
	expect(secondCleanup).toHaveBeenCalledOnce();
});
