// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest';

import * as RootStore from '@/app/state/root-store';
import * as UIStore from '@/app/state/ui-state';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import type { CollocationParams, CompiledFormResult, FormParams } from '@/features/form';
import type { HistoryEntry } from '@/features/history/model/query-history-state';
import * as ExploreStore from '@/features/search/model/form/explore-state';
import * as FilterStore from '@/features/search/model/form/filter-state';
import * as GapStore from '@/features/search/model/form/gap-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as PatternStore from '@/features/search/model/form/pattern-state';
import { handoffCompiledForm } from '@/features/search/model/new-form/form-state-bridge';
import * as QueryStore from '@/features/search/model/query-state';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import { isEffectiveCollocationParameters } from '@/features/search/model/results/result-types';
import * as ViewStore from '@/features/search/model/results/view-state';

const corpus = { allMetadataFields: [], relations: { spans: {} } } as never;
const customizationRegistry = createCustomizationRegistry(corpus);
const customizations = createCustomizations(customizationRegistry, corpus, UIStore.getState, UIStore.actions.results.shared.concordanceAnnotationId);
RootStore.setCustomizations(customizations);

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
	PatternStore.init(context, customizations);
	QueryStore.init(context, customizations);
	ViewStore.init({} as CorpusContext);
	GlobalResultsStore.init({} as CorpusContext);
}

function snapshot(params: FormParams, extra: Partial<CompiledFormResult> = {}): CompiledFormResult {
	return {
		formId: 'search.form',
		encoded: { 'f.form': 'search.form' },
		issues: [],
		params,
		summaries: [],
		...extra,
	};
}

function submitNewForm(result: CompiledFormResult) {
	RootStore.actions.searchFromSubmit(result);
}

function collocationParams(params: Partial<CollocationParams> = {}): CollocationParams {
	return {
		patt: '[word="water"]',
		colltype: 'proximity',
		context: 5,
		annotation: 'lemma',
		sensitive: false,
		scorertype: 'coll-dice',
		...params,
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	resetStores();
});

