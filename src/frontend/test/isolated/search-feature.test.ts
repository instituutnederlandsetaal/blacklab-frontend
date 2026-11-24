// @vitest-environment jsdom

import { createMockApi, resolvedRequest } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, onTestFinished, test } from 'vitest';
import { computed, createApp, effectScope, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import * as FilterStore from '@/app/state/legacy-filter-state';
import * as UIStore from '@/app/state/ui-state';
import { createCorpusContext, defaultConfig } from '@/app/state/useCorpusContext';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import { searchFormIds } from '@/customization-api/shared/form/ids';
import * as TagsetStore from '@/features/corpus/model/tagset-state';
import { getState as getHistory, useHistoryImport } from '@/features/history/model/query-history-state';
import { useSearchFormSystem } from '@/features/search/model/new-form/search-form-system';
import { useResultsState } from '@/features/search/model/results/results-state';
import { createSearchFeature } from '@/features/search/search-feature';
import { useSearchNavigation } from '@/url/search-state';

import { createCorpus } from '../form/search-form-fixture';

async function setup(initialUrl: string, configure = () => {}) {
	const api = createMockApi({
		blacklab: {
			getCorpus: () => resolvedRequest(createCorpus()),
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
	onTestFinished(() => scope.stop());
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
	const feature = scope.run(() =>
		createSearchFeature({ customizationsReady: true, router, corpusState, blacklabApi: api.blacklabApi, customizations, translate: createMockTranslate(), debug: false }),
	)!;
	const app = createApp({ render: () => h('div') });
	app.use(feature);
	app.mount(document.createElement('div'));
	onTestFinished(() => app.unmount());
	await flushPromises();
	return { app, router, feature, registry, corpusState };
}

describe('lazy search feature', () => {
	test('restores an incoming search when installed after corpus publication and provides its systems', async () => {
		const { app, feature } = await setup('/test-corpus/search/hits?patt=%5Bword%3D%22water%22%5D');

		expect(feature.initialReadSettled.value).toBe(true);
		expect(feature.results.parameters.value?.patt).toBe('[word="water"]');
		expect(feature.results.selectedViewName).toBe('hits');
		expect(app.runWithContext(useResultsState)).toBe(feature.results);
		expect(app.runWithContext(useSearchFormSystem).value).toBeTruthy();
		expect(app.runWithContext(useSearchNavigation)).toHaveProperty('open', expect.any(Function));
	});

	test('retains corpus script configuration when search is activated later', async () => {
		await setup('/test-corpus/docs/document', () => {
			FilterStore.actions.registerFilter({ id: 'custom', componentName: 'filter-text', defaultDisplayName: 'Custom', metadata: undefined });
			UIStore.actions.search.simple.searchAnnotationId('lemma');
			UIStore.actions.explore.defaultSearchAnnotationId('pos');
			UIStore.actions.results.addResultView({ id: 'custom-view', title: 'Custom view', component: 'CustomResults', customInitialState: {} });
		});

		expect(FilterStore.getState().filters.custom).toMatchObject({ defaultDisplayName: 'Custom' });
		expect(UIStore.getState().search.simple.searchAnnotationId).toBe('lemma');
		expect(UIStore.getState().explore.defaultSearchAnnotationId).toBe('pos');
		expect(UIStore.getState().results.customViews).toContainEqual({ id: 'custom-view', title: 'Custom view', component: 'CustomResults', customInitialState: {} });
	});

	test('restores a search on entry and clears its parameters on leaving', async () => {
		const { router, feature } = await setup('/test-corpus/docs/document');

		await router.push('/test-corpus/search/hits?patt=%5Bword%3D%22sea%22%5D');
		await flushPromises();
		expect(feature.results.parameters.value?.patt).toBe('[word="sea"]');

		await router.push('/test-corpus/docs/document');
		await flushPromises();
		expect(feature.results.parameters.value).toBeUndefined();
	});

	test('imports graph and older query URLs without changing the active search', async () => {
		const activePath = '/test-corpus/search/hits?patt=%5Bword%3D%22sea%22%5D';
		const { app, router, feature } = await setup(activePath);
		const importUrl = app.runWithContext(useHistoryImport);
		await importUrl(`/test-corpus/search/hits?patt=%5Bword%3D%22ship%22%5D&f.form=${encodeURIComponent(searchFormIds.searchForm('simple'))}&f.word=ship`);
		expect(getHistory()[0].displayValues.pattern).toBe('word: ship');
		await importUrl('/test-corpus/search/hits?query=%5Bword%3D%22water%22%5D&filter=author%3AAusten');
		expect(getHistory()[0].displayValues).toEqual({ pattern: '[word="water"]', filters: 'author:Austen' });
		expect(router.currentRoute.value.fullPath).toBe(activePath);
		expect(feature.results.parameters.value?.patt).toBe('[word="sea"]');
	});
});
