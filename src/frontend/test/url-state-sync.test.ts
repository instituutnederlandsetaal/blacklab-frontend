// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import URI from 'urijs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { effectScope, nextTick, ref, shallowRef, type Ref } from 'vue';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';

import * as RootStore from '@/app/state/root-store';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import { ContainerRenderer, filterTextController, FormBuilder, FormRuntime, TextField } from '@/features/form';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as QueryStore from '@/features/search/model/query-state';
import type { EffectiveCollocationParameters } from '@/features/search/model/results/result-types';
import * as ViewStore from '@/features/search/model/results/view-state';
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

function startTestUrlSync(searchForms: Ref<FormRuntime | null>, beforeStateLoaded = () => Promise.resolve(), query: Record<string, unknown> = { patt: '[word="water"]' }) {
	vi.stubGlobal('CONTEXT_URL', '');
	const currentRoute = ref({
		name: 'search',
		path: '/test-corpus/search',
		fullPath: '/test-corpus/search?patt=%5Bword%3D%22water%22%5D',
		params: { corpus: 'test-corpus' },
		query,
	} as unknown as RouteLocationNormalizedLoaded);
	const push = vi.fn().mockResolvedValue(undefined);
	const router = {
		currentRoute,
		resolve: () => ({ path: '/test-corpus/search' }),
		push,
	} as unknown as Router;
	const corpusContext = {
		isLoaded: () => true,
		value: { index: { id: 'test-corpus' } },
	} as unknown as LoadableFromRequest<CorpusContext>;
	const corpus = { id: 'test-corpus', relations: { spans: {} } } as never;
	const customizationRegistry = createCustomizationRegistry(corpus);
	const scope = effectScope();
	scope.run(() => {
		startUrlSync(router, {
			blacklabApi: createMockApi().blacklabApi,
			corpusContext,
			indexId: ref('test-corpus'),
			searchForms,
			customizations: createCustomizations(customizationRegistry, corpus, {} as never, () => {}),
			beforeStateLoaded,
		});
	});
	return { push, stop: () => scope.stop() };
}

function createEmptyFormRuntime() {
	const builder = new FormBuilder({
		corpus: { indexId: 'test-corpus', textDirection: 'ltr' },
		translate: createMockTranslate(),
	});
	builder.newForm('search.simple', ContainerRenderer, {});
	return new FormRuntime(builder);
}

function createLateFilterFormRuntime() {
	const builder = new FormBuilder({
		corpus: { indexId: 'test-corpus', textDirection: 'ltr' },
		translate: createMockTranslate(),
	});
	const field = builder.newField('late-custom-field', filterTextController, TextField, {
		displayName: 'Late custom field',
		metadataFieldId: 'late-custom-field',
	});
	builder.newForm('search.simple', ContainerRenderer, {}).addChildren(field);
	return { field, runtime: new FormRuntime(builder) };
}

