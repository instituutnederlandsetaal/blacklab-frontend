// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { createMockCorpusContext } from '@test/mocks/corpus';
import { createMockTranslate } from '@test/mocks/i18n';
import { mount } from '@vue/test-utils';
import { describe, expect, onTestFinished, test, vi } from 'vitest';
import { nextTick, ref } from 'vue';

import { searchFormIds } from '@/customization-api/shared/form/ids';
import type { CompiledFormResult } from '@/features/form';
import { createSearchFormBinding, provideSearchFormBinding, restoreSubmittedForm, submittedSearchFromResult } from '@/features/search/bindings/search-form';
import { ResultsState, resultsStateKey } from '@/features/search/model/results/results-state';
import { createSubmittedSearch } from '@/features/search/model/submitted-search';
import { createPageBootstrapContext } from '@/navigation/page-bootstrap';

import { createCorpus, createSearchFormFixture, selectRenderedForm } from './search-form-fixture';

import { CancelableRequest } from '@/shared/api/lib/api-types';

import QueryForm from '@/pages/search/form/QueryForm.vue';

function mountSearchForm({ corpus = createCorpus(), api = createMockApi() } = {}) {
	const fixture = createSearchFormFixture();
	const system = fixture.createSystem({ corpus, blacklabApi: api.blacklabApi, translate: createMockTranslate() });
	const submitted = createSubmittedSearch();
	const results = new ResultsState({ corpus, submitted: submitted.current, withSpans: () => null, debug: false }, ref(20));
	const binding = createSearchFormBinding({ customizationsReady: true, beforeStateLoaded: async () => {}, submitted, results, corpus, runtime: system.runtime });
	const pageBootstrap = createPageBootstrapContext();
	pageBootstrap.changePage({ name: 'search', customScriptTiming: 'after-page-bootstrap' }, false);
	pageBootstrap.markScriptsReady();
	const restoring = ref(false);
	const wrapper = mount(QueryForm, {
		global: {
			provide: { [resultsStateKey]: results },
			plugins: [api, createMockCorpusContext({ corpus }), system, pageBootstrap, app => provideSearchFormBinding(app, { ...binding, loading: restoring })],
		},
	});
	onTestFinished(() => {
		binding.stop();
		fixture.scope.stop();
	});
	return { wrapper, runtime: system.runtime.value!, submitted: submitted.current, results, pageBootstrap, restoring };
}

describe('search form submission', () => {
	test('allows the user to cancel Explore on a large subcorpus', async () => {
		const corpus = createCorpus();
		corpus.tokenCount = 10_000_000;
		const { wrapper, runtime, submitted } = mountSearchForm({ corpus });
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
		onTestFinished(() => confirm.mockRestore());
		selectRenderedForm(runtime, searchFormIds.exploreForm('corpora'));
		await nextTick();
		await wrapper.get('form').trigger('submit');
		expect(confirm).toHaveBeenCalledOnce();
		expect(submitted.value).toBeUndefined();
		confirm.mockReturnValue(true);
		await wrapper.get('form').trigger('submit');
		expect(submitted.value?.form['f.form']).toBe(searchFormIds.exploreForm('corpora'));
	});

	test('counts the submitted filter and cancels the request when the form unmounts', async () => {
		vi.useFakeTimers();
		onTestFinished(() => {
			vi.useRealTimers();
		});
		const cancel = vi.fn();
		const api = createMockApi({ blacklab: { getDocs: () => new CancelableRequest(new Promise<never>(() => {}), cancel) } });
		const { wrapper, runtime, results } = mountSearchForm({ api });
		runtime.state.rawOverrides.value.filter = 'author:Austen';
		await nextTick();
		await vi.runOnlyPendingTimersAsync();
		expect(api.blacklabApi.getDocs).not.toHaveBeenCalled();

		await wrapper.get('form').trigger('submit');
		await vi.runOnlyPendingTimersAsync();
		expect(api.blacklabApi.getDocs).toHaveBeenCalledWith('test-corpus', expect.objectContaining({ filter: 'author:Austen' }));
		results.setPageSize(50);
		await nextTick();
		await vi.runOnlyPendingTimersAsync();
		expect(api.blacklabApi.getDocs).toHaveBeenCalledOnce();
		expect(cancel).not.toHaveBeenCalled();
		wrapper.unmount();
		expect(cancel).toHaveBeenCalledOnce();
	});

	test('keeps form controls inert until scripts and restoration settle', async () => {
		const { wrapper, pageBootstrap, restoring } = mountSearchForm();
		const formRoot = () => wrapper.get('.blf-form-system');
		pageBootstrap.setCustomScriptsSettled(false);
		await nextTick();
		expect(formRoot().attributes()).toHaveProperty('inert');

		restoring.value = true;
		pageBootstrap.setCustomScriptsSettled(true);
		await nextTick();
		expect(formRoot().attributes()).toHaveProperty('inert');

		restoring.value = false;
		await nextTick();
		expect(formRoot().attributes()).not.toHaveProperty('inert');
	});

	test('submits user input through QueryForm and keeps the running query independent of later edits', async () => {
		const { wrapper, submitted, results } = mountSearchForm();
		const input = wrapper.get('input[type="text"]');
		await input.setValue('water');
		await wrapper.get('form').trigger('submit');
		expect(results.selectedViewName).toBe('hits');
		expect(submitted.value?.params.patt).toBe('[word="water"]');
		expect(submitted.value?.form['f.form']).toBe(searchFormIds.searchForm('simple'));
		const snapshot = structuredClone(submitted.value);
		await input.setValue('ship');
		expect(submitted.value).toEqual(snapshot);
		await wrapper.get('form').trigger('submit');
		expect(submitted.value?.params.patt).toBe('[word="ship"]');
		await wrapper.get('form').trigger('reset');
		expect(submitted.value).toBeUndefined();
		expect(results.selectedViewName).toBeNull();
	});

	test('regression: submitting a restored pattern drops orphaned collocation parameters', async () => {
		const { wrapper, runtime, submitted, results } = mountSearchForm();
		const restored = restoreSubmittedForm(runtime, {
			form: { 'f.form': searchFormIds.searchForm('simple') },
			params: { patt: '[word="restored"]', collpatt: '[lemma="ignored"]' },
		});
		runtime.state.replaceState(restored.state);
		await nextTick();
		await wrapper.get('form').trigger('submit');
		expect(results.selectedViewName).toBe('hits');
		expect(submitted.value?.params.patt).toBe('[word="restored"]');
		expect(submitted.value?.params).not.toHaveProperty('collpatt');
	});
});

test('submitted search snapshots copy parameters and repeated form values', () => {
	const result: CompiledFormResult = {
		formId: 'search.simple',
		encoded: { 'f.form': 'search.simple', 'f.tags': ['first', 'second'] },
		params: { patt: '[word="submitted"]' },
		issues: [],
		summaries: [],
	};
	const submitted = createSubmittedSearch();
	submitted.replace(submittedSearchFromResult(result));
	result.params.patt = '[word="edited"]';
	(result.encoded['f.tags'] as string[]).push('third');
	result.encoded['f.form'] = 'edited';
	expect(submitted.current.value).toEqual({ params: { patt: '[word="submitted"]' }, form: { 'f.form': 'search.simple', 'f.tags': ['first', 'second'] } });
});
