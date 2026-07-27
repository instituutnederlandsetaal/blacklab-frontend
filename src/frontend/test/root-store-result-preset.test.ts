// @vitest-environment jsdom

import { afterEach, describe, expect, test } from 'vitest';

import * as RootStore from '@/app/state/root-store';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import type { CompiledFormStateWithSummaries } from '@/features/form';
import type { HistoryEntry } from '@/features/history/model/query-history-state';
import * as ExploreStore from '@/features/search/model/form/explore-state';
import * as GapStore from '@/features/search/model/form/gap-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as PatternStore from '@/features/search/model/form/pattern-state';
import * as QueryStore from '@/features/search/model/query-state';
import * as ViewStore from '@/features/search/model/results/view-state';

function resetStores() {
	const context = {
		index: {
			allAnnotations: [],
			allAnnotationsMap: {},
			firstMainAnnotation: { id: 'word', uiType: 'text' },
			mainAnnotatedField: 'contents',
			parallelAnnotatedFields: [],
			parallelAnnotatedFieldsMap: {},
		},
	} as any as CorpusContext;
	InterfaceStore.actions.reset();
	ExploreStore.actions.reset();
	PatternStore.init(context);
	QueryStore.init(context);
	ViewStore.init({} as CorpusContext);
}

afterEach(resetStores);

describe('root-store result presets', () => {
	test('applies a compiled preset to the selected view on fresh submit', () => {
		resetStores();
		const snapshot: CompiledFormStateWithSummaries = {
			filter: null,
			formId: 'explore.corpora',
			encoded: { 'f.form': 'explore.corpora' },
			patt: null,
			searchfield: null,
			summaries: [],
			resultPreset: {
				viewedResults: 'docs',
				groupBy: ['field:date'],
				groupDisplayMode: 'tokens',
				sort: 'field:author',
			},
		};

		RootStore.actions.searchFromSubmit(snapshot);

		expect(InterfaceStore.get.viewedResults()).toBe('docs');
		expect(ViewStore.getOrCreateModule('docs').getState()).toMatchObject({
			groupBy: ['field:date'],
			groupDisplayMode: 'tokens',
			sort: 'field:author',
		});
		expect(QueryStore.getState()).toMatchObject({ form: 'new', state: snapshot });
	});

	test('ignores stale legacy split-batch state for a new-form submit', () => {
		resetStores();
		InterfaceStore.actions.form('search');
		InterfaceStore.actions.patternMode('extended');
		PatternStore.actions.extended.splitBatch(true);
		const snapshot: CompiledFormStateWithSummaries = {
			filter: null,
			formId: 'search.simple',
			encoded: { 'f.form': 'search.simple' },
			patt: '[word="water"]',
			searchfield: null,
			summaries: [],
		};

		RootStore.actions.searchFromSubmit(snapshot);

		expect(QueryStore.getState()).toMatchObject({ form: 'new', state: snapshot });
	});

	test('keeps legacy Documents result handling separate from new-form presets', () => {
		resetStores();
		InterfaceStore.actions.form('explore');
		InterfaceStore.actions.exploreMode('corpora');
		ExploreStore.actions.corpora.groupBy('field:date');
		ExploreStore.actions.corpora.groupDisplayMode('tokens');

		RootStore.actions.searchFromSubmit();

		expect(InterfaceStore.get.viewedResults()).toBe('docs');
		expect(ViewStore.getOrCreateModule('docs').getState()).toMatchObject({
			groupBy: ['field:date'],
			groupDisplayMode: 'tokens',
			sort: null,
		});
	});

	test('keeps persisted view changes when restoring history instead of reapplying the submit preset', () => {
		resetStores();
		const snapshot: CompiledFormStateWithSummaries = {
			filter: null,
			formId: 'explore.corpora',
			encoded: { 'f.form': 'explore.corpora' },
			patt: null,
			searchfield: null,
			summaries: [],
			resultPreset: {
				viewedResults: 'docs',
				groupBy: ['field:submitted'],
				groupDisplayMode: 'table',
			},
		};
		const persistedView = {
			...ViewStore.initialViewState,
			groupBy: ['field:changed-later'],
			groupDisplayMode: 'docs',
			sort: 'field:title',
		};
		const historyEntry = {
			explore: ExploreStore.defaults,
			filters: {},
			gap: GapStore.defaults,
			global: { context: null, sampleMode: 'percentage', sampleSeed: null, sampleSize: null },
			interface: { ...InterfaceStore.defaults, form: 'explore', exploreMode: 'corpora', viewedResults: 'docs' },
			newForm: snapshot,
			patterns: PatternStore.defaults,
			view: persistedView,
		} satisfies HistoryEntry;

		RootStore.actions.replace(historyEntry);

		expect(ViewStore.getOrCreateModule('docs').getState()).toMatchObject({
			groupBy: ['field:changed-later'],
			groupDisplayMode: 'docs',
			sort: 'field:title',
		});
	});
});
