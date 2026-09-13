// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from 'vitest';
import { ref } from 'vue';

import type { CorpusContext } from '@/app/state/useCorpusContext';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import * as ViewStore from '@/features/search/model/results/view-state';

beforeEach(() => {
	ViewStore.setPageSizePreference(() => GlobalResultsStore.getState().pageSize);
	GlobalResultsStore.actions.pageSize(20);
	ViewStore.init({} as CorpusContext);
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
		const view = ViewStore.getOrCreateModule('hits');
		view.actions.range(selection);
		GlobalResultsStore.actions.pageSize(preference);
		expect(view.get.selectedRange()).toEqual(stored);
		expect(view.get.expandedRequestRange()).toEqual(request);
	});

	test('newly created views use the current preference', () => {
		GlobalResultsStore.actions.pageSize(50);
		expect(ViewStore.getOrCreateModule('custom').get.selectedRange()).toEqual({ first: 0, number: 50 });
	});

	test('individual reset preserves custom defaults and uses the current page preference', () => {
		const preference = ref(20);
		const custom = ViewStore.createViewModule(preference, { customState: { display: 'compact' }, groupBy: ['field:title'], groupDisplayMode: 'docs' });
		custom.actions.customState({ display: 'wide' });
		custom.actions.groupBy(['field:author']);
		custom.actions.groupDisplayMode('table');
		custom.actions.range({ first: 45, number: 30 });
		preference.value = 50;
		expect(custom.get.selectedRange()).toEqual({ first: 45, number: 30 });
		expect(custom.get.expandedRequestRange()).toEqual({ first: 0, number: 100 });
		custom.actions.reset({ resetGroupBy: false });
		expect(custom.getState()).toMatchObject({ first: 0, number: 50, customState: { display: 'compact' }, groupBy: ['field:author'], groupDisplayMode: 'docs' });
		custom.actions.reset({ resetGroupBy: true });
		expect(custom.getState().groupBy).toEqual(['field:title']);
	});
});
