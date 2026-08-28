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
	{ label: 'Untyped', value: 'missing' },
	{ label: 'Empty', summaryType: [], value: 'empty' },
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
	test('includes untyped and multi-type summaries for each requested type', () => {
		QueryStore.actions.search({ form: 'new', state: mixedSummaryForm() });

		expect(QueryStore.get.patternSummary()).toBe('Untyped: missing, Empty: empty, Pattern only: pattern, Multi-type: shared');
		expect(QueryStore.get.filterSummary()).toBe('Untyped: missing, Empty: empty, Filter only: filter, Multi-type: shared');
	});
});

describe('new-form query history summaries', () => {
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

	test('includes untyped and multi-type summaries consistently in pattern and filter display values', () => {
		const newForm = mixedSummaryForm();

		actions.addEntry({ entry: historyEntry(newForm), pattern: newForm.params.patt, url: '/test-corpus/search/hits' });

		expect(getState()[0]?.displayValues.pattern).toBe('Untyped: missing, Empty: empty, Pattern only: pattern, Multi-type: shared');
		expect(getState()[0]?.displayValues.filters).toBe('Untyped: missing, Empty: empty, Filter only: filter, Multi-type: shared');
	});
});
