// @vitest-environment jsdom

import { afterEach, describe, expect, test } from 'vitest';

import type { CompiledFormResult } from '@/features/form';
import { actions, getState, type HistoryEntry } from '@/features/history/model/query-history-state';
import * as QueryStore from '@/features/search/model/query-state';

afterEach(() => {
	actions.clear();
	QueryStore.actions.reset();
});

const mixedSummaries: CompiledFormResult['summaries'] = [
	{ label: 'Frontend only', summaryType: [], value: 'frontend' },
	{ label: 'Pattern only', summaryType: ['patt'], value: 'pattern' },
	{ label: 'Filter only', summaryType: ['filter'], value: 'filter' },
	{ label: 'Multi-type', summaryType: ['patt', 'filter'], value: 'shared' },
];

function mixedSummaryForm(): CompiledFormResult {
	return {
		encoded: { 'f.form': 'search.form' },
		formId: 'search.form',
		params: { filter: 'author:Austen', patt: '[word="water"]' },
		issues: [],
		summaries: mixedSummaries,
	};
}

function historyEntry(newForm: CompiledFormResult): HistoryEntry {
	return {
		explore: {},
		filters: {},
		gap: {},
		global: {},
		interface: { form: 'search', viewedResults: 'hits' },
		newForm,
		patterns: { shared: { source: null } },
		view: { groupBy: [] },
	} as unknown as HistoryEntry;
}

describe('new-form query summary selectors', () => {
	test('selects summaries by their normalized output types', () => {
		QueryStore.actions.search({ form: 'new', state: mixedSummaryForm() });

		expect(QueryStore.get.patternSummary()).toBe('Pattern only: pattern, Multi-type: shared');
		expect(QueryStore.get.filterSummary()).toBe('Filter only: filter, Multi-type: shared');
	});

	test('combines the researcher-facing collocation settings', () => {
		const form = mixedSummaryForm();
		form.params = {
			annotation: 'word',
			colltype: 'proximity',
			context: 5,
			patt: '[word="ship"]',
			scorertype: 'coll-dice',
			sensitive: false,
		};
		form.summaries = [
			{ label: 'Word', summaryType: ['patt'], value: 'ship' },
			{ label: 'Collocate', summaryType: ['collpatt'], value: 'Any collocate' },
			{ label: 'Window', summaryType: ['context'], value: 'L5/R5' },
			{ label: 'Documents', summaryType: ['filter'], value: 'year:1800-1900' },
		];
		QueryStore.actions.search({ form: 'new', state: form });

		expect(QueryStore.get.patternSummary()).toBe('Word: ship · Collocate: Any collocate · Window: L5/R5');
	});
});

describe('new-form query history summaries', () => {
	test('hashes grouping criteria without changing their semantic order', () => {
		const first = historyEntry(mixedSummaryForm());
		first.view.groupBy = ['field:z', 'field:a'];

		actions.addEntry({ entry: first, pattern: first.newForm!.params.patt, url: '/test-corpus/search/hits' });

		expect(first.view.groupBy).toEqual(['field:z', 'field:a']);
		expect(getState()[0]?.view.groupBy).toEqual(['field:z', 'field:a']);

		const second = historyEntry(mixedSummaryForm());
		second.view.groupBy = ['field:a', 'field:z'];
		actions.addEntry({ entry: second, pattern: second.newForm!.params.patt, url: '/test-corpus/search/hits' });

		expect(getState()).toHaveLength(1);
		expect(getState()[0]?.view.groupBy).toEqual(['field:a', 'field:z']);
	});

	test('uses submitted Explore summaries instead of the legacy draft defaults', () => {
		const newForm: CompiledFormResult = {
			encoded: { 'f.form': 'explore.ngram' },
			formId: 'explore.ngram',
			params: { patt: '[] []' },
			issues: [],
			summaries: [
				{ label: 'N-gram type', summaryType: ['patt'], value: 'Lemma' },
				{ label: 'N-gram size', summaryType: ['patt'], value: '2' },
				{ label: 'Author', summaryType: ['filter'], value: 'Austen' },
			],
		};
		const entry = {
			explore: {},
			filters: {},
			gap: {},
			global: {},
			interface: { exploreMode: 'ngram', form: 'explore', viewedResults: 'hits' },
			newForm,
			patterns: { shared: { source: null } },
			view: { groupBy: [] },
		} as unknown as HistoryEntry;

		actions.addEntry({ entry, pattern: newForm.params.patt, url: '/test-corpus/search/hits' });

		expect(getState()[0]?.displayValues.pattern).toBe('N-gram type: Lemma, N-gram size: 2');
		expect(getState()[0]?.displayValues.filters).toBe('Author: Austen');
	});

	test('selects history summaries by their normalized output types', () => {
		const newForm = mixedSummaryForm();

		actions.addEntry({ entry: historyEntry(newForm), pattern: newForm.params.patt, url: '/test-corpus/search/hits' });

		expect(getState()[0]?.displayValues.pattern).toBe('Pattern only: pattern, Multi-type: shared');
		expect(getState()[0]?.displayValues.filters).toBe('Filter only: filter, Multi-type: shared');
	});

	test('retains the defining collocation settings in history', () => {
		const newForm = mixedSummaryForm();
		newForm.params = { annotation: 'lemma', colltype: 'proximity', context: '3:4', patt: '[word="water"]', scorertype: 'coll-salience', sensitive: false };
		newForm.summaries = [
			{ label: 'Keyword', summaryType: ['patt'], value: '[word="water"]' },
			{ label: 'Collocates', summaryType: ['collpatt'], value: 'Any collocate' },
			{ label: 'Window', summaryType: ['context'], value: 'L3/R4' },
			{ label: 'Annotation', summaryType: ['annotation'], value: 'Lemma' },
			{ label: 'Documents', summaryType: ['filter'], value: 'Author: Austen' },
		];

		actions.addEntry({ entry: historyEntry(newForm), pattern: newForm.params.patt, url: '/test-corpus/search/hits' });

		expect(getState()[0]?.displayValues.pattern).toBe('Keyword: [word="water"] · Collocates: Any collocate · Window: L3/R4 · Annotation: Lemma');
		expect(getState()[0]?.displayValues.filters).toBe('Documents: Author: Austen');
	});
});
