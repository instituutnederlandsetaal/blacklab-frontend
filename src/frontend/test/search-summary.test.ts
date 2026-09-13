import { createMockTranslate } from '@test/mocks/i18n';
import { describe, expect, test } from 'vitest';
import { shallowRef } from 'vue';

import { ContainerRenderer, filterTextController, FormBuilder, FormRuntime, TextField } from '@/features/form';
import { createSearchSummary } from '@/features/search/model/search-summary';
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
		expect(restored.value?.state.state.author).toEqual({ value: 'saved', caseSensitive: false });

		submitted.value = { params: { filter: 'author:(next)' }, form: { 'f.form': 'search', 'f.author': 'next' } };
		expect(summary.value.filter).toBe('Author: next');
		expect(restored.value?.state.state.author).toEqual({ value: 'next', caseSensitive: false });
		expect(restored.value?.submittedResult?.params.filter).toBe('author:(next)');
	});

	test('restores persisted fields alongside a submitted pattern the form cannot represent', () => {
		const submitted: SubmittedSearch = {
			params: { patt: '[word="water"]', filter: 'author:(saved)' },
			form: { 'f.form': 'search', 'f.author': 'saved' },
		};
		const restored = createSubmittedFormRestoration(submitted, form());
		const summary = createSearchSummary(submitted, restored);
		expect(summary.value).toEqual({ pattern: '[word="water"]', filter: 'Author: saved' });
		expect(restored.value?.state.state.author).toEqual({ value: 'saved', caseSensitive: false });
		expect(restored.value?.state.rawOverrides.patt).toBe('[word="water"]');
		expect(restored.value?.submittedResult?.params).toMatchObject({ patt: '[word="water"]', filter: 'author:(saved)' });
	});

	test('falls back to submitted text without a runtime and uses the available form labels', () => {
		const runtime = shallowRef<FormRuntime | null>(null);
		const submitted: SubmittedSearch = { params: { patt: '[]', filter: 'author:(saved)' }, form: { 'f.form': 'search', 'f.author': 'saved' } };
		const restored = createSubmittedFormRestoration(submitted, runtime);
		const summary = createSearchSummary(submitted, restored);
		expect(summary.value).toEqual({ pattern: '[]', filter: 'author:(saved)' });
		expect(restored.value).toBeNull();
		runtime.value = form();
		expect(summary.value.filter).toBe('Author: saved');
		expect(restored.value?.state.state.author).toEqual({ value: 'saved', caseSensitive: false });
		runtime.value = form('Writer');
		expect(summary.value.filter).toBe('Writer: saved');
	});
});
