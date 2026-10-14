// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, test } from 'vitest';
import { effectScope, nextTick, type EffectScope } from 'vue';

import * as RootStore from '@/app/state/root-store';
import * as UIStore from '@/app/state/ui-state';
import { createCorpusContext } from '@/app/state/useCorpusContext';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import { searchFormIds } from '@/customization-api/shared/form/ids';
import type { CompiledFormResult } from '@/features/form';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import { createSearchFormSystem } from '@/features/search/model/new-form/search-form-system';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import * as ViewStore from '@/features/search/model/results/view-state';
import { createSubmittedSearch, restoreSubmittedForm, submittedSearchFromResult } from '@/features/search/model/submitted-search';

import { createCorpus, resetSearchFormConfig } from './search-form-fixture';

import QueryForm from '@/pages/search/form/QueryForm.vue';

const scopes: EffectScope[] = [];
const wrappers: VueWrapper[] = [];
afterEach(() => {
	wrappers.splice(0).forEach(wrapper => wrapper.unmount());
	scopes.splice(0).forEach(scope => scope.stop());
	InterfaceStore.actions.reset();
	GlobalResultsStore.actions.useNewSearchForm(false);
});

async function mountSearchForm() {
	ViewStore.setPageSizePreference(() => GlobalResultsStore.getState().pageSize);
	const submitted = createSubmittedSearch();
	RootStore.setSubmittedSearch(submitted);
	const api = createMockApi({
		blacklab: { getCorpus: createCorpus() },
		frontend: {
			getConfig: {
				analytics: { google: null, plausible: null },
				bannerMessage: null,
				customCss: {},
				customJs: {},
				displayName: null,
				faviconDir: '',
				footerMessage: null,
				navbarLinks: [],
				pageSize: null,
			},
			getTagset: undefined,
		},
	});
	const scope = effectScope();
	scopes.push(scope);
	const { context, system } = scope.run(() => {
		const context = createCorpusContext(api.blacklabApi, api.frontendApi, 'test-corpus');
		const registry = createCustomizationRegistry(context.corpus);
		const customizations = createCustomizations(registry, context.corpus, UIStore.getState, () => {});
		RootStore.setCustomizations(customizations);
		context.beforePublish(state => {
			RootStore.init(state);
			resetSearchFormConfig();
		});
		const system = createSearchFormSystem({ blacklabApi: api.blacklabApi, corpus: context.corpus, customizations, translate: createMockTranslate() });
		return { context, system };
	})!;
	await flushPromises();
	expect(context.corpus.value?.id).toBe('test-corpus');
	GlobalResultsStore.actions.useNewSearchForm(true);
	const wrapper = mount(QueryForm, { global: { plugins: [api, context, system] } });
	wrappers.push(wrapper);
	return { wrapper, runtime: system.runtime.value!, submitted };
}

describe('search form submission', () => {
	test('submits user input through QueryForm and keeps the running query independent of later edits', async () => {
		const { wrapper, submitted } = await mountSearchForm();
		const input = wrapper.get('input[type="text"]');
		await input.setValue('water');
		await wrapper.get('form').trigger('submit');
		expect(InterfaceStore.get.viewedResults()).toBe('hits');
		expect(submitted.value?.params.patt).toBe('[word="water"]');
		expect(submitted.value?.form['f.form']).toBe(searchFormIds.searchForm('simple'));
		const snapshot = structuredClone(submitted.value);
		await input.setValue('ship');
		expect(submitted.value).toEqual(snapshot);
		await wrapper.get('form').trigger('submit');
		expect(submitted.value?.params.patt).toBe('[word="ship"]');
	});

	test('regression: submitting a restored pattern drops orphaned collocation parameters', async () => {
		const { wrapper, runtime, submitted } = await mountSearchForm();
		const restored = restoreSubmittedForm(runtime, {
			form: { 'f.form': searchFormIds.searchForm('simple') },
			params: { patt: '[word="restored"]', collpatt: '[lemma="ignored"]' },
		});
		runtime.state.replaceState(restored.state);
		await nextTick();
		await wrapper.get('form').trigger('submit');
		expect(InterfaceStore.get.viewedResults()).toBe('hits');
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
	const submitted = submittedSearchFromResult(result);
	result.params.patt = '[word="edited"]';
	(result.encoded['f.tags'] as string[]).push('third');
	result.encoded['f.form'] = 'edited';
	expect(submitted).toEqual({ params: { patt: '[word="submitted"]' }, form: { 'f.form': 'search.simple', 'f.tags': ['first', 'second'] } });
});
