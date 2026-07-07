/**
 * This module contains the currently active query.
 * It's updated whenever the user actually submits a query by pressing search/submit on the main form or any of the explore forms.
 * It's essentially a snapshot of the filters and pattern as they were when the form was submitted.
 *
 * It doesn't only store the pattern and filters though,
 * it also contains some information about what part of the search/explore form the query was submitted from.
 * This is so that we can in turn store this in the query history and url,
 * and in turn restore the way the form looks when the user loads an old query through one of those mechanisms.
 *
 * If we were to only store the blacklab query parameters, we don't know whether the
 * query was generated in, for example, the n-gram editor or the querybuilder.
 * (It's very possible to create the same query through both those mechanisms and more).
 *
 * Generally, this part of the state ends up in the query history,
 * and the less processing we do here (such as turning annotations in a normal cql query string, or turning filters into a normal lucene query string)
 * the less work we have to do to undo this when the user loads that same history entry later.
 *
 * In order to generate a complete blacklab query, it is combined with the global settings (page size, sampling, context size, etc)
 * and the results settings (the grouping, viewed page number, etc).
 */

import cloneDeep from 'clone-deep';
import { reactive } from 'vue';

import * as UIModule from '@/app/state/ui-state';
import { type CorpusContext } from '@/app/state/useCorpusContext';
import { getFilterString, getFilterSummary } from '@/components/filters/filterValueFunctions';
import type { CompiledFormStateWithSummaries, ScopedFormQuery, SummaryEntry } from '@/features/form';
import type * as ExploreModule from '@/features/search/model/form/explore-state';
import type * as FilterModule from '@/features/search/model/form/filter-state';
import type * as GapModule from '@/features/search/model/form/gap-state';
import type * as PatternModule from '@/features/search/model/form/pattern-state';
import type { NormalizedAnnotatedField, NormalizedAnnotatedFieldParallel } from '@/types/apptypes';

import { getPatternStringExplore, getPatternStringSearch, getPatternSummaryExplore, getPatternSummarySearch } from '@/shared/blacklab-helpers/pattern-utils';

type NewFormQuerySnapshot = {
	patt: string | null;
	filter: string | null;
	searchfield: string | null;
	encoded: ScopedFormQuery;
	summaries: SummaryEntry[];
	formId: string;
};

// todo migrate these weirdo state shapes to mapped types?
// might be a cleaner way of doing this...
// weird template parameter is just a way to avoid having to write out all permutations of the subForm type.
// (which is any of the root state keys of the pattern module)
// basically we just want "one of" the entries in the pattern module root state.
type ModuleRootStateSearch<K extends keyof PatternModule.ModuleRootState> = {
	form: 'search';
	subForm: K;

	formState: PatternModule.ModuleRootState[K];
	shared: PatternModule.ModuleRootState['shared'];
	filters: FilterModule.ModuleRootState;
	gap: GapModule.ModuleRootState;
	newForm?: NewFormQuerySnapshot | null;
};

type ModuleRootStateExplore<K extends keyof ExploreModule.ModuleRootState> = {
	form: 'explore';
	subForm: K;

	formState: ExploreModule.ModuleRootState[K];
	shared: PatternModule.ModuleRootState['shared'];
	filters: FilterModule.ModuleRootState;
	gap: GapModule.ModuleRootState;
};

type ModuleRootStateNone = {
	form: null;
	subForm: null;
	formState: null;
	shared: null;
	filters: null;
	gap: null;
};

type ModuleRootState = ModuleRootStateNone | ModuleRootStateSearch<keyof PatternModule.ModuleRootState> | ModuleRootStateExplore<keyof ExploreModule.ModuleRootState>;

const initialState: ModuleRootStateNone = {
	form: null,
	subForm: null,
	formState: null,
	shared: null,
	filters: null,
	gap: null,
};

const state = reactive<ModuleRootState>(Object.assign({}, initialState));
const getState = () => state;

// TODO - hack ; need to revise global state management to avoid this
let context: CorpusContext;
const useCorpus = () => context!.index!;

