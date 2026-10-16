// @vitest-environment jsdom

import { createMockApi, rejectedRequest, resolvedRequest } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { computed, createApp, effectScope, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import * as FilterStore from '@/app/state/legacy-filter-state';
import * as UIStore from '@/app/state/ui-state';
import { createCorpusContext, defaultConfig } from '@/app/state/useCorpusContext';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import * as TagsetStore from '@/features/corpus/model/tagset-state';
import { useActiveSearch } from '@/features/search/model/active-search';
import * as ExploreStore from '@/features/search/model/form/explore-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as PatternStore from '@/features/search/model/form/pattern-state';
import { useSearchFormSystem } from '@/features/search/model/new-form/search-form-system';
import { createSearchFeature } from '@/features/search/search-feature';
import { useSearchNavigation } from '@/navigation/search-navigation';

import { createCorpus } from '../form/search-form-fixture';

const subcorpus = vi.hoisted(() => ({ next: vi.fn() }));
vi.mock('@/features/search/resources/selected-subcorpus-count.resource', () => ({ selectedSubcorpusLoader: subcorpus }));

const cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.splice(0).forEach(stop => stop());
	subcorpus.next.mockReset();
});

async function setup(initialUrl: string, configure = () => {}) {
	const api = createMockApi({
		blacklab: {
			getCorpus: id => resolvedRequest(id === 'test-corpus' ? createCorpus() : { ...JSON.parse(JSON.stringify(createCorpus()).replaceAll('word', 'token').replaceAll('lemma', 'base')), id }),
			getParsePattern: () => rejectedRequest('Unsupported pattern'),
		},
		frontend: { getConfig: defaultConfig, getTagset: undefined },
	});
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ name: 'search', path: '/:corpus/search/:results?', component: { render: () => h('div') } },
			{ name: 'article', path: '/:corpus/docs/:docId', component: { render: () => h('div') } },
		],
	});
	await router.push(initialUrl);
	const scope = effectScope();
	cleanup.push(() => scope.stop());
	const corpusState = scope.run(() => {
		const corpus = createCorpusContext(
			api.blacklabApi,
			api.frontendApi,
			computed(() => String(router.currentRoute.value.params.corpus)),
		);
		corpus.beforePublish(context => {
			UIStore.init(context);
			FilterStore.init(context);
			TagsetStore.init(context);
		});
		return corpus;
	})!;
	await flushPromises();
	expect(corpusState.contextLoader.isLoaded()).toBe(true);
	const registry = createCustomizationRegistry(corpusState.corpus);
	const customizations = createCustomizations(registry, corpusState.corpus, UIStore.getState, UIStore.actions.results.shared.concordanceAnnotationId);
	configure();
	const feature = scope.run(() => createSearchFeature({ router, corpusState, blacklabApi: api.blacklabApi, customizations, translate: createMockTranslate(), debug: false }))!;
	const app = createApp({ render: () => h('div') });
	app.use(feature);
	app.mount(document.createElement('div'));
	cleanup.push(() => app.unmount());
	await flushPromises();
	return { app, router, feature, registry, corpusState };
}

describe('lazy search feature', () => {
	test('restores an incoming search when installed after corpus publication and provides its systems', async () => {
		const { app, feature } = await setup('/test-corpus/search/hits?patt=%5Bword%3D%22water%22%5D&f.form=search.simple');

		expect(feature.initialReadSettled.value).toBe(true);
		expect(feature.activeSearchParameters.value?.patt).toBe('[word="water"]');
		expect(InterfaceStore.get.viewedResults()).toBe('hits');
		expect(app.runWithContext(useActiveSearch).parameters).toBe(feature.activeSearchParameters);
		expect(app.runWithContext(useSearchFormSystem).value).toBeTruthy();
		expect(app.runWithContext(useSearchNavigation).open).toBeTypeOf('function');
	});

	test('retains corpus script configuration when search is activated later', async () => {
		await setup('/test-corpus/docs/document', () => {
			FilterStore.actions.registerFilter({ id: 'custom', componentName: 'filter-text', defaultDisplayName: 'Custom', metadata: undefined });
			FilterStore.actions.filterValue({ id: 'custom', value: 'Austen' });
			UIStore.actions.search.simple.searchAnnotationId('lemma');
			UIStore.actions.explore.defaultSearchAnnotationId('pos');
			UIStore.actions.results.addResultView({ id: 'custom-view', title: 'Custom view', component: 'CustomResults', customInitialState: {} });
		});

		expect(FilterStore.getState().filters.custom).toMatchObject({ defaultDisplayName: 'Custom', value: 'Austen' });
		expect(UIStore.getState().search.simple.searchAnnotationId).toBe('lemma');
		expect(UIStore.getState().explore.defaultSearchAnnotationId).toBe('pos');
		expect(UIStore.getState().results.customViews).toContainEqual({ id: 'custom-view', title: 'Custom view', component: 'CustomResults', customInitialState: {} });
	});

	test('keeps search effects inactive away from search and restores saved searches on later navigation', async () => {
		const { router, feature } = await setup('/test-corpus/docs/document');
		expect(subcorpus.next).not.toHaveBeenCalled();

		await router.push('/test-corpus/search/hits?patt=%5Bword%3D%22sea%22%5D');
		await flushPromises();
		expect(feature.activeSearchParameters.value?.patt).toBe('[word="sea"]');
		expect(subcorpus.next).toHaveBeenCalled();

		await router.push('/test-corpus/docs/document');
		await flushPromises();
		expect(feature.activeSearchParameters.value).toBeUndefined();
		const calls = subcorpus.next.mock.calls.length;
		InterfaceStore.actions.viewedResults('docs');
		await flushPromises();
		expect(subcorpus.next.mock.calls.length).toBe(calls);
	});

	test('reconstructs legacy state for a different corpus without reading the previous corpus customizations', async () => {
		const { router, registry, corpusState } = await setup('/test-corpus/search');
		registry.registerForm(api => api.configureExplore({ defaultSearchAnnotationId: 'lemma' }));
		ExploreStore.actions.reset();
		PatternStore.actions.expert.query('[word="old"]');
		expect(ExploreStore.getState().ngram.tokens[0].id).toBe('lemma');
		let initializedAnnotation: string | undefined;
		corpusState.beforePublish(context => {
			if (context.index?.id === 'other-corpus') initializedAnnotation = ExploreStore.getState().ngram.tokens[0].id;
		});
		await router.push('/other-corpus/docs/document');
		await flushPromises();

		expect(corpusState.corpus.value?.id).toBe('other-corpus');
		expect(ExploreStore.getState().ngram.tokens[0].id).toBe('token');
		expect(initializedAnnotation).toBe('token');
		expect(registry.formConfigurators.value).toHaveLength(0);
		expect(PatternStore.getState().extended.annotationValues).not.toHaveProperty('word');
		expect(PatternStore.getState().expert.query).toBeNull();
	});
});
