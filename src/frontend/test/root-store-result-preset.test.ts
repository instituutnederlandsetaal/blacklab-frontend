// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest';

import * as RootStore from '@/app/state/root-store';
import * as UIStore from '@/app/state/ui-state';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import type { CompiledFormResult, FormParams } from '@/features/form';
import type { HistoryEntry } from '@/features/history/model/query-history-state';
import * as ExploreStore from '@/features/search/model/form/explore-state';
import * as FilterStore from '@/features/search/model/form/filter-state';
import * as GapStore from '@/features/search/model/form/gap-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as PatternStore from '@/features/search/model/form/pattern-state';
import { handoffCompiledForm } from '@/features/search/model/new-form/form-state-bridge';
import * as QueryStore from '@/features/search/model/query-state';
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

	test('publishes and compares the effective compiled state', () => {
		resetStores();
		const effective = snapshot({ patt: '[word="restored"]', group: 'field:submitted' }, { targetView: 'hits' });

		submitNewForm(effective);
		expect(QueryStore.getState()).toMatchObject({ form: 'new', state: { params: { patt: '[word="restored"]', group: 'field:submitted' } } });

		const view = ViewStore.getOrCreateModule('hits');
		view.actions.groupBy(['field:changed-later']);
		submitNewForm(effective);

		expect(view.getState().groupBy).toEqual(['field:changed-later']);
	});

	test('does not reapply form-owned settings when compiled params are unchanged', () => {
		resetStores();
		submitNewForm(snapshot({ group: 'field:submitted', sort: 'field:submitted' }, { targetView: 'docs', resultPreset: 'table' }));
		const view = ViewStore.getOrCreateModule('docs');
		view.actions.groupBy(['field:changed-later']);
		view.actions.sort('field:changed-later');
		view.actions.groupDisplayMode('docs');

		submitNewForm(
			snapshot({ group: 'field:submitted', sort: 'field:submitted' }, { encoded: { 'f.form': 'search.form', 'f.changed': 'presentation-only' }, targetView: 'docs', resultPreset: 'table' }),
		);

		expect(view.getState()).toMatchObject({ groupBy: ['field:changed-later'], sort: 'field:changed-later', groupDisplayMode: 'docs' });
	});

	test('applies a changed result preset without resetting query view state', () => {
		resetStores();
		const params = { group: 'field:submitted', sort: 'field:submitted' };
		handoffCompiledForm(snapshot(params, { targetView: 'docs', resultPreset: 'table' }));
		const view = ViewStore.getOrCreateModule('docs');
		view.actions.groupBy(['field:live']);
		view.actions.sort('field:live');
		view.actions.range({ first: 40, number: 10 });
		view.actions.setRequestedRange({ first: 40, number: 10 });
		const submitted = snapshot(params, {
			encoded: { 'f.form': 'search.form', 'f.mode': 'tokens' },
			targetView: 'docs',
			resultPreset: 'tokens',
		});

		handoffCompiledForm(submitted);

		expect(view.getState()).toMatchObject({
			groupBy: ['field:live'],
			sort: 'field:live',
			first: 40,
			number: 10,
			requestedRange: { first: 40, number: 10 },
			groupDisplayMode: 'tokens',
		});
		expect(QueryStore.getState()).toMatchObject({ form: 'new', state: submitted });
	});

	test('applies a changed target view without resetting view state', () => {
		resetStores();
		const params = { patt: '[word="water"]' };
		handoffCompiledForm(snapshot(params, { targetView: 'docs', resultPreset: 'table' }));
		const hits = ViewStore.getOrCreateModule('hits');
		hits.actions.viewGroup('field:live');
		hits.actions.range({ first: 30, number: 10 });
		hits.actions.setRequestedRange({ first: 30, number: 10 });

		handoffCompiledForm(snapshot(params, { targetView: 'hits', resultPreset: 'table' }));

		expect(InterfaceStore.get.viewedResults()).toBe('hits');
		expect(hits.getState()).toMatchObject({
			viewGroup: 'field:live',
			first: 30,
			number: 10,
			requestedRange: { first: 30, number: 10 },
			groupDisplayMode: 'table',
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
});
