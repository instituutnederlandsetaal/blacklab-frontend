import cloneDeep from 'clone-deep';
import {getStoreBuilder} from 'vuex-typex';

import * as BLTypes from '@/types/blacklabtypes';

import {RootState} from '@/store';
import { CorpusChange } from '@/store/async-loaders';

type ModuleRootState = {
	docId: string|null;
	/**
	 * Name of the AnnotatedField in which we're viewing the document.
	 * Relevant for parallel corpora, where a document perhaps has a Dutch and an English version (or perhaps event more).
	 * When this is a regular corpus with only one version of documents, the field will usually be named 'contents' (but not necessarily).
	 * If this field is blank, the main annotated field is used.
	 *
	 * The field that is searched (when viewing documents) can be gotten from the QueryStore (get.annotatedFieldName).
	 *
	 * Yes, this is slightly different from how BlackLab represents these parameters in its API, but it makes much more sense for the frontend this way.
	 * In BlackLab: field is the field to display, whereas searchField is the field to search.
	 * In the frontend: field is the field to search, whereas viewField is the field to display.
	 *
	 * This causes a little wrinkle for url-decoding, as we try to mimic BlackLab there however.
	 */
	viewField: string|null;
	// For searchField, see QueryStore.

	/** null if pagination disabled */
	pageSize: number|null;
	/** null if pagination disabled */
	wordstart: number|null;
	/** null if pagination disabled */
	wordend: number|null;
	/** wordstart of the hit to highlight/currently highlighted hit. */
	findhit: number|null;

	distributionAnnotation: null|{
		/** Id of the annotation */
		id: string;
		/** Label/displayName of the chart */
		displayName: string;
	};
	growthAnnotations: null|{
		/** Label/displayName of the chart */
		displayName: string;
		annotations: Array<{
			/** Id of the annotation */
			id: string;
			/** Label/displayName of the graph line */
			displayName: string;
		}>;
	};
	/** Injectable function to calculate whichever properties about a document */
	statisticsTableFn: null|((document: BLTypes.BLDocument, snippet: BLTypes.BLHitSnippet) => {[key: string]: string});

	baseColor: string; // TODO make ui store shared.
};

type HistoryState = Pick<ModuleRootState, 'docId'|'viewField'|'wordstart'|'wordend'|'findhit'>;
const initialHistoryState: HistoryState = {
	docId: null,
	viewField: null,
	wordstart: 0,
	wordend: 2^31-1, // JAVA interop
	findhit: null
};

const initialState: ModuleRootState = {
	...initialHistoryState,
	pageSize: 1000,

	distributionAnnotation: null,
	growthAnnotations: null,
	statisticsTableFn: null,
	baseColor: '#337ab7' // bootstrap primary
};

const namespace = 'article';
const b = getStoreBuilder<RootState>().module(namespace, cloneDeep(initialState));

const getState = b.state();

const get = {
	baseColor: b.read(state => state.baseColor, 'baseColor'),
	distributionAnnotation: b.read(state => state.distributionAnnotation, 'distributionAnnotation'),
	growthAnnotations: b.read(state => state.growthAnnotations, 'growthAnnotations'),
	statisticsTableFn: b.read(state => state.statisticsTableFn, 'statisticsTableFn'),
	pageSize: b.read(state => state.pageSize, 'pageSize'),
	statisticsEnabled: b.read(state => !!(state.statisticsTableFn || state.growthAnnotations || state.distributionAnnotation), 'statisticsEnabled'),
	wordstart: b.read(state => state.wordstart, 'wordstart'),
	wordend: b.read(state => state.wordend, 'wordend'),
	findhit: b.read(state => state.findhit, 'findhit'),
};

const actions = {
	distributionAnnotation: b.commit((state, payload: ModuleRootState['distributionAnnotation']) => state.distributionAnnotation = payload, 'distributionAnnotation'),
	growthAnnotations: b.commit((state, payload: ModuleRootState['growthAnnotations']) => state.growthAnnotations = payload, 'growthAnnotations'),
	statisticsTableFn: b.commit((state, payload: ModuleRootState['statisticsTableFn']) => state.statisticsTableFn = payload, 'statisticsTableFn'),
	baseColor: b.commit((state, payload: string) => state.baseColor = payload, 'baseColor'),

	docId: b.commit((state, payload: string|null) => state.docId = payload, 'docId'),
	page: b.commit((state, payload: {wordstart: number|null, wordend: number|null}) => {
		state.wordstart = payload.wordstart ?? null;
		state.wordend = payload.wordend ?? null;
	}, 'page'),
	findhit: b.commit((state, payload: number|null) => {
		state.wordstart = 0;
		state.wordend = Number.MAX_SAFE_INTEGER;
		state.findhit = payload
	}, 'findhit'),
	viewField: b.commit((state, payload: string|null) => state.viewField = payload, 'field'),

	reset: b.commit(state => {
		state.docId = null;
		state.findhit = null;
		state.viewField = null;
		state.wordend = 2^31-1;
		state.wordstart = 0;
		// Don't reset the rest, is supplied by customJs, don't want to clear that on regular reset.
	}, 'reset'),
	replace: b.commit((state, payload: HistoryState) => {
		actions.docId(payload.docId);
		actions.page(payload);
		actions.viewField(payload.viewField);
		actions.findhit(payload.findhit);
	}, 'replaceRoot'),
};

const init = (state: CorpusChange) => {
	if (!state.index) Object.assign(getState(), initialState);
	else actions.reset();
};

export {
	ModuleRootState,
	HistoryState,
	initialHistoryState,

	getState,
	get,
	actions,
	init,

	namespace
};
