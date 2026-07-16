// @vitest-environment jsdom

import { afterEach, describe, expect, test } from 'vitest';

import type { CompiledFormStateWithSummaries } from '@/features/form';
import { actions, getState, type HistoryEntry } from '@/features/history/model/query-history-state';

afterEach(() => actions.clear());

describe('new-form query history summaries', () => {
	test('uses submitted Explore summaries instead of the legacy draft defaults', () => {
		const newForm: CompiledFormStateWithSummaries = {
			encoded: { 'f.form': 'explore.ngram' },
			filter: null,
			formId: 'explore.ngram',
			patt: '[] []',
			searchfield: null,
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

		actions.addEntry({ entry, pattern: newForm.patt ?? undefined, url: '/test-corpus/search/hits' });

		expect(getState()[0]?.displayValues.pattern).toBe('N-gram type: Lemma, N-gram size: 2');
		expect(getState()[0]?.displayValues.filters).toBe('Author: Austen');
	});
});
