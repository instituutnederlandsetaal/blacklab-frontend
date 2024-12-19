import cloneDeep from 'clone-deep';
import {getStoreBuilder} from 'vuex-typex';

import {blacklab} from '@/api';

import * as BLTypes from '@/types/blacklabtypes';

import {RootState} from '@/store';

type ModuleRootState = {
	indexId: string;
	docId: string|null;
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

	/** MAX_SAFE_INTEGER if unset */
	pageSize: number;
	/** 0 if unset */
	pageStart: number;
	/** MAX_SAFE_INTEGER if unset */
	pageEnd: number;

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

const initialState: ModuleRootState = {
	indexId: INDEX_ID,
	docId: null,
	document: null,
	field: null,
	pageStart: 0,
	pageEnd: Number.MAX_SAFE_INTEGER,
	pageSize: Number.MAX_SAFE_INTEGER,
	distributionAnnotation: null,
	growthAnnotations: null,
	statisticsTableFn: null,
	baseColor: '#337ab7' // bootstrap primary
};

const namespace = 'article';
const b = getStoreBuilder<RootState>().module(namespace, cloneDeep(initialState));

const getState = b.state();

const get = {
	distributionAnnotation: b.read(state => state.distributionAnnotation, 'distributionAnnotation'),
	growthAnnotations: b.read(state => state.growthAnnotations, 'growthAnnotations'),
	statisticsTableFn: b.read(state => state.statisticsTableFn, 'statisticsTableFn'),
	document: b.read(state => state.document, 'document'),
	baseColor: b.read(state => state.baseColor, 'baseColor'),
	documentLength: b.read(state => state.document?.docInfo.lengthInTokens ?? 0, 'documentLength'),
	pageSize: b.read(state => state.pageSize, 'pageSize'),
	pageStart: b.read(state => state.pageStart, 'pageStart'),
	pageEnd: b.read(state => state.pageEnd, 'pageEnd'),
};

const actions = {
	distributionAnnotation: b.commit((state, payload: ModuleRootState['distributionAnnotation']) => state.distributionAnnotation = payload, 'distributionAnnotation'),
	growthAnnotations: b.commit((state, payload: ModuleRootState['growthAnnotations']) => state.growthAnnotations = payload, 'growthAnnotations'),
	statisticsTableFn: b.commit((state, payload: ModuleRootState['statisticsTableFn']) => state.statisticsTableFn = payload, 'statisticsTableFn'),
	document: b.commit((state, payload: BLTypes.BLDocument) => state.document = payload, 'document'),
	baseColor: b.commit((state, payload: string) => state.baseColor = payload, 'baseColor'),

	corpus: b.commit((state, payload: string) => state.indexId = payload, 'corpus'),
	changeDocument: b.dispatch(async ({state, rootState}, documentId: string|null) => {
		state.docId = documentId;
		state.document = state.field = null;
		if (!documentId || !state.indexId) return;

		// Fetch document info and determine full annotated field name.
		const document = await blacklab.getDocumentInfo(INDEX_ID, documentId)
		actions.document(document);
		// Get annotated field from URL.
		// Required to get correct hit counts and statistics.
		// (note that this may be a full field name or a version name (parallel corpus), see below)
		// TODO SPA: pass through setter instead. set field in streams.ts
		const fieldOrVersion = new URLSearchParams(window.location.search).get('field');

		// If the field name from the URL was just a version (e.g. nl), find the full field name
		// (e.g. contents__nl) in the document info and set that.
		if (fieldOrVersion) {
			const matchingFieldName = ({ fieldName }: { fieldName: string }) => {
				return fieldName === fieldOrVersion ||
					fieldName.length - fieldOrVersion.length - 2 >= 0 &&
					fieldName.substring(fieldName.length - fieldOrVersion.length - 2) === `__${fieldOrVersion}`;
			}
			const fullFieldName = document.docInfo.tokenCounts?.find(matchingFieldName)?.fieldName ?? fieldOrVersion;
			state.field = fullFieldName;
		}
	}, 'changeDocument'),
	changePage: b.commit((state, payload: {start: number, end: number}) => {
		state.pageStart = payload.start;
		state.pageEnd = payload.end;
	}, 'changePage'),

	reset: b.commit(state => Object.assign(state, cloneDeep(initialState)), 'resetRoot'),
	replace: b.commit((state, payload: ModuleRootState) => Object.assign(state, payload), 'replaceRoot'),
};

const init = () => {};

export {
	ModuleRootState,

	getState,
	get,
	actions,
	init,

	namespace
};
