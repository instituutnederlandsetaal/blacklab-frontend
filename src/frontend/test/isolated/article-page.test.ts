// @vitest-environment jsdom

import en from '@assets/locales/en-us.json';
import { createMockApi } from '@test/mocks/api';
import { createMockCorpusContext } from '@test/mocks/corpus';
import { createMockCustomizations } from '@test/mocks/customizations';
import { flushPromises, mount, shallowMount } from '@vue/test-utils';
import type * as VueUse from '@vueuse/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, nextTick, ref, type Ref } from 'vue';

import * as ArticleStore from '@/app/state/article-configuration';
import type { CFPageConfig, Corpus } from '@/types/apptypes';

import { ApiError } from '@/shared/api/lib/api-types';
import { Loadable } from '@/shared/utils/loadable/loadable-core';

import ArticlePage from '@/pages/article/ArticlePage.vue';

const mock = vi.hoisted(() => ({
	articleRoute: undefined as unknown,
	cfPageConfig: undefined as unknown,
	corpus: undefined as unknown,
	createTooltips: vi.fn(() => vi.fn()),
	markScriptsReady: vi.fn(),
	streams: undefined as unknown,
}));

vi.mock('@vueuse/core', async importOriginal => ({
	...(await importOriginal<typeof VueUse>()),
	useDraggable: () => ({ style: ref({}), x: ref(0), y: ref(0) }),
	useLocalStorage: (_key: string, initialValue: unknown) => ref(initialValue),
	useWindowSize: () => ({ width: ref(1024), height: ref(768) }),
}));
vi.mock('@/modules/expandable-tooltips', () => ({ default: mock.createTooltips }));
vi.mock('@/navigation/page-bootstrap', () => ({ usePageBootstrap: () => ({ markScriptsReady: mock.markScriptsReady }) }));
vi.mock('@/features/article/model/article-page-state', () => ({
	useArticleState: () => ({ parameters: ref(mock.articleRoute), showPage: vi.fn(), showHit: vi.fn() }),
}));
vi.mock('@/pages/article/article', () => ({ createArticleStreams: () => mock.streams }));

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

const StatisticsProbe = defineComponent({
	props: { isPaginated: Boolean },
	template: '<div data-testid="statistics-probe" :data-paginated="String(isPaginated)" />',
});

const EmptyHtmlRenderer = defineComponent({
	template: '<div><slot name="empty" /></div>',
});

let customizations: ReturnType<typeof createMockCustomizations>;
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
		allMetadataFieldsMap: {},
		isParallelCorpus: false,
		mainAnnotatedField: { id: 'contents' },
		metadataGroups: [],
	};
	customizations = createMockCustomizations(() => mock.corpus as Corpus);
	api = createMockApi();
	corpusContext = createMockCorpusContext({ corpus: () => mock.corpus as Corpus, config: mock.cfPageConfig as Ref<Partial<CFPageConfig>> });
	mock.articleRoute = { docId: 'document', viewField: 'contents' };
	mock.streams = createStreams();
});

function mountArticle() {
	return mount(ArticlePage, {
		global: {
			plugins: [api, corpusContext, customizations],
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

		((mock.streams as ReturnType<typeof createStreams>).contents$ as BehaviorSubject<unknown>).next(Loadable.Loaded({ html: marker }));
		await flushPromises();

		expect(mock.markScriptsReady).toHaveBeenCalledOnce();
	});

	test('does not run queued settlement after the article instance is unmounted', async () => {
		const obsolete = mountArticle();
		const marker = document.createElement('p');
		((mock.streams as ReturnType<typeof createStreams>).contents$ as BehaviorSubject<unknown>).next(Loadable.Loaded({ html: marker }));

		obsolete.unmount();
		mock.streams = createStreams();
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

		((mock.streams as ReturnType<typeof createStreams>).contents$ as BehaviorSubject<unknown>).next(Loadable.LoadingError(new ApiError('Error', 'Request failed', 'Error', 500)));
		await flushPromises();

		expect(mock.markScriptsReady).toHaveBeenCalledOnce();
	});
});

