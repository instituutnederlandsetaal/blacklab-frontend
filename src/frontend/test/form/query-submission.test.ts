// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { createMockCorpusContext } from '@test/mocks/corpus';
import { createMockTranslate } from '@test/mocks/i18n';
import { mount } from '@vue/test-utils';
import { describe, expect, onTestFinished, test } from 'vitest';
import { nextTick, ref } from 'vue';

import { searchFormIds } from '@/customization-api/shared/form/ids';
import type { CompiledFormResult } from '@/features/form';
import { createSearchFormBinding, provideSearchFormBinding, restoreSubmittedForm, submittedSearchFromResult } from '@/features/search/bindings/search-form';
import { ResultsState } from '@/features/search/model/results/results-state';
import { createSubmittedSearch } from '@/features/search/model/submitted-search';
import { createPageBootstrapContext } from '@/navigation/page-bootstrap';

import { createCorpus, createSearchFormFixture } from './search-form-fixture';

import QueryForm from '@/pages/search/form/QueryForm.vue';

function mountSearchForm() {
	const corpus = createCorpus();
	const api = createMockApi();
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
			plugins: [api, createMockCorpusContext({ corpus }), system, pageBootstrap, app => provideSearchFormBinding(app, { ...binding, loading: restoring })],
		},
	});
	onTestFinished(() => {
		wrapper.unmount();
		binding.stop();
		fixture.scope.stop();
	});
	return { wrapper, runtime: system.runtime.value!, submitted: submitted.current, results, pageBootstrap, restoring };
}

describe('search form submission', () => {
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
