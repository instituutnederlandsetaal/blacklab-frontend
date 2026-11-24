// @vitest-environment jsdom

import { createMockApi, resolvedRequest } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, onTestFinished, test } from 'vitest';
import { computed, effectScope, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import * as FilterStore from '@/app/legacy-stores/filter-store';
import * as TagsetStore from '@/app/legacy-stores/tagset-store';
import * as UIStore from '@/app/legacy-stores/ui-store';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import { searchFormIds } from '@/customization-api/shared/form/ids';
import { createCorpusContext, defaultConfig } from '@/features/corpus/corpus-context';
import { getState as getHistory, actions as history } from '@/pages/search/history/query-history-store';
import { useSearchFormSystem } from '@/pages/search/model/form/search-form-system';
import { useResultsState } from '@/pages/search/model/results/results-state';
import { createSearchPlugin } from '@/pages/search/search-plugin';

import { createCorpus } from '../form/search-form-fixture';

import History from '@/pages/search/history/History.vue';

async function setup(initialUrl: string, configure = () => {}) {
	const api = createMockApi({
		blacklab: {
			getCorpus: () => resolvedRequest(createCorpus()),
		},
		frontend: { getConfig: defaultConfig, getTagset: undefined },
	});
	const router = createRouter({
		history: createMemoryHistory('/frontend'),
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
		createSearchPlugin({ customizationsReady: true, router, corpusState, blacklabApi: api.blacklabApi, customizations, translate: createMockTranslate(), debug: false }),
	)!;
	const dialog = mount(History, { global: { plugins: [router, corpusState, feature] } });
	await flushPromises();
	return { app: dialog.vm.$.appContext.app, router, feature, dialog };
}

describe('lazy search feature', () => {
	test('restores an incoming search when installed after corpus publication and provides its systems', async () => {
		const { app, feature } = await setup('/test-corpus/search/hits?patt=%5Bword%3D%22water%22%5D');

		expect(feature.initialReadSettled.value).toBe(true);
		expect(feature.results.parameters.value?.patt).toBe('[word="water"]');
		expect(feature.results.selectedViewName).toBe('hits');
		expect(app.runWithContext(useResultsState)).toBe(feature.results);
		expect(app.runWithContext(useSearchFormSystem).value).toBeTruthy();
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

	test('replays the current saved search and closes only after successful navigation', async () => {
		const path = `/test-corpus/search/hits?f.form=${searchFormIds.searchForm('simple')}&f.word=saved`;
		const { app, router, dialog } = await setup(path);
		const runtime = app.runWithContext(useSearchFormSystem).value!;
		const field = searchFormIds.queryField('simple');
		runtime.state.state.value[field] = { value: 'unsent', caseSensitive: false };
		history.addEntry({ url: '/frontend' + path.replace('saved', '%73aved') });
		await flushPromises();
		const button = dialog.get('tbody button');
		const removeGuard = router.beforeEach(() => false);
		await button.trigger('click');
		await flushPromises();
		expect(dialog.emitted('close')).toBeUndefined();
		expect(runtime.state.state.value[field]).toMatchObject({ value: 'unsent' });
		removeGuard();
		await button.trigger('click');
		await flushPromises();
		expect(dialog.emitted('close')).toHaveLength(1);
		expect(runtime.state.state.value[field]).toMatchObject({ value: 'saved' });
		expect(router.currentRoute.value.fullPath).toBe(path);
	});

	test('imports graph and older query URLs without changing the active search', async () => {
		const activePath = '/test-corpus/search/hits?patt=%5Bword%3D%22sea%22%5D';
		const { app, router, feature } = await setup(activePath);
		const runtime = app.runWithContext(useSearchFormSystem).value;
		history.addEntry({ url: `/test-corpus/search/hits?patt=%5Bword%3D%22ship%22%5D&f.form=${encodeURIComponent(searchFormIds.searchForm('simple'))}&f.word=ship` }, runtime);
		expect(getHistory()[0].displayValues.pattern).toBe('word: ship');
		history.addEntry({ url: '/test-corpus/search/hits?query=%5Bword%3D%22water%22%5D&filter=author%3AAusten' }, runtime);
		expect(getHistory()[0].displayValues).toEqual({ pattern: '[word="water"]', filters: 'author:Austen' });
		expect(router.currentRoute.value.fullPath).toBe(activePath);
		expect(feature.results.parameters.value?.patt).toBe('[word="sea"]');
	});
});