afterEach(() => {
	parserGet.mockReset();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('URL state sync', () => {
	test('runs hooks before parsing URL state', async () => {
		const calls: string[] = [];
		const beforeStateLoaded = vi.fn(() => {
			calls.push('hook');
			return Promise.resolve();
		});
		parserGet.mockImplementation(() => {
			calls.push('parser');
			return Promise.resolve({ interface: { viewedResults: null }, newForm: null });
		});
		const { stop } = startTestUrlSync(shallowRef(null), beforeStateLoaded);

		await nextTick();
		await Promise.resolve();

		expect(calls).toEqual(['hook', 'parser']);
		stop();
	});

	test('does not restart an in-flight initial URL read when the form definition changes', async () => {
		parserGet.mockReturnValue(new Promise(() => undefined));
		const searchForms = shallowRef<FormRuntime | null>({ definition: {} } as FormRuntime);
		const { stop } = startTestUrlSync(searchForms);

		await nextTick();
		expect(parserGet).toHaveBeenCalledTimes(1);

		searchForms.value = { definition: {} } as FormRuntime;
		await nextTick();

		expect(parserGet).toHaveBeenCalledTimes(1);
		stop();
	});

	test('preserves late custom-field state until a replacement form can restore it', async () => {
		window.history.replaceState(null, '');
		InterfaceStore.actions.viewedResults(null);
		parserGet.mockResolvedValue({ interface: { viewedResults: 'hits' }, newForm: null });
		const replace = vi.spyOn(RootStore.actions, 'replace').mockImplementation(() => {
			InterfaceStore.actions.viewedResults('hits');
		});
		const searchForms = shallowRef(createEmptyFormRuntime());
		const { push, stop } = startTestUrlSync(searchForms, () => Promise.resolve(), {
			'f.form': 'search.simple',
			'f.late-custom-field': 'saved',
			filter: 'late-custom-field:(saved)',
			patt: '[word="water"]',
		});

		try {
			await vi.waitFor(() => expect(replace).toHaveBeenCalled());
			await nextTick();
			await nextTick();

			expect(push).not.toHaveBeenCalled();

			const replacement = createLateFilterFormRuntime();
			searchForms.value = replacement.runtime;
			await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(2));

			expect(replacement.runtime.state.state.value[replacement.field.id]).toEqual({ value: 'saved', caseSensitive: false });
			expect(replacement.runtime.state.rawOverrides.value).not.toHaveProperty('filter');
		} finally {
			stop();
			InterfaceStore.actions.viewedResults(null);
			window.history.replaceState(null, '');
		}
	});

	test('reads the URL again when the form definition changes after initial restoration', async () => {
		parserGet.mockResolvedValue({ interface: { viewedResults: null }, newForm: null });
		vi.spyOn(RootStore.actions, 'replace').mockImplementation(() => undefined);
		const searchForms = shallowRef<FormRuntime | null>(null);
		const { stop } = startTestUrlSync(searchForms);

		await nextTick();
		await Promise.resolve();
		expect(parserGet).toHaveBeenCalledTimes(1);

		searchForms.value = createEmptyFormRuntime();
		await nextTick();

		expect(parserGet).toHaveBeenCalledTimes(2);
		stop();
	});

	test('publishes accepted URL overrides with a submitted scoped form', async () => {
		parserGet.mockResolvedValue({ interface: { viewedResults: null }, newForm: null });
		const replace = vi.spyOn(RootStore.actions, 'replace').mockImplementation(() => undefined);
		const runtime = createEmptyFormRuntime();
		const { stop } = startTestUrlSync(shallowRef(runtime), () => Promise.resolve(), {
			'f.form': 'search.simple',
			patt: '[word="restored"]',
		});

		await vi.waitFor(() => expect(replace).toHaveBeenCalled());

		expect(replace).toHaveBeenCalledWith(
			expect.objectContaining({
				newForm: expect.objectContaining({ formId: 'search.simple', params: { patt: '[word="restored"]' } }),
			}),
		);
		stop();
	});

	test('does not infer a submitted form from a bare collocation discriminator', async () => {
		parserGet.mockResolvedValue({ interface: { viewedResults: null }, newForm: null });
		const replace = vi.spyOn(RootStore.actions, 'replace').mockImplementation(() => undefined);
		const { stop } = startTestUrlSync(shallowRef(createEmptyFormRuntime()), () => Promise.resolve(), {
			colltype: 'proximity',
			context: '5',
		});

		await vi.waitFor(() => expect(replace).toHaveBeenCalled());

		expect(replace).toHaveBeenCalledWith(expect.objectContaining({ newForm: null }));
		stop();
	});

	test('keeps collocation context out of global state only for a valid discriminator', async () => {
		vi.stubGlobal('CONTEXT_URL', '');
		const { default: ActualUrlStateParserSearch } = await vi.importActual<typeof UrlStateParserSearchModule>('@/url/url-state-parser-search');
		const dependencies = {
			globalResultsState: { pageSize: 20 },
		} as unknown as UrlStateParserSearchModule.UrlStateParserSearchDependencies;
		const restoredContext = (query: string) =>
			(
				new ActualUrlStateParserSearch(dependencies, new URI(query)) as unknown as {
					global: { context: number | string | null };
				}
			).global.context;

		expect(restoredContext('?colltype=proximity&context=5')).toBeNull();
		expect(restoredContext('?colltype=relsources&context=5')).toBeNull();
		expect(restoredContext('?colltype=invalid&context=5')).toBe(5);
		expect(restoredContext('?context=5')).toBe(5);
	});

	test('accepts a viewgroup without group-by for collocation URLs only', async () => {
		vi.stubGlobal('CONTEXT_URL', '');
		const { default: ActualUrlStateParserSearch } = await vi.importActual<typeof UrlStateParserSearchModule>('@/url/url-state-parser-search');
		const dependencies = { globalResultsState: { pageSize: 20 } } as unknown as UrlStateParserSearchModule.UrlStateParserSearchDependencies;
		const viewFor = (query: string) => {
			const parser = new ActualUrlStateParserSearch(dependencies, new URI(`/test-corpus/search/hits${query}`));
			return (parser as unknown as { view: (view: string) => ViewStore.ViewRootState }).view('hits');
		};

		expect(viewFor('?colltype=proximity&viewgroup=lemma%3Aship').viewGroup).toBe('lemma:ship');
		expect(viewFor('?viewgroup=lemma%3Aship').viewGroup).toBeNull();
		expect(viewFor('?colltype=proximity&scorertype=coll-salience').collocationScorer).toBe('coll-salience');
		expect(viewFor('?scorertype=coll-salience').collocationScorer).toBe('coll-dice');
	});

	test('serializes every effective collocation scalar and scoped form value through router sync', async () => {
		parserGet.mockResolvedValue({ interface: { viewedResults: null }, newForm: null });
		const replace = vi.spyOn(RootStore.actions, 'replace').mockImplementation(() => undefined);
		const view = ViewStore.getOrCreateModule('hits');
		view.actions.reset({ resetGroupBy: true });
		view.actions.groupDisplayMode('table');
		const baseParams = {
			patt: '[word="water"]',
			collpatt: '[word="sea"]',
			filter: 'author:Austen',
			field: 'contents__nl',
			searchfield: 'contents__nl',
			first: 0,
			number: 20,
			sample: 25,
			sampleseed: 123,
			colltype: 'proximity',
			context: '3:4',
			within: 's',
			reltype: 'dep',
			annotation: 'lemma',
			sensitive: true,
			scorertype: 'coll-dice',
		} satisfies EffectiveCollocationParameters;
		vi.spyOn(RootStore.get, 'blacklabParameters').mockImplementation(() => ({
			...baseParams,
			scorertype: view.getState().collocationScorer,
			sort: view.getState().sort ?? undefined,
			viewgroup: view.getState().viewGroup ?? undefined,
		}));
		QueryStore.actions.search({
			form: 'new',
			state: {
				formId: 'collocations.form',
				encoded: { 'f.form': 'collocations.form', 'f.collocations': 'saved' },
				issues: [],
				params: baseParams,
				summaries: [],
			},
		});
		InterfaceStore.actions.viewedResults('hits');
		const { push, stop } = startTestUrlSync(shallowRef(null));

		await vi.waitFor(() => expect(replace).toHaveBeenCalled());
		push.mockClear();
		view.actions.collocationScorer('coll-salience');
		view.actions.viewGroup('lemma:ship');
		view.actions.sort('-size');
		await vi.waitFor(() => expect(push).toHaveBeenCalled());

		expect(push.mock.calls.at(-1)?.[0]).toMatchObject({
			query: {
				patt: '[word="water"]',
				collpatt: '[word="sea"]',
				filter: 'author:Austen',
				field: 'contents__nl',
				searchfield: 'contents__nl',
				first: '0',
				number: '20',
				sample: '25',
				sampleseed: '123',
				sort: '-size',
				viewgroup: 'lemma:ship',
				colltype: 'proximity',
				context: '3:4',
				within: 's',
				reltype: 'dep',
				annotation: 'lemma',
				sensitive: 'true',
				scorertype: 'coll-salience',
				'f.form': 'collocations.form',
				'f.collocations': 'saved',
				groupDisplayMode: 'table',
			},
		});
		stop();
		QueryStore.actions.reset();
		InterfaceStore.actions.viewedResults(null);
	});
});
