// @vitest-environment jsdom

import { createTestResultsState } from '@test/mocks/results-state';
import { beforeEach, describe, expect, test } from 'vitest';
import { ref } from 'vue';

import { type ResultsState } from '@/features/search/model/results/results-state';

let results: ResultsState;
beforeEach(() => {
	results = createTestResultsState();
});

describe('stored selection and requested pages', () => {
	test.each([
		['custom URL, preferred 20', { first: 45, number: 30 }, 20, { first: 45, number: 30 }, { first: 40, number: 40 }],
		['ordinary page, preferred 20 → 50', { first: 40, number: 20 }, 50, { first: 0, number: 50 }, { first: 0, number: 50 }],
		['custom URL, preferred 20 → 50', { first: 45, number: 30 }, 50, { first: 45, number: 30 }, { first: 0, number: 100 }],
		['ordinary later page, preferred 20 → 50', { first: 60, number: 20 }, 50, { first: 50, number: 50 }, { first: 50, number: 50 }],
		['unaligned single page, preferred 20 → 50', { first: 7, number: 20 }, 50, { first: 7, number: 20 }, { first: 0, number: 50 }],
		['aligned multi-page URL, preferred 20 → 50', { first: 20, number: 40 }, 50, { first: 20, number: 40 }, { first: 0, number: 100 }],
	] as const)('%s', (_action, selection, preference, stored, request) => {
		const view = results.view('hits');
		view.setRange(selection);
		results.setPageSize(preference);
		expect(view.selectedRange).toEqual(stored);
		expect(view.expandedRequestRange).toEqual(request);
	});

	test('newly created views use the current preference', () => {
		results.setPageSize(50);
		expect(results.view('custom').selectedRange).toEqual({ first: 0, number: 50 });
	});

	test('individual reset preserves custom defaults and uses the current page preference', () => {
		const custom = results.view('custom', { customState: { display: 'compact' }, groupBy: ['field:title'], groupDisplayMode: 'docs' });
		custom.state.customState = { display: 'wide' };
		custom.setGroupBy(['field:author']);
		custom.state.groupDisplayMode = 'table';
		custom.setRange({ first: 45, number: 30 });
		results.setPageSize(50);
		expect(custom.selectedRange).toEqual({ first: 45, number: 30 });
		expect(custom.expandedRequestRange).toEqual({ first: 0, number: 100 });
		custom.reset(false);
		expect(custom.state).toMatchObject({ first: 0, number: 50, customState: { display: 'compact' }, groupBy: ['field:author'], groupDisplayMode: 'docs' });
		custom.reset();
		expect(custom.state.groupBy).toEqual(['field:title']);
	});
});

test('resetting one results instance clears its selection and keeps its page size', () => {
	const other = createTestResultsState(ref(50));
	other.selectView('custom');
	other.selectedView!.state.sort = 'field:author';
	results.selectView('docs');
	results.setContext(5);
	results.setPageSize(25);
	results.reset();
	expect(results.selectedView).toBeNull();
	expect(results.settings).toMatchObject({ context: null, pageSize: 25 });
	expect(results.view('docs').selectedRange).toEqual({ first: 0, number: 25 });
	expect(other.selectedView?.state).toMatchObject({ sort: 'field:author', number: 50 });
});

test('editing the sample restarts pagination and restoring sample settings preserves the selection', () => {
	const hits = results.view('hits');
	hits.state.first = 40;
	results.setSampleSize(80);
	expect(hits.state.first).toBe(0);
	expect(results.settings.sampleSeed).toEqual(expect.any(Number));
	hits.state.first = 40;
	results.replaceSettings({ sampleMode: 'percentage', sampleSize: null, sampleSeed: null, context: null });
	expect(results.settings).toMatchObject({ sampleSize: null, sampleSeed: null });
	expect(hits.state.first).toBe(40);
});

test('invalid stored page sizes fall back to the default for new views', () => {
	const stored = ref(0.5);
	const restored = createTestResultsState(stored);
	expect(restored.view('hits').expandedRequestRange).toEqual({ first: 0, number: 20 });
	expect(stored.value).toBe(20);
});
