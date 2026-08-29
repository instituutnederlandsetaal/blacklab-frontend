// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest';
import { computed, createApp, isReactive, nextTick, reactive, ref, watchEffect } from 'vue';

import type { CorpusContext } from '@/app/state/useCorpusContext';
import { createCustomizations, useCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry, useCustomizationRegistry } from '@/customization-api/registry';
import * as FilterStore from '@/features/search/model/form/filter-state';
import { createFilterStoreAdapter } from '@/interop/legacy-store-adapters/filters';
import type { Corpus } from '@/types/apptypes';

import type { Translate } from '@/shared/i18n';

function createCorpus(id: string): Corpus {
	return {
		id,
		relations: {
			spans: {
				utterance: {
					attributes: { speaker: { valueListComplete: true, values: { Alice: 1 } } },
				},
			},
		},
	} as unknown as Corpus;
}

afterEach(() => {
	vi.restoreAllMocks();
	FilterStore.init({ index: undefined } as CorpusContext);
});

describe('customization registry corpus lifecycle', () => {
	test('provides the registry and resolved customization API separately', () => {
		const corpus = createCorpus('first');
		const registry = createCustomizationRegistry(corpus);
		const customizations = createCustomizations(registry, corpus, {} as never, () => {});
		const app = createApp({});
		app.use(registry);
		app.use(customizations);

		expect(app.runWithContext(useCustomizationRegistry).resultCustomizations).toBe(registry.resultCustomizations);
		expect(app.runWithContext(useCustomizations).searchWithSpans).toBe(customizations.searchWithSpans);
	});

	test('useCustomizations gates access on corpus availability', () => {
		const corpus = ref<Corpus>();
		const registry = createCustomizationRegistry(corpus);
		const customizations = createCustomizations(registry, corpus, {} as never, () => {});
		const app = createApp({});
		app.use(customizations);

		expect(() => app.runWithContext(useCustomizations)).toThrow('useCustomizations() called without a loaded corpus.');

		corpus.value = createCorpus('first');
		expect(app.runWithContext(useCustomizations).searchWithSpans).toBe(customizations.searchWithSpans);
	});

	test('tracks reactive state read through stable customization functions', async () => {
		const corpus = createCorpus('first');
		const registry = createCustomizationRegistry(corpus);
		const uiState = reactive({ results: { customViews: [{ id: 'first' as string }] } });
		const customizations = createCustomizations(registry, corpus, uiState as never, () => {});
		const app = createApp({});
		app.use(customizations);
		const injected = app.runWithContext(useCustomizations);
		const { resultViews } = injected;
		const observed: string[][] = [];
		const stop = watchEffect(() => observed.push(resultViews().map(view => view.id)));

		expect(isReactive(injected)).toBe(false);
		expect(resultViews).toBe(injected.resultViews);
		uiState.results.customViews = [{ id: 'second' }];
		await nextTick();

		expect(observed).toEqual([['first'], ['second']]);
		stop();
	});

	test('tracks replacement of functions delegated through the customization API', () => {
		const corpus = createCorpus('first');
		const registry = createCustomizationRegistry(corpus);
		const uiState = reactive({ global: { errorMessage: (): string => 'first' } });
		const customizations = createCustomizations(registry, corpus, uiState as never, () => {});
		const message = computed(() => customizations.formatError({} as never, 'hits'));

		expect(message.value).toBe('first');
		uiState.global.errorMessage = () => 'second';
		expect(message.value).toBe('second');
	});

	test('recomputes result resolvers when typed customizations are registered and removed', () => {
		const corpus = createCorpus('first');
		const registry = createCustomizationRegistry(corpus);
		const customizations = createCustomizations(registry, corpus, {} as never, () => {});
		const withSpans = computed(() => customizations.searchWithSpans('[]'));

		expect(withSpans.value).toBeNull();
		const unregister = registry.registerResults({ withSpans: true });
		expect(withSpans.value).toBe(true);
		unregister();
		expect(withSpans.value).toBeNull();
	});

	test('resolves filter tabs using current corpus and legacy customization behavior', () => {
		const corpus = {
			...createCorpus('first'),
			allMetadataFieldsMap: { title: {}, author: {}, forced: {} },
			metadataGroups: [
				{ id: 'Bibliography', fields: [{ id: 'title' }, { id: 'author' }, { id: 'forced' }] },
				{ id: 'Empty', fields: [{ id: 'author' }] },
			],
		} as unknown as Corpus;
		const registry = createCustomizationRegistry(corpus);
		const customizations = createCustomizations(registry, corpus, {} as never, () => {});
		registry.applyLegacyCustomization(legacy => {
			legacy.search.metadata.showField = id => (id === 'forced' ? true : id === 'author' ? false : null);
			legacy.search.metadata.addCustomTab('Bibliography', [{ id: 'custom', componentName: 'filter-text', defaultDisplayName: 'Custom', metadata: undefined }]);
		});
		expect(FilterStore.getState().filters.custom?.groupId).toBe('Bibliography');

		const tabs = customizations.searchFilterTabs(FilterStore.getState().filters, ['title', 'author'], {
			$tMetaGroupName: ((name: string | undefined) => (name == null ? name : `Translated ${name}`)) as Translate['$tMetaGroupName'],
		});

		expect(tabs).toEqual([
			{
				tabname: 'Translated Bibliography',
				subtabs: [{ tabname: undefined, fields: ['title', 'forced', 'custom'] }],
				query: undefined,
			},
		]);
	});

	test('adapts legacy filter registration and filter groups', () => {
		const corpus = { ...createCorpus('first'), allMetadataFieldsMap: {}, metadataGroups: [] } as unknown as Corpus;
		const registry = createCustomizationRegistry(corpus);
		const filters = createFilterStoreAdapter(registry);

		filters.actions.registerFilterGroup({ id: 'Custom tab', filterIds: [] });
		filters.actions.registerFilter({
			filter: { id: 'custom', groupId: 'Custom tab', componentName: 'filter-text', defaultDisplayName: 'Custom', metadata: undefined },
		});
		filters.getState().filterGroups[0].subtabs![0].tabname = 'Details';

		expect(filters.getState().filters.custom).toBeDefined();
		expect(filters.get.hasSpanFilters()).toBe(false);
		const customizations = createCustomizations(registry, corpus, {} as never, () => {});
		expect(customizations.searchFilterTabs(filters.getState().filters, [], { $tMetaGroupName: (name => name) as Translate['$tMetaGroupName'] })).toEqual([
			{ tabname: 'Custom tab', subtabs: [{ tabname: 'Details', fields: ['custom'] }], query: undefined },
		]);
	});

	test('immediately applies legacy root callbacks to the current corpus target', () => {
		const corpus = createCorpus('first');
		const registry = createCustomizationRegistry(corpus);
		const callback = vi.fn(customizations => {
			customizations.search.pattern.shouldAddWithSpans = () => true;
		});

		registry.applyLegacyCustomization(callback);

		expect(callback).toHaveBeenCalledOnce();
		expect(callback).toHaveBeenCalledWith(registry.legacyApi.value);
		expect(registry.legacyApi.value).not.toHaveProperty('_corpus');
		expect(registry.legacyApi.value?.search.pattern.shouldAddWithSpans('[]')).toBe(true);
		expect(registry.legacyApi.value?.search.metadata.createSpanFilter('utterance', 'speaker', 'auto', 'Speaker').metadata).toMatchObject({
			options: [{ value: 'Alice' }],
		});
	});

	test('recreates legacy state and clears typed registrations synchronously on corpus change', () => {
		const corpus = ref<Corpus | undefined>(createCorpus('first'));
		const registry = createCustomizationRegistry(corpus);
		registry.applyLegacyCustomization(customizations => {
			customizations.search.pattern.shouldAddWithSpans = () => true;
		});
		registry.registerForm(() => {});
		registry.registerResults({ withSpans: true });
		const firstLegacy = registry.legacyApi.value;

		corpus.value = createCorpus('second');

		expect(registry.formConfigurators.value).toEqual([]);
		expect(registry.resultCustomizations.value).toEqual([]);
		expect(registry.legacyApi.value).not.toBe(firstLegacy);
		expect(registry.legacyApi.value?.search.pattern.shouldAddWithSpans('[]')).toBeNull();
	});

	test('warns and ignores registrations made before a corpus is loaded', () => {
		const registry = createCustomizationRegistry(undefined);
		const callback = vi.fn();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		registry.applyLegacyCustomization(callback);
		registry.registerForm(() => {});
		registry.registerResults({ withSpans: true });

		expect(callback).not.toHaveBeenCalled();
		expect(registry.legacyApi.value).toBeUndefined();
		expect(registry.formConfigurators.value).toEqual([]);
		expect(registry.resultCustomizations.value).toEqual([]);
		expect(warn).toHaveBeenCalledTimes(3);
	});
});
