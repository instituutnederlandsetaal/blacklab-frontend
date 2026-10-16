// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import * as UIStore from '@/app/state/ui-state';
import type { CorpusContext } from '@/app/state/useCorpusContext';

import { createCorpus } from './form/search-form-fixture';

afterEach(() => UIStore.init({ index: undefined } as CorpusContext));

it('keeps the removed split-batch customization callable without changing UI state', () => {
	const before = { ...UIStore.getState().search.extended };
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		UIStore.actions.search.extended.splitBatch.enable(false);
		expect(UIStore.getState().search.extended).toEqual(before);
		expect(warn).toHaveBeenCalledWith('Split-batch search has been removed.');
	} finally {
		warn.mockRestore();
	}
});

it('accepts custom result view configuration before the search runtime starts', async () => {
	const view = { id: 'custom-result-view', title: 'Custom results', component: 'CustomResults', customInitialState: null };
	try {
		UIStore.actions.results.addResultView(view);
		expect(UIStore.getState().results.customViews).toContainEqual(view);

		const views = await import('@/features/search/model/results/view-state');
		views.setPageSizePreference(25);
		expect(views.getOrCreateModule(view.id).getState().number).toBe(25);
	} finally {
		UIStore.actions.results.removeResultView(view.id);
	}
});

it('starts each corpus with its own defaults instead of retaining previous script settings', () => {
	const first = createCorpus();
	first.id = 'first';
	first.relations.spans = { p: { count: 1 } };
	UIStore.init({ index: first } as CorpusContext);

	// These remain valid identifiers in the next corpus, so validation alone cannot clear them.
	UIStore.actions.search.simple.searchAnnotationId('lemma');
	UIStore.actions.search.extended.searchAnnotationIds(['lemma']);
	UIStore.actions.search.advanced.enable(false);
	UIStore.actions.explore.searchAnnotationIds(['lemma']);
	UIStore.actions.results.shared.groupAnnotationIds(['lemma']);
	UIStore.actions.results.shared.concordanceAnnotationId('lemma');
	UIStore.actions.results.shared.detailedMetadataIds(['author']);
	UIStore.actions.results.shared.concordanceAsHtml(true);
	UIStore.actions.results.addResultView({ id: 'custom', title: 'Custom', component: 'CustomResults', customInitialState: null });
	UIStore.getState().results.hits.addons.push(() => ({ name: 'First corpus addon' }));
	UIStore.getState().global.errorMessage = () => 'First corpus error';

	const second = createCorpus();
	second.id = 'second';
	second.annotationGroups = [{ ...second.annotationGroups[0], entries: ['word', 'pos'], fields: [second.allAnnotationsMap.word, second.allAnnotationsMap.pos] }];
	second.metadataGroups = [second.metadataGroups[1]];
	second.fieldInfo.dateField = 'author';
	second.relations.spans = { s: { count: 1 } };
	UIStore.init({ index: second } as CorpusContext);

	const state = UIStore.getState();
	expect(state.search.simple.searchAnnotationId).toBe('word');
	expect(state.search.extended.searchAnnotationIds).toEqual(['word', 'pos']);
	expect(state.search.advanced).toMatchObject({ enabled: true, searchAnnotationIds: ['word', 'pos'], defaultSearchAnnotationId: 'word' });
	expect(state.search.shared.searchMetadataIds).toEqual(['genre']);
	expect(state.search.shared.within.elements.map(element => element.value)).toEqual(['', 's']);
	expect(state.search.shared.within.sentenceElement).toBe('s');
	expect(state.explore).toMatchObject({ searchAnnotationIds: ['word', 'pos'], defaultSearchAnnotationId: 'word', defaultGroupAnnotationId: 'word', defaultGroupMetadataId: 'genre' });
	expect(state.results.customViews.map(view => view.id)).toEqual(['hits', 'docs']);
	expect(state.results.hits.addons).toEqual([]);
	expect(state.results.docs.shownMetadataIds).toEqual(['author']);
	expect(state.results.shared).toMatchObject({ concordanceAnnotationId: 'word', concordanceAsHtml: false, detailedMetadataIds: null, groupAnnotationIds: ['word', 'pos'] });
	expect(state.global.errorMessage({ message: 'Current error' } as never, 'hits')).toBe('Current error');

	UIStore.actions.search.simple.searchAnnotationId('lemma');
	expect(state.search.simple.searchAnnotationId).toBe('lemma');
});