const get = {
	sourceField: (): NormalizedAnnotatedField => {
		const corpus = useCorpus();
		const fieldName = state.form === 'search' && state.newForm?.searchfield ? state.newForm.searchfield : state.shared?.source || corpus.mainAnnotatedField;
		return corpus.allAnnotatedFieldsMap[fieldName] ?? corpus.allAnnotatedFieldsMap[corpus.mainAnnotatedField];
	},
	targetFields: (): NormalizedAnnotatedFieldParallel[] => {
		const allFields = useCorpus().allAnnotatedFieldsMap;
		return state.shared?.targets?.map(t => allFields[t]).filter(f => f.isParallel) ?? [];
	},

	patternString: (): string | undefined => {
		if (!state.subForm) return undefined;
		if (state.form === 'search' && state.newForm) return state.newForm.patt || undefined;

		const formState = {
			[state.subForm as string]: state.formState,
			shared: state.shared,
		} as Partial<ModuleRootStateSearch<keyof PatternModule.ModuleRootState>>;
		const annotations = useCorpus().allAnnotationsMap;
		const defaultAlignBy = UIModule.getState().search.shared.alignBy.defaultValue;
		switch (state.form) {
			case 'search':
				return getPatternStringSearch(state.subForm, formState as any, defaultAlignBy, state.filters);
			case 'explore':
				return getPatternStringExplore(state.subForm, formState as any, annotations);
			default:
				return undefined;
		}
	},
	/** Human-readable version of the query for use in history, summaries, etc. */
	patternSummary: (): string | undefined => {
		if (state.form === 'search' && state.newForm) {
			return state.newForm.summaries.map(summary => `${summary.label}: ${summary.value}`).join(', ') || undefined;
		}
		const formState = {
			[state.subForm as string]: state.formState,
			shared: state.shared,
		} as any;
		const defaultAlignBy = UIModule.getState().search.shared.alignBy.defaultValue;
		switch (state.form) {
			case 'search':
				return getPatternSummarySearch(state.subForm, formState, defaultAlignBy, state.filters);
			case 'explore':
				return getPatternSummaryExplore(state.subForm, formState, useCorpus().allAnnotationsMap);
			default:
				return undefined;
		}
	},
	filterString: (): string | undefined => {
		if (!state.form) {
			return undefined;
		}
		if (state.form === 'search' && state.newForm) return state.newForm.filter || undefined;
		return getFilterString(Object.values(state.filters).sort((a, b) => a.id.localeCompare(b.id)));
	},
	searchfield: (): string | undefined => {
		return state.form === 'search' && state.newForm?.searchfield ? state.newForm.searchfield : undefined;
	},
	usesNewForm: (): boolean => {
		return state.form === 'search' && !!state.newForm;
	},
	scopedFormQuery: (): ScopedFormQuery | undefined => {
		return state.form === 'search' && state.newForm ? state.newForm.encoded : undefined;
	},
	filterSummary: (): string | undefined => {
		if (!state.form) {
			return undefined;
		}
		return getFilterSummary(Object.values(state.filters).sort((a, b) => a.id.localeCompare(b.id)));
	},
};

function toNewFormQuerySnapshot(snapshot: CompiledFormStateWithSummaries): NewFormQuerySnapshot {
	return {
		patt: snapshot.patt,
		filter: snapshot.filter,
		searchfield: snapshot.searchfield,
		encoded: cloneDeep(snapshot.encoded),
		summaries: cloneDeep(snapshot.summaries),
		formId: snapshot.formId,
	};
}

const actions = {
	search: (payload: ModuleRootState) => Object.assign(state, cloneDeep(payload)),
	searchNewForm: (payload: Omit<ModuleRootStateSearch<'simple'>, 'newForm'> & { newForm: CompiledFormStateWithSummaries }) =>
		Object.assign(
			state,
			cloneDeep({
				...payload,
				newForm: toNewFormQuerySnapshot(payload.newForm),
			}),
		),
	reset: () => Object.assign(state, Object.assign({}, initialState)),
	replace: (payload: ModuleRootState) => Object.assign(state, cloneDeep(payload)),
};

const init = (_payload: CorpusContext) => {
	context = _payload;
	actions.reset();
};

export { actions, get, getState, init };
export type { ModuleRootState, NewFormQuerySnapshot };
