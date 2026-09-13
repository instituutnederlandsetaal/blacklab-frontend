// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test } from 'vitest';

import * as RootStore from '@/app/state/root-store';
import { searchFormIds } from '@/customization-api/shared/form/ids';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import * as ViewStore from '@/features/search/model/results/view-state';
import { createSubmittedSearch } from '@/features/search/model/submitted-search';

import { createTestBuilder, createTestRuntime } from './helpers';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

beforeEach(() => ViewStore.setPageSizePreference(() => GlobalResultsStore.getState().pageSize));

afterEach(() => {
	InterfaceStore.actions.reset();
});

test('submitting a restored pattern searches for the override without unrelated collocation parameters', () => {
	const builder = createTestBuilder();
	const form = builder.newForm(searchFormIds.searchForm('simple'), ContainerRenderer, {});
	const runtime = createTestRuntime(builder);
	runtime.state.rawOverrides.value.patt = '[word="restored"]';
	runtime.state.rawOverrides.value.collpatt = '[lemma="ignored"]';
	RootStore.setSubmittedSearch(createSubmittedSearch());
	const query = RootStore.actions.searchFromSubmit(runtime.compile(form.id));
	expect(query.params.patt).toBe('[word="restored"]');
	expect(InterfaceStore.get.viewedResults()).toBe('hits');
	expect(query.params).not.toHaveProperty('collpatt');
	expect(runtime.compile(form.id).params).not.toHaveProperty('collpatt');
});

test('submitting captures query and repeated form values independently of the editable snapshot', () => {
	const builder = createTestBuilder();
	const form = builder.newForm(searchFormIds.searchForm('simple'), ContainerRenderer, {});
	const snapshot = createTestRuntime(builder).compile(form.id);
	snapshot.params.patt = '[word="submitted"]';
	snapshot.encoded['f.tags'] = ['first', 'second'];
	const submitted = createSubmittedSearch();
	RootStore.setSubmittedSearch(submitted);
	RootStore.actions.searchFromSubmit(snapshot);

	snapshot.params.patt = '[word="edited"]';
	snapshot.encoded['f.tags'].push('third');
	snapshot.encoded['f.form'] = 'edited';

	expect(submitted.value?.params.patt).toBe('[word="submitted"]');
	expect(submitted.value?.form['f.tags']).toEqual(['first', 'second']);
	expect(submitted.value?.form['f.form']).toBe(form.id);
});
