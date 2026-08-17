// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref, shallowRef, type Ref } from 'vue';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';

import * as RootStore from '@/app/state/root-store';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import { ContainerRenderer, FormBuilder, FormRuntime } from '@/features/form';
import type { PageMeta } from '@/navigation/page-context';
import type * as UrlStateParserSearchModule from '@/url/url-state-parser-search';
import startUrlSync from '@/url/url-state-sync';

import type { LoadableFromRequest } from '@/shared/utils/loadable/loadable-datasource';

const parserGet = vi.hoisted(() => vi.fn());

vi.mock('@/url/url-state-parser-search', async importOriginal => {
	const actual = await importOriginal<typeof UrlStateParserSearchModule>();
	return {
		...actual,
		default: class {
			public get() {
				return parserGet();
			}
		},
	};
});

function startTestUrlSync(searchForms: Ref<FormRuntime | null>) {
	vi.stubGlobal('CONTEXT_URL', '');
	const currentRoute = ref({
		name: 'search',
		path: '/test-corpus/search',
		fullPath: '/test-corpus/search?patt=%5Bword%3D%22water%22%5D',
		params: { corpus: 'test-corpus' },
		query: { patt: '[word="water"]' },
	} as unknown as RouteLocationNormalizedLoaded);
	const router = {
		currentRoute,
		resolve: () => ({ path: '/test-corpus/search' }),
		push: vi.fn().mockResolvedValue(undefined),
	} as unknown as Router;
	const corpusContext = {
		isLoaded: () => true,
		value: { index: { id: 'test-corpus' } },
	} as unknown as LoadableFromRequest<CorpusContext>;
	const corpus = { id: 'test-corpus', relations: { spans: {} } } as never;
	const customizationRegistry = createCustomizationRegistry(corpus);
	return startUrlSync(router, {
		blacklabApi: createMockApi().blacklabApi,
		corpusContext,
		indexId: ref('test-corpus'),
		pageMeta: ref({ name: 'search' } as PageMeta),
		searchForms,
		customizations: createCustomizations(customizationRegistry, corpus, {} as never),
	});
}

function createEmptyFormRuntime() {
	const builder = new FormBuilder({
		corpus: { indexId: 'test-corpus', textDirection: 'ltr' },
		translate: createMockTranslate(),
	});
	builder.newForm('search.simple', ContainerRenderer, {});
	return new FormRuntime(builder);
}

afterEach(() => {
	parserGet.mockReset();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('URL state sync', () => {
	test('does not restart an in-flight initial URL read when the form definition changes', async () => {
		parserGet.mockReturnValue(new Promise(() => undefined));
		const searchForms = shallowRef<FormRuntime | null>({ definition: {} } as FormRuntime);
		const stop = startTestUrlSync(searchForms);

		await nextTick();
		expect(parserGet).toHaveBeenCalledTimes(1);

		searchForms.value = { definition: {} } as FormRuntime;
		await nextTick();

		expect(parserGet).toHaveBeenCalledTimes(1);
		stop();
	});

	test('reads the URL again when the form definition changes after initial restoration', async () => {
		parserGet.mockResolvedValue({ interface: { viewedResults: null }, newForm: null });
		vi.spyOn(RootStore.actions, 'replace').mockImplementation(() => undefined);
		const searchForms = shallowRef<FormRuntime | null>(null);
		const stop = startTestUrlSync(searchForms);

		await nextTick();
		await Promise.resolve();
		expect(parserGet).toHaveBeenCalledTimes(1);

		searchForms.value = createEmptyFormRuntime();
		await nextTick();

		expect(parserGet).toHaveBeenCalledTimes(2);
		stop();
	});
});
