// @vitest-environment jsdom

import { createMockTranslate } from '@test/mocks/i18n';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { computed, createApp, nextTick, reactive, ref, watchEffect } from 'vue';

import * as FilterStore from '@/app/state/legacy-filter-state';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import { createCustomizations, useCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry, useCustomizationRegistry } from '@/customization-api/registry';
import { createFilterStoreAdapter } from '@/interop/legacy-store-adapters/filters';
import type { Corpus, FilterDefinition } from '@/types/apptypes';
import { humanizeSerializedGroupBy } from '@/utils/grouping';

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

		app.runWithContext(useCustomizationRegistry).registerResults({ withSpans: true });
		expect(app.runWithContext(useCustomizations).searchWithSpans('[]')).toBe(true);
	});

	test('useCustomizations gates access on corpus availability', () => {
		const corpus = ref<Corpus>();
		const registry = createCustomizationRegistry(corpus);
		const customizations = createCustomizations(registry, corpus, {} as never, () => {});
		const app = createApp({});
		app.use(customizations);

		expect(() => app.runWithContext(useCustomizations)).toThrow('useCustomizations() called without a loaded corpus.');

		corpus.value = createCorpus('first');
		expect(app.runWithContext(useCustomizations).searchWithSpans('[]')).toBeNull();
	});

	test('tracks reactive state read through customization functions', async () => {
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

	test('retains legacy span filter registration for result grouping', () => {
		const corpus = createCorpus('first');
		const registry = createCustomizationRegistry(corpus);
		const filters = createFilterStoreAdapter(registry);

		filters.actions.registerFilterGroup({ id: 'Custom tab', filterIds: [] });
		filters.actions.registerFilter({
			filter: { id: 'custom', groupId: 'Custom tab', componentName: 'filter-text', defaultDisplayName: 'Custom', metadata: undefined },
		});
		expect(filters.get.hasSpanFilters()).toBe(false);

		const speakerId = 'span:utterance:speaker';
		filters.actions.registerFilter({
			filter: {
				id: speakerId,
				groupId: 'Custom tab',
				componentName: 'filter-text',
				behaviourName: 'span-text',
				displayName: 'Speaker',
				description: 'Speaker name',
			} as unknown as FilterDefinition<unknown>,
			insertBefore: 'custom',
		});
		expect(filters.getState().filterGroups[0].subtabs?.[0].fields).toEqual([speakerId, 'custom']);
		expect(filters.get.filterValue(speakerId)).toMatchObject({ defaultDisplayName: 'Speaker', defaultDescription: 'Speaker name' });
		expect(filters.get.hasSpanFilters()).toBe(true);
		expect(humanizeSerializedGroupBy(createMockTranslate(), 'span-attribute:with-spans[utterance]:speaker', {}, {})).toBe('Speaker');
	});

	test('immediately applies legacy root callbacks to the current corpus target', () => {
		const corpus = createCorpus('first');
		const registry = createCustomizationRegistry(corpus);
		const callback = vi.fn(customizations => {
			customizations.search.pattern.shouldAddWithSpans = () => true;
		});

		registry.applyLegacyCustomization(callback);

		expect(callback).toHaveBeenCalledOnce();
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
		registry.registerForm({ configure: () => {}, customize: () => {} });
		registry.registerResults({ withSpans: true });

		corpus.value = createCorpus('second');

		expect(registry.formConfigurators.value).toEqual([]);
		expect(registry.formCustomizers.value).toEqual([]);
		expect(registry.resultCustomizations.value).toEqual([]);
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