describe('ArticlePage statistics tab', () => {
	test('shows the localized not-configured state without retrieving statistics', async () => {
		const wrapper = shallowMount(ArticlePage, {
			global: {
				plugins: [api, corpusContext, customizations],
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
		((mock.streams as ReturnType<typeof createStreams>).currentPageSnippet$ as BehaviorSubject<unknown>).next(Loadable.Loaded({}));
		((mock.streams as ReturnType<typeof createStreams>).metadata$ as BehaviorSubject<unknown>).next(Loadable.Loaded({ html: document.createElement('div'), json: {} }));
		((mock.streams as ReturnType<typeof createStreams>).validPaginationParameters$ as BehaviorSubject<unknown>).next(Loadable.Loaded({ pageSize: expected ? pageSize : null }));
		await flushPromises();

		expect(wrapper.get('[data-testid="statistics-probe"]').attributes('data-paginated')).toBe(String(expected));
	});
});

test('updates the displayed metadata when customized field IDs change', async () => {
	const detailedMetadataIds = ref(['title']);
	customizations.resultDetailedMetadataIds.mockImplementation(() => detailedMetadataIds.value);
	mock.corpus = {
		...(mock.corpus as Record<string, unknown>),
		allMetadataFieldsMap: { author: { id: 'author' }, title: { id: 'title' } },
		metadataGroups: [{ entries: ['title', 'author'], id: 'main' }],
	};
	const wrapper = mount(ArticlePage, {
		global: {
			plugins: [api, corpusContext, customizations],
			mocks: {
				$t: (key: string) => key,
				$tMetaDisplayName: (field: { id: string }) => field.id,
				$tMetaGroupName: (group: { id: string }) => group.id,
			},
			stubs: { ArticlePageStatistics: true, Collapsible: true, Debug: true, HtmlRenderer: EmptyHtmlRenderer, Pagination: true, Spinner: true },
		},
	});
	((mock.streams as ReturnType<typeof createStreams>).metadata$ as BehaviorSubject<unknown>).next(
		Loadable.Loaded({
			html: document.createElement('div'),
			json: { docInfo: { mayView: true, metadata: { author: ['Author value'], title: ['Title value'] }, tokenCounts: [{ fieldName: 'contents', tokens: 269 }] } },
		}),
	);
	await flushPromises();
	expect(wrapper.get('#metadata').text()).toContain('Title value');
	expect(wrapper.get('#metadata').text()).not.toContain('Author value');
	expect(wrapper.get('#docLengthTokens').text()).toBe('269');

	detailedMetadataIds.value = ['author'];
	await nextTick();
	expect(wrapper.get('#metadata').text()).not.toContain('Title value');
	expect(wrapper.get('#metadata').text()).toContain('Author value');
});

test('replaces and disposes tooltip contexts with article contents', async () => {
	const firstCleanup = vi.fn();
	const secondCleanup = vi.fn();
	mock.createTooltips.mockReturnValueOnce(firstCleanup).mockReturnValueOnce(firstCleanup).mockReturnValueOnce(secondCleanup).mockReturnValueOnce(secondCleanup);
	const wrapper = shallowMount(ArticlePage, { global: { plugins: [api, corpusContext, customizations] } });
	const contents$ = (mock.streams as ReturnType<typeof createStreams>).contents$ as BehaviorSubject<unknown>;

	contents$.next(Loadable.Loaded({ html: document.createElement('div') }));
	await nextTick();
	expect(mock.createTooltips).toHaveBeenCalledWith(expect.objectContaining({ mode: 'title' }), firstCleanup);

	contents$.next(Loadable.Loaded({ html: document.createElement('div') }));
	await nextTick();
	expect(firstCleanup).toHaveBeenCalledOnce();
	expect(mock.createTooltips).toHaveBeenCalledWith(expect.objectContaining({ mode: 'title' }), secondCleanup);

	wrapper.unmount();
	expect(secondCleanup).toHaveBeenCalledOnce();
});
