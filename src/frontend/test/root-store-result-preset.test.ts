// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ref, shallowRef } from 'vue';

import * as UIStore from '@/app/legacy-stores/ui-store';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import type { CollocationParams, CompiledFormResult, FormParams } from '@/features/form';
import { createLegacySearchStoreGlobals } from '@/interop/legacy-store-adapters/search';
import { createSearchFormBinding } from '@/pages/search/bindings/search-form-binding';
import { ResultsState } from '@/pages/search/model/results/results-state';
import { createSubmittedSearch } from '@/pages/search/model/submitted-search';

import { createCorpus } from './form/search-form-fixture';

const corpus = createCorpus();
const customizationRegistry = createCustomizationRegistry(corpus);
const customizations = createCustomizations(customizationRegistry, corpus, UIStore.getState, UIStore.actions.results.shared.concordanceAnnotationId);
const submittedSearch = createSubmittedSearch();

const results = new ResultsState({ corpus, submitted: submittedSearch.current, withSpans: customizations.searchWithSpans, debug: false }, ref(20));
const binding = createSearchFormBinding({ customizationsReady: true, beforeStateLoaded: async () => {}, submitted: submittedSearch, results, corpus, runtime: shallowRef(null) });
const searchFromSubmit = binding.submit;
function resetStores() {
	submittedSearch.reset();
	results.reset();
}

function snapshot(params: FormParams, extra: Partial<CompiledFormResult> = {}): CompiledFormResult {
	return {
		formId: 'search.form',
		encoded: { 'f.form': 'search.form' },
		issues: [],
		params,
		summaries: [],
		...extra,
	};
}

function collocationParams(params: Partial<CollocationParams> = {}): CollocationParams {
	return {
		patt: '[word="water"]',
		colltype: 'proximity',
		context: 5,
		annotation: 'lemma',
		sensitive: false,
		scorertype: 'coll-dice',
		...params,
	};
}

beforeEach(resetStores);
afterEach(() => vi.restoreAllMocks());

