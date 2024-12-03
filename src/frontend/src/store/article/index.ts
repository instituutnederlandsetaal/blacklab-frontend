import Vue from 'vue';
import Vuex from 'vuex';

import cloneDeep from 'clone-deep';
import {getStoreBuilder} from 'vuex-typex';

import {blacklab} from '@/api';

import * as BLTypes from '@/types/blacklabtypes';

Vue.use(Vuex);

type RootState = {
	indexId: string;
	docId: string;
	document: null|BLTypes.BLDocument;
	/**
	 * Name of the AnnotatedField in which we're viewing the document.
	 * Relevant for parallel corpora, where a document perhaps has a Dutch and an English version (or perhaps event more).
	 * When this is a regular corpus with only one version of documents, the field will usually be named 'contents' (but not necessarily).
	 *
	 * We retrieve this from the URL (query parameter "field").
	 * If not supplied/set, we can just omit it in requests to BlackLab and it will use whatever default it has.
	 */
	field: string|null;

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

const initialState: RootState = {
	indexId: INDEX_ID,
	docId: DOCUMENT_ID,
	document: null,
	field: null,
	distributionAnnotation: null,
	growthAnnotations: null,
	statisticsTableFn: null,
	baseColor: '#337ab7' // bootstrap primary
};

const b = getStoreBuilder<RootState>();

const getState = b.state();

const get = {
	distributionAnnotation: b.read(state => state.distributionAnnotation, 'distributionAnnotation'),
	growthAnnotations: b.read(state => state.growthAnnotations, 'growthAnnotations'),
	statisticsTableFn: b.read(state => state.statisticsTableFn, 'statisticsTableFn'),
	document: b.read(state => state.document, 'document'),
	baseColor: b.read(state => state.baseColor, 'baseColor')
};

const actions = {
	distributionAnnotation: b.commit((state, payload: RootState['distributionAnnotation']) => state.distributionAnnotation = payload, 'distributionAnnotation'),
	growthAnnotations: b.commit((state, payload: RootState['growthAnnotations']) => state.growthAnnotations = payload, 'growthAnnotations'),
	statisticsTableFn: b.commit((state, payload: RootState['statisticsTableFn']) => state.statisticsTableFn = payload, 'statisticsTableFn'),
	document: b.commit((state, payload: BLTypes.BLDocument) => state.document = payload, 'document'),
	baseColor: b.commit((state, payload: string) => state.baseColor = payload, 'baseColor'),

	reset: b.commit(state => Object.assign(state, cloneDeep(initialState)), 'resetRoot'),
	replace: b.commit((state, payload: RootState) => Object.assign(state, payload), 'replaceRoot'),
};

const internalActions = {
	field: b.commit((state, payload: string|null) => state.field = payload, 'field')
}

// shut up typescript, the state we pass here is merged with the modules initial states internally.
// NOTE: only call this after creating all getters and actions etc.
// NOTE: process.env is empty at runtime, but webpack inlines all values at compile time, so this check works.
declare const process: any;
const store = b.vuexStore({state: cloneDeep(initialState) as RootState, strict: process.env.NODE_ENV === 'development'});

const init = () => {
	// Get annotated field from URL.
	// Required to get correct hit counts and statistics.
	// (note that this may be a full field name or a version name (parallel corpus), see below)
	const fieldOrVersion = new URLSearchParams(window.location.search).get('field');

	// Fetch document info and determine full annotated field name.
	blacklab.getDocumentInfo(INDEX_ID, DOCUMENT_ID)
	.then(document => {
		// Store document info
		actions.document(document);

		// If the field name from the URL was just a version (e.g. nl), find the full field name
		// (e.g. contents__nl) in the document info and set that.
		if (fieldOrVersion) {
			const matchingFieldName = ({ fieldName }: { fieldName: string }) => {
				return fieldName === fieldOrVersion ||
					fieldName.length - fieldOrVersion.length - 2 >= 0 &&
					fieldName.substring(fieldName.length - fieldOrVersion.length - 2) === `__${fieldOrVersion}`;
			}
			const fullFieldName = document.docInfo.tokenCounts?.find(matchingFieldName)?.fieldName ?? fieldOrVersion;
			internalActions.field(fullFieldName);
		}
	});
};

// Debugging helpers.
(window as any).vuexModules = {
	root: {
		store,
		getState,
		get,
		actions,
		init
	},
};

(window as any).vuexStore = store;

export {
	RootState,

	store,
	getState,
	get,
	actions,
	init,
};
