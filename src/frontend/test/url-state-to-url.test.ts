import { describe, expect, test } from 'vitest';

import type * as InterfaceStore from '@/features/search/model/form/interface-state';
import type * as QueryStore from '@/features/search/model/query-state';
import { getSubmittedInterfaceState } from '@/url/state-to-url';

const liveInterfaceState: InterfaceStore.ModuleRootState = {
	form: 'search',
	patternMode: 'simple',
	exploreMode: 'corpora',
	viewedResults: 'hits',
	activeAnnotationTab: 'Basics_annotations',
	activeFilterTab: 'Letter',
};

describe('state-to-url helpers', () => {
	test('serializes legacy search interface state from the submitted query snapshot', () => {
		const submittedInterface = getSubmittedInterfaceState({
			interface: liveInterfaceState,
			query: {
				form: 'search',
				subForm: 'extended',
				formState: {},
				shared: {},
				filters: {},
				gap: {},
			} as QueryStore.ModuleRootState,
		});

		expect(submittedInterface).toEqual({
			form: 'search',
			patternMode: 'extended',
			viewedResults: undefined,
			activeAnnotationTab: 'Basics_annotations',
			activeFilterTab: 'Letter',
		});
	});

	test('serializes legacy explore interface state from the submitted query snapshot', () => {
		const submittedInterface = getSubmittedInterfaceState({
			interface: liveInterfaceState,
			query: {
				form: 'explore',
				subForm: 'ngram',
				formState: {},
				shared: {},
				filters: {},
				gap: {},
			} as QueryStore.ModuleRootState,
		});

		expect(submittedInterface).toEqual({
			form: 'explore',
			exploreMode: 'ngram',
			viewedResults: undefined,
			activeAnnotationTab: 'Basics_annotations',
			activeFilterTab: 'Letter',
		});
	});

	test('keeps new-form submitted identity in scoped params instead of legacy interface mode', () => {
		const query = {
			form: 'new',
			state: {
				filter: null,
				formId: 'search.extended',
				encoded: {
					'f.form': 'search.extended',
					'f.word': 'water',
				},
				patt: '[word="water"]',
				searchfield: 'contents',
				summaries: [],
			},
		} satisfies Extract<QueryStore.ModuleRootState, { form: 'new' }>;

		const submittedInterface = getSubmittedInterfaceState({
			interface: liveInterfaceState,
			query,
		});

		expect(query.state.encoded['f.form']).toBe('search.extended');
		expect(submittedInterface).toEqual({
			form: 'search',
			exploreMode: 'corpora',
			patternMode: 'simple',
			viewedResults: undefined,
			activeAnnotationTab: 'Basics_annotations',
			activeFilterTab: 'Letter',
		});
	});
});