describe('compiled-form result handoff', () => {
	test('applies compiled grouping, sorting, table mode, and preferred view on fresh submit', () => {
		const submitted = snapshot(
			{ group: 'field:date', sort: 'field:author' },
			{
				formId: 'explore.corpora',
				encoded: { 'f.form': 'explore.corpora' },
				resultPreset: 'tokens',
				targetView: 'docs',
			},
		);

		const { root, interface: legacyInterface } = createLegacySearchStoreGlobals(results, binding, resetStores);
		const selection = legacyInterface.getState();
		root.actions.searchFromSubmit(submitted);

		expect(selection.viewedResults).toBe('docs');
		expect(legacyInterface.get.viewedResults()).toBe('docs');
		expect(root.get.viewedResultsSettings()).toMatchObject({
			groupBy: ['field:date'],
			groupDisplayMode: 'tokens',
			sort: 'field:author',
		});
		expect(root.get.blacklabParameters()).toMatchObject(submitted.params);

		legacyInterface.actions.viewedResults('hits');
		expect(results.selectedViewName).toBe('hits');
		selection.viewedResults = 'custom';
		expect(root.get.viewedResultsSettings()).toMatchObject({ first: 0, number: results.settings.pageSize });
		selection.viewedResults = null;
		expect(root.get.viewedResultsSettings()).toBeNull();
	});

	test('honors a preferred docs view even when patt is present', () => {
		searchFromSubmit(snapshot({ patt: '[word="water"]' }, { targetView: 'docs' }));

		expect(results.selectedViewName).toBe('docs');
	});

	test('falls back to patt-based view selection when no target preference exists', () => {
		searchFromSubmit(snapshot({ patt: '[word="water"]' }));
		expect(results.selectedViewName).toBe('hits');

		searchFromSubmit(snapshot({}));
		expect(results.selectedViewName).toBe('docs');
	});

	test('reapplies form-owned result state on an unchanged submit', () => {
		const submitted = snapshot({ group: 'field:submitted', sort: 'field:submitted' }, { targetView: 'docs', resultPreset: 'table' });
		searchFromSubmit(submitted);
		const view = results.view('docs');
		const pageSize = view.state.number;
		view.setGroupBy(['field:manual']);
		view.setViewGroup('field:manual');
		view.state.sort = 'field:manual';
		view.state.groupDisplayMode = 'docs';
		view.setRange({ first: 40, number: 10 });
		results.selectView('hits');

		searchFromSubmit(submitted);

		expect(results.selectedViewName).toBe('docs');
		expect(view.state).toMatchObject({
			groupBy: ['field:submitted'],
			sort: 'field:submitted',
			groupDisplayMode: 'table',
			first: 0,
			number: pageSize,
			viewGroup: null,
		});
		expect(results.parameters.value).toMatchObject(submitted.params);
	});

	test('preserves manual grouping, sorting, and display mode when the form does not own them', () => {
		const submitted = snapshot({ patt: '[word="water"]' }, { targetView: 'hits' });
		searchFromSubmit(submitted);
		const view = results.view('hits');
		const pageSize = view.state.number;
		view.setGroupBy(['field:manual']);
		view.state.sort = 'field:manual';
		view.state.groupDisplayMode = 'docs';
		view.setRange({ first: 40, number: 10 });

		searchFromSubmit(submitted);

		expect(view.state).toMatchObject({
			groupBy: ['field:manual'],
			sort: 'field:manual',
			groupDisplayMode: 'docs',
			first: 0,
			number: pageSize,
		});
	});

	test.each([true, undefined] as const)('uses compiled withspans=%s for the result request', withspans => {
		searchFromSubmit(snapshot({ patt: '[word="water"]', withspans }));
		expect(results.parameters.value?.withspans).toBe(withspans);
	});

	test.each([
		[true, false],
		[undefined, true],
	] as const)('uses the explicit withspans customization over compiled %s', (compiled, customized) => {
		vi.spyOn(customizationRegistry.legacyApi.value!.search.pattern, 'shouldAddWithSpans').mockReturnValue(customized!);
		searchFromSubmit(snapshot({ patt: '[word="water"]', withspans: compiled }));
		expect(results.parameters.value?.withspans).toBe(customized);
	});

	test('constructs explicit effective collocation parameters with compiled context ownership', () => {
		results.setContext(9);
		results.setSampleMode('count');
		results.setSampleSize(7);
		results.setSampleSeed(123);

		searchFromSubmit(
			snapshot(
				collocationParams({
					collpatt: '[word="sea"]',
					filter: 'author:Austen',
					searchfield: 'contents__nl',
					context: '3:4',
					within: 's',
					annotation: 'word',
					sensitive: true,
					scorertype: 'coll-salience',
					sort: '-size',
				}),
				{ targetView: 'docs', resultPreset: 'table' },
			),
		);

		const params = results.parameters.value;
		expect(params).toMatchObject({
			patt: '[word="water"]',
			collpatt: '[word="sea"]',
			filter: 'author:Austen',
			field: 'contents__nl',
			searchfield: 'contents__nl',
			colltype: 'proximity',
			context: '3:4',
			within: 's',
			annotation: 'word',
			sensitive: true,
			scorertype: 'coll-salience',
			samplenum: 7,
			sampleseed: 123,
			sort: '-size',
		});
		expect(params).not.toHaveProperty('group');
		expect(params).not.toHaveProperty('viewgroup');
		expect(params).not.toHaveProperty('pattgapdata');
		expect(params).not.toHaveProperty('adjusthits');
		expect(params).not.toHaveProperty('withspans');
		expect(results.selectedViewName).toBe('hits');
		expect(results.view('hits').state).toMatchObject({ collocationScorer: 'coll-salience', groupBy: [], viewGroup: null, sort: '-size', groupDisplayMode: 'table' });
	});

	test('clears stale ordinary result state on a fresh collocation submit', () => {
		const view = results.view('hits');
		view.setCollocationScorer('coll-salience');
		view.setGroupBy(['field:author']);
		view.setViewGroup('author:Austen');
		view.state.sort = 'field:title';

		searchFromSubmit(snapshot(collocationParams(), { resultPreset: 'table' }));

		expect(view.state).toMatchObject({ collocationScorer: 'coll-dice', groupBy: [], viewGroup: null, sort: 'score', groupDisplayMode: 'table' });
	});

	test('rejects collocations without an executable pattern or outside the proximity gate', () => {
		searchFromSubmit(snapshot(collocationParams({ patt: undefined })));
		expect(results.parameters.value).toBeUndefined();

		searchFromSubmit(snapshot(collocationParams({ colltype: 'relsources', context: undefined })));
		expect(results.parameters.value).toBeUndefined();
	});
});
