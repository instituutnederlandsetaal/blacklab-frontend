// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest';

import * as RootStore from '@/app/state/root-store';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import type { CompiledFormStateWithSummaries } from '@/features/form';
import type { HistoryEntry } from '@/features/history/model/query-history-state';
import * as ExploreStore from '@/features/search/model/form/explore-state';
import * as FilterStore from '@/features/search/model/form/filter-state';
import * as GapStore from '@/features/search/model/form/gap-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as PatternStore from '@/features/search/model/form/pattern-state';
import * as QueryStore from '@/features/search/model/query-state';
import * as ViewStore from '@/features/search/model/results/view-state';

const corpus = { relations: { spans: {} } } as never;
const customizationRegistry = createCustomizationRegistry(corpus);
RootStore.setCustomizations(createCustomizations(customizationRegistry, corpus, {} as never));

function resetStores() {
	const context = {
		index: {
			allAnnotations: [],
			allAnnotationsMap: {},
			firstMainAnnotation: { id: 'word', uiType: 'text' },
			hasRelations: false,
			mainAnnotatedField: 'contents',
			parallelAnnotatedFields: [],
			parallelAnnotatedFieldsMap: {},
		},
	} as any as CorpusContext;
	InterfaceStore.actions.reset();
	ExploreStore.actions.reset();
	FilterStore.init({ index: undefined } as CorpusContext);
	PatternStore.init(context);
	QueryStore.init(context);
	ViewStore.init({} as CorpusContext);
}

afterEach(() => {
	vi.restoreAllMocks();
	resetStores();
});

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

	test('requests spans for a new-form submission that contains within-attribute controls', () => {
		resetStores();
		const snapshot: CompiledFormStateWithSummaries = {
			filter: null,
			formId: 'search.expert',
			encoded: { 'f.form': 'search.expert' },
			patt: '[word="water"]',
			resultPreset: { withSpans: true },
			searchfield: null,
			summaries: [],
		};

		RootStore.actions.searchFromSubmit(snapshot);

		expect(RootStore.get.blacklabParameters()?.withspans).toBe(true);
	});

	test('does not request spans when a new-form submission has no withSpans preset', () => {
		resetStores();
		const snapshot: CompiledFormStateWithSummaries = {
			filter: null,
			formId: 'search.expert',
			encoded: { 'f.form': 'search.expert' },
			patt: '[word="water"]',
			searchfield: null,
			summaries: [],
		};

		RootStore.actions.searchFromSubmit(snapshot);

		expect(RootStore.get.blacklabParameters()?.withspans).toBeUndefined();
	});

	test('derives legacy withspans from the submitted active filters, not registered controls', () => {
		resetStores();
		InterfaceStore.actions.form('search');
		InterfaceStore.actions.patternMode('expert');
		PatternStore.actions.expert.query('[word="water"]');
		FilterStore.actions.registerFilter({
			id: 'span:speech:person',
			componentName: 'filter-text',
			behaviourName: 'span-text',
			defaultDisplayName: 'Speaker',
			metadata: { name: 'speech', attribute: 'person' },
		});

		RootStore.actions.searchFromSubmit();
		expect(RootStore.get.blacklabParameters()?.withspans).toBeUndefined();

		FilterStore.actions.filterValue({ id: 'span:speech:person', value: 'Alice' });
		RootStore.actions.searchFromSubmit();
		expect(RootStore.get.blacklabParameters()).toMatchObject({
			patt: '([word="water"]) within <speech person="Alice"/>',
			withspans: true,
		});
	});

	test('lets an explicit legacy withspans customization override the new-form preset', () => {
		resetStores();
		vi.spyOn(customizationRegistry.legacyApi.value!.search.pattern, 'shouldAddWithSpans').mockReturnValue(false);
		const snapshot: CompiledFormStateWithSummaries = {
			filter: null,
			formId: 'search.expert',
			encoded: { 'f.form': 'search.expert' },
			patt: '[word="water"]',
			resultPreset: { withSpans: true },
			searchfield: null,
			summaries: [],
		};

		RootStore.actions.searchFromSubmit(snapshot);

		expect(RootStore.get.blacklabParameters()?.withspans).toBe(false);
	});

	test('lets an explicit legacy withspans customization enable spans without a form preset', () => {
		resetStores();
		vi.spyOn(customizationRegistry.legacyApi.value!.search.pattern, 'shouldAddWithSpans').mockReturnValue(true);
		const snapshot: CompiledFormStateWithSummaries = {
			filter: null,
			formId: 'search.expert',
			encoded: { 'f.form': 'search.expert' },
			patt: '[word="water"]',
			searchfield: null,
			summaries: [],
		};

		RootStore.actions.searchFromSubmit(snapshot);

		expect(RootStore.get.blacklabParameters()?.withspans).toBe(true);
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