describe('compiled-form result handoff', () => {
	test('applies compiled grouping, sorting, table mode, and preferred view on fresh submit', () => {
		resetStores();
		const submitted = snapshot(
			{ group: 'field:date', sort: 'field:author' },
			{
				formId: 'explore.corpora',
				encoded: { 'f.form': 'explore.corpora' },
				resultPreset: 'tokens',
				targetView: 'docs',
			},
		);

		submitNewForm(submitted);

		expect(InterfaceStore.get.viewedResults()).toBe('docs');
		expect(ViewStore.getOrCreateModule('docs').getState()).toMatchObject({
			groupBy: ['field:date'],
			groupDisplayMode: 'tokens',
			sort: 'field:author',
		});
		expect(QueryStore.getState()).toMatchObject({ form: 'new', state: submitted });
	});

	test('honors a preferred docs view even when patt is present', () => {
		resetStores();

		submitNewForm(snapshot({ patt: '[word="water"]' }, { targetView: 'docs' }));

		expect(InterfaceStore.get.viewedResults()).toBe('docs');
	});

	test('falls back to patt-based view selection when no target preference exists', () => {
		resetStores();
		submitNewForm(snapshot({ patt: '[word="water"]' }));
		expect(InterfaceStore.get.viewedResults()).toBe('hits');

		submitNewForm(snapshot({}));
		expect(InterfaceStore.get.viewedResults()).toBe('docs');
	});

	test('reapplies form-owned result state on an unchanged submit', () => {
		resetStores();
		const submitted = snapshot({ group: 'field:submitted', sort: 'field:submitted' }, { targetView: 'docs', resultPreset: 'table' });
		submitNewForm(submitted);
		const view = ViewStore.getOrCreateModule('docs');
		const pageSize = view.getState().number;
		view.actions.groupBy(['field:manual']);
		view.actions.viewGroup('field:manual');
		view.actions.sort('field:manual');
		view.actions.groupDisplayMode('docs');
		view.actions.range({ first: 40, number: 10 });
		view.actions.setRequestedRange({ first: 40, number: 10 });
		InterfaceStore.actions.viewedResults('hits');

		submitNewForm(submitted);

		expect(InterfaceStore.get.viewedResults()).toBe('docs');
		expect(view.getState()).toMatchObject({
			groupBy: ['field:submitted'],
			sort: 'field:submitted',
			groupDisplayMode: 'table',
			first: 0,
			number: pageSize,
			requestedRange: null,
			viewGroup: null,
		});
		expect(QueryStore.getState()).toMatchObject({ form: 'new', state: submitted });
	});

	test('preserves manual grouping, sorting, and display mode when the form does not own them', () => {
		resetStores();
		const submitted = snapshot({ patt: '[word="water"]' }, { targetView: 'hits' });
		handoffCompiledForm(submitted);
		const view = ViewStore.getOrCreateModule('hits');
		const pageSize = view.getState().number;
		view.actions.groupBy(['field:manual']);
		view.actions.sort('field:manual');
		view.actions.groupDisplayMode('docs');
		view.actions.range({ first: 40, number: 10 });
		view.actions.setRequestedRange({ first: 40, number: 10 });

		handoffCompiledForm(submitted);

		expect(view.getState()).toMatchObject({
			groupBy: ['field:manual'],
			sort: 'field:manual',
			groupDisplayMode: 'docs',
			first: 0,
			number: pageSize,
			requestedRange: null,
		});
	});

	test('applies form-owned settings again when compiled params change', () => {
		resetStores();
		handoffCompiledForm(snapshot({ group: 'field:first' }, { targetView: 'docs' }));
		const view = ViewStore.getOrCreateModule('docs');
		view.actions.groupBy(['field:live']);

		handoffCompiledForm(snapshot({ group: 'field:second' }, { targetView: 'docs' }));

		expect(view.getState().groupBy).toEqual(['field:second']);
	});

	test('ignores stale legacy split-batch state for a new-form submit', () => {
		resetStores();
		InterfaceStore.actions.form('search');
		InterfaceStore.actions.patternMode('extended');
		PatternStore.actions.extended.splitBatch(true);
		const submitted = snapshot({ patt: '[word="water"]' });

		submitNewForm(submitted);

		expect(QueryStore.getState()).toMatchObject({ form: 'new', state: submitted });
	});

	test('requests spans from the compiled withspans parameter', () => {
		resetStores();

		submitNewForm(snapshot({ patt: '[word="water"]', withspans: true }));

		expect(RootStore.get.blacklabParameters()?.withspans).toBe(true);
	});

	test('does not request spans when compiled params omit withspans', () => {
		resetStores();

		submitNewForm(snapshot({ patt: '[word="water"]' }));

		expect(RootStore.get.blacklabParameters()?.withspans).toBeUndefined();
	});

	test('derives legacy withspans from submitted active filters, not registered controls', () => {
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

	test('lets an explicit legacy withspans customization override compiled withspans', () => {
		resetStores();
		vi.spyOn(customizationRegistry.legacyApi.value!.search.pattern, 'shouldAddWithSpans').mockReturnValue(false);

		submitNewForm(snapshot({ patt: '[word="water"]', withspans: true }));

		expect(RootStore.get.blacklabParameters()?.withspans).toBe(false);
	});

	test('lets an explicit legacy withspans customization enable spans without a compiled value', () => {
		resetStores();
		vi.spyOn(customizationRegistry.legacyApi.value!.search.pattern, 'shouldAddWithSpans').mockReturnValue(true);

		submitNewForm(snapshot({ patt: '[word="water"]' }));

		expect(RootStore.get.blacklabParameters()?.withspans).toBe(true);
	});

	test('keeps legacy Documents result handling separate from compiled-form handoff', () => {
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

	test('keeps restored live view state instead of reapplying the submit preset', () => {
		resetStores();
		const submitted = snapshot(
			{ group: 'field:submitted' },
			{
				formId: 'explore.corpora',
				encoded: { 'f.form': 'explore.corpora' },
				resultPreset: 'table',
				targetView: 'docs',
			},
		);
		const persistedView = {
			...ViewStore.initialViewState,
			groupBy: ['field:changed-later'],
			groupDisplayMode: 'docs' as const,
			sort: 'field:title',
		};
		const historyEntry = {
			explore: ExploreStore.defaults,
			filters: {},
			gap: GapStore.defaults,
			global: { context: null, sampleMode: 'percentage', sampleSeed: null, sampleSize: null },
			interface: { ...InterfaceStore.defaults, form: 'explore', exploreMode: 'corpora', viewedResults: 'docs' },
			newForm: submitted,
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

	test('constructs explicit effective collocation parameters with compiled context ownership', () => {
		resetStores();
		GlobalResultsStore.actions.context(9);
		GlobalResultsStore.actions.sampleMode('count');
		GlobalResultsStore.actions.sampleSize(7);
		GlobalResultsStore.actions.sampleSeed(123);

		submitNewForm(
			snapshot(
				collocationParams({
					collpatt: '[word="sea"]',
					filter: 'author:Austen',
					searchfield: 'contents__nl',
					context: '3:4',
					within: 's',
					annotation: 'word',
					sensitive: true,
					scorertype: 'coll-salience',
					sort: '-size',
				}),
				{ targetView: 'docs', resultPreset: 'table' },
			),
		);

		const params = RootStore.get.blacklabParameters();
		expect(isEffectiveCollocationParameters(params)).toBe(true);
		expect(params).toMatchObject({
			patt: '[word="water"]',
			collpatt: '[word="sea"]',
			filter: 'author:Austen',
			field: 'contents__nl',
			searchfield: 'contents__nl',
			colltype: 'proximity',
			context: '3:4',
			within: 's',
			annotation: 'word',
			sensitive: true,
			scorertype: 'coll-salience',
			samplenum: 7,
			sampleseed: 123,
			sort: '-size',
		});
		expect(params).not.toHaveProperty('group');
		expect(params).not.toHaveProperty('viewgroup');
		expect(params).not.toHaveProperty('pattgapdata');
		expect(params).not.toHaveProperty('adjusthits');
		expect(params).not.toHaveProperty('withspans');
		expect(InterfaceStore.get.viewedResults()).toBe('hits');
		expect(ViewStore.getOrCreateModule('hits').getState()).toMatchObject({ groupBy: [], viewGroup: null, sort: '-size', groupDisplayMode: 'table' });
	});

	test('clears stale ordinary result state on a fresh collocation submit', () => {
		resetStores();
		const view = ViewStore.getOrCreateModule('hits');
		view.actions.groupBy(['field:author']);
		view.actions.viewGroup('author:Austen');
		view.actions.sort('field:title');

		submitNewForm(snapshot(collocationParams(), { resultPreset: 'table' }));

		expect(view.getState()).toMatchObject({ groupBy: [], viewGroup: null, sort: null, groupDisplayMode: 'table' });
	});

	test('rejects collocations without an executable pattern or outside the proximity gate', () => {
		resetStores();
		submitNewForm(snapshot(collocationParams({ patt: undefined })));
		expect(RootStore.get.blacklabParameters()).toBeUndefined();

		submitNewForm(snapshot(collocationParams({ colltype: 'relsources', context: undefined })));
		expect(RootStore.get.blacklabParameters()).toBeUndefined();
	});

	test('forces restored collocations to a sanitized copied hits view while preserving sort', () => {
		resetStores();
		const submitted = snapshot(collocationParams({ sort: '-size' }), { targetView: 'docs', resultPreset: 'table' });
		const persistedView = {
			...ViewStore.initialViewState,
			groupBy: ['field:author'],
			viewGroup: 'author:Austen',
			groupDisplayMode: 'docs' as const,
			sort: '-size',
		};
		const historyEntry = {
			explore: ExploreStore.defaults,
			filters: {},
			gap: GapStore.defaults,
			global: { context: 9, sampleMode: 'percentage', sampleSeed: null, sampleSize: null },
			interface: { ...InterfaceStore.defaults, viewedResults: 'docs' },
			newForm: submitted,
			patterns: PatternStore.defaults,
			view: persistedView,
		} satisfies HistoryEntry;

		RootStore.actions.replace(historyEntry);

		expect(InterfaceStore.get.viewedResults()).toBe('hits');
		expect(ViewStore.getOrCreateModule('hits').getState()).toMatchObject({ groupBy: [], viewGroup: null, sort: '-size', groupDisplayMode: 'docs' });
		expect(persistedView).toMatchObject({ groupBy: ['field:author'], viewGroup: 'author:Austen' });
		expect(RootStore.get.blacklabParameters()).not.toHaveProperty('group');
		expect(RootStore.get.blacklabParameters()).toMatchObject({ context: 5, sort: '-size' });
	});
});
