import { createMockTranslate } from '@test/mocks/i18n';
import { describe, expect, test } from 'vitest';
import { shallowRef } from 'vue';

import { ContainerRenderer, filterTextController, FormBuilder, FormRuntime, TextField, type CompiledFormResult } from '@/features/form';
import { createSearchSummary, summarizeCompiledForm } from '@/features/search/model/search-summary';
import { createSubmittedFormRestoration, type SubmittedSearch } from '@/features/search/model/submitted-search';

function form(displayName = 'Author') {
	const builder = new FormBuilder({ corpus: { indexId: 'test', textDirection: 'ltr', isParallelCorpus: false }, translate: createMockTranslate() });
	builder.newForm('search', ContainerRenderer, {}).addChildren(builder.newField('author', filterTextController, TextField, { displayName, metadataFieldId: 'author' }));
	return new FormRuntime(builder);
}

describe('submitted search summary', () => {
	test('displays the submitted query while the draft changes, then updates on submission', () => {
		const submitted = shallowRef<SubmittedSearch>({ params: { filter: 'author:(saved)' }, form: { 'f.form': 'search', 'f.author': 'saved' } });
		const runtime = form();
		const restored = createSubmittedFormRestoration(submitted, runtime);
		const summary = createSearchSummary(submitted, restored);
		expect(summary.value.filter).toBe('Author: saved');
		runtime.state.replaceState(restored.value!.state);
		runtime.state.state.value.author = { value: 'draft', caseSensitive: false };
		expect(summary.value.filter).toBe('Author: saved');

		submitted.value = { params: { filter: 'author:(next)' }, form: { 'f.form': 'search', 'f.author': 'next' } };
		expect(summary.value.filter).toBe('Author: next');
	});

	test('restores persisted fields alongside a submitted pattern the form cannot represent', () => {
		const submitted: SubmittedSearch = {
			params: { patt: '[word="water"]', filter: 'author:(saved)' },
			form: { 'f.form': 'search', 'f.author': 'saved' },
		};
		const runtime = form();
		const restored = createSubmittedFormRestoration(submitted, runtime);
		const summary = createSearchSummary(submitted, restored);
		expect(summary.value).toEqual({ pattern: '[word="water"]', filter: 'Author: saved' });
		runtime.state.replaceState(restored.value!.state);
		expect(runtime.compile('search').params).toMatchObject({ patt: '[word="water"]', filter: 'author:(saved)' });
	});

	test('falls back to submitted text without a runtime and uses the available form labels', () => {
		const runtime = shallowRef<FormRuntime | null>(null);
		const submitted: SubmittedSearch = { params: { patt: '[]', filter: 'author:(saved)' }, form: { 'f.form': 'search', 'f.author': 'saved' } };
		const restored = createSubmittedFormRestoration(submitted, runtime);
		const summary = createSearchSummary(submitted, restored);
		expect(summary.value).toEqual({ pattern: '[]', filter: 'author:(saved)' });
		runtime.value = form();
		expect(summary.value.filter).toBe('Author: saved');
		runtime.value = form('Writer');
		expect(summary.value.filter).toBe('Writer: saved');
	});
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

describe('new-form query summary selectors', () => {
	test('selects summaries by their normalized output types', () => {
		const summary = summarizeCompiledForm(mixedSummaryForm());

		expect(summary.pattern).toBe('Pattern only: pattern, Multi-type: shared');
		expect(summary.filter).toBe('Filter only: filter, Multi-type: shared');
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
		const summary = summarizeCompiledForm(form);

		expect(summary.pattern).toBe('Word: ship · Collocate: Any collocate · Window: L5/R5');
	});
});
