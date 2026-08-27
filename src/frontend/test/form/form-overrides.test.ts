import { describe, expect, test } from 'vitest';

import type { CompiledFormResult } from '@/features/form';
import { searchTarget } from '@/features/form';
import { applySearchFormOverrides, extractSearchFormOverrides } from '@/features/search/model/new-form/form-overrides';

function compiled(params: CompiledFormResult['params']): CompiledFormResult {
	return {
		formId: 'search.form',
		params,
		encoded: { 'f.form': 'search.form' },
		issues: [],
		summaries: [],
	};
}

describe('search form override integration', () => {
	test('extracts the curated canonical request parameters and normalizes aliases', () => {
		const overrides = extractSearchFormOverrides(
			{
				query: ['', '[word="water"]'],
				filter: ['', 'author:Austen'],
				searchField: 'contents__nl',
				withspans: 'true',
				sensitive: 'false',
				group: 'field:author',
				sort: 'field:title',
				context: '9',
			},
			true,
		);

		expect(overrides).toEqual({
			patt: '[word="water"]',
			filter: 'author:Austen',
			searchfield: 'contents__nl',
			withspans: true,
			sensitive: false,
		});
	});

	test('omits searchfield for non-parallel corpora', () => {
		expect(extractSearchFormOverrides({ searchfield: 'contents__nl' }, false)).toEqual({});
	});

	test('applies only valid overrides accepted by the selected target without mutating compilation', () => {
		const result = compiled({ patt: '[word="draft"]', group: 'field:author' });
		const effective = applySearchFormOverrides(
			result,
			{
				patt: '[word="restored"]',
				filter: 'author:Austen',
				collpatt: '[lemma="ignored"]',
				searchfield: 42,
				withspans: false,
			},
			searchTarget.acceptedOutputs,
		);

		expect(result.params).toEqual({ patt: '[word="draft"]', group: 'field:author' });
		expect(effective.params).toEqual({ patt: '[word="restored"]', filter: 'author:Austen', group: 'field:author' });
	});
});
