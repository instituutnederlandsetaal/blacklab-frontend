import { blacklab, frontend } from '@/api';
import { BLDoc, BLHitResults } from '@/types/blacklabtypes';
import { binarySearch, clamp } from '@/utils';

import { combineLoadables, combineLoadablesIncludingEmpty, combineLoadableStreams, compareAsSortedJson, Loadable, LoadableState, loadedIfNotNull, mapLoadable, mapLoaded, switchMapLoadable, switchMapLoaded, toObservable } from '@/utils/loadable-streams';
import { combineLatest, distinctUntilChanged, map, Observable, ReplaySubject, shareReplay, tap } from 'rxjs';

// Define some input/intermediate types and utils.

export type DocInput = {
	indexId: string;
	docId: string;
}
export type HitsInput = {
	indexId: string;
	docId: string;
	patt: string;
	searchField?: string|undefined;
	pattgapdata?: string|undefined;
}

export type PageInput = {
	wordstart: number;
	wordend: number;
	findhit?: number;
	pageSize: number;
	viewField: string;
}

type _Input = Partial<DocInput & HitsInput & PageInput>
export type Input = { [K in keyof _Input]: _Input[K] | null; }

/** The initial input */
export const inputsFromStore$ = new ReplaySubject<Input>(1);
const input$ = inputsFromStore$.pipe(distinctUntilChanged(compareAsSortedJson), shareReplay(1));

// Document metadata
export const metadata$ =  input$.pipe(
	map(loadedIfNotNull('indexId', 'docId')),
	switchMapLoaded(i => blacklab.getDocumentInfo(i.indexId, i.docId).toObservable()),
	shareReplay(1)
);

// Document hits
export const hits$ = input$.pipe(
	map(loadedIfNotNull('indexId', 'docId', 'patt')),
	switchMapLoaded(i => toObservable(blacklab.getHits<BLHitResults>(i.indexId, {
		docpid: i.docId,
		field: i.searchField || undefined,
		patt: i.patt,
		pattgapdata: i.pattgapdata || undefined,
		first: 0,
		number: Math.pow(2, 31)-1, // JAVA BACKEND: max_safe_integer is 2^31-1
		context: 0,
		includetokencount: false,
		listvalues: "__do_not_send_anything__", // we don't need this info
	}))),
	mapLoaded(hits => hits.hits.map(h => [h.start, h.end] as [number, number])),
	shareReplay(1),
)


type ValidPaginationAndDocDisplayParameters = {
	indexId: string;
	docId: string;
	docLength: number;
	wordstart: number;
	wordend: number;
	pageSize: number;
	/** 0-indexed */
	page: number;
	/** 0-indexed */
	maxPage: number;
	/** wordstart of a hit */
	findhit?: number;

	patt?: string;
	pattgapdata?: string;

	searchField: string;
	viewField: string;
}

/**
 * This is only available after the metadata and hits are loaded.
 * It is a guaranteed valid set of pagination parameters.
 */
export const validPaginationParameters$: Observable<Loadable<ValidPaginationAndDocDisplayParameters>> = combineLatest([input$, metadata$, hits$]).pipe(
	map(combineLoadablesIncludingEmpty),
	mapLoaded(([input, doc, hits]) => fixInput(input, doc!, hits)), // doc should always be present if input is
	distinctUntilChanged(compareAsSortedJson),
	shareReplay(1)
)

// This observable is used to correct the store when the user enters on or navigates to a page that is out of bounds or otherwise invalid.
export const correctionsForStore$ = combineLatest([inputsFromStore$, validPaginationParameters$]).pipe(
	map(combineLoadables),
	mapLoaded(([maybeInvalid, valid]) => {
		const commonKeys = Object.keys(maybeInvalid).filter(k => k in valid) as Extract<keyof typeof maybeInvalid, keyof typeof valid>[];
		// extract those properties that are different
		const difference = commonKeys.reduce((acc, key) => {
			if (maybeInvalid[key] !== valid[key]) acc[key] = maybeInvalid[key] as any;
			return acc;
		}, {} as Partial<Pick<Input, typeof commonKeys[number]>>);

		return difference;
	}),
	shareReplay(1)
)

export const contents$ = validPaginationParameters$.pipe(
	switchMapLoaded(input => toObservable(frontend.getDocumentContents(input.indexId, input.docId, {
		patt: input.patt,
		pattgapdata: input.pattgapdata,
		wordstart: input.wordstart,
		wordend: input.wordend,
		field: input.viewField,
		searchfield: input.searchField
	}))),
	mapLoaded(v => {
		const container = document.createElement('div');
		container.innerHTML = v;
		const highlights = Array.from(container.querySelectorAll('.hl')) as HTMLElement[];
		return { container, highlights }
	}),
	shareReplay(1)
)

export const hitToHighlight$ = combineLatest([validPaginationParameters$, hits$, contents$]).pipe(
	map(combineLoadables),
	distinctUntilChanged((a, b) => {
		// Inverted: false === not equivalent === changed
		if (a.isLoaded() && b.isLoaded()) {
			const [aParams, aHits, aContents] = a.value;
			const [bParams, bHits, bContents] = b.value;
			return aParams.findhit === bParams.findhit && aHits === bHits && aContents === bContents;
		}
		return a.state === b.state;
	}),
	mapLoaded(([pagination, hits, {container, highlights}]) => {
		const firstVisibleHitIndex = binarySearch(hits, h => pagination.wordstart - h[0]);
		const hitIndexToHighlight = binarySearch(hits, h => pagination.findhit! - h[0]);
		const localHitIndexToHighlight = hitIndexToHighlight - firstVisibleHitIndex;
		return {
			totalHits: hits.length,
			hitIndexToHighlight,
			firstVisibleHitIndex,
			localHitIndexToHighlight,
			hl: highlights[localHitIndexToHighlight] as HTMLElement|undefined, // when out of bounds, this will be undefined
			container,
		}
	}),
	shareReplay(1)
);

const snippet$ = validPaginationParameters$.pipe(
	switchMapLoaded(p => toObservable(blacklab.getSnippet(
		p.indexId,
		p.docId,
		p.viewField,
		0, // start
		p.docLength, // end
		0 // context
	)))
);
export const snippetAndDocument$ = combineLoadableStreams([snippet$, metadata$] as const);

/** Given unvalidated pagination parameters and the size of the document, return the validated/fixed pagination parameters. */
function getDefaultPagination(input: Input, doclength: number): {wordstart: number, wordend: number} {
	// Defaults.
	let wordstart = input.wordstart ?? 0;
	let wordend = input.wordend ?? doclength
	// Fix order (just in case)
	if (wordstart > wordend) [wordstart, wordend] = [wordend, wordstart];
	// Fix bounds.
	return {
		wordstart: clamp(wordstart, 0, doclength),
		wordend: clamp(wordend, 0, input.pageSize ? wordstart + input.pageSize : doclength)
	}
}

/**
 * Given all hits in the document and a findhit, return the findhit if it is a valid hit, otherwise return undefined.
 * @param findhit wordstart of a hit
 * @param hits the hits in the document (if any)
 * @returns
 */
function getValidfindhit(findhit: number|undefined|null, hits?: [number, number][]): number|undefined {
	if (!findhit || !hits) return undefined;
	const hitIndex = binarySearch(hits, h => findhit - h[0]);
	return hitIndex >= 0 ? findhit : undefined;
}

/** Given a set of unvalidated pagination parameters, return a set of validated pagination parameters. */
function fixPagination({wordstart, wordend, pageSize, findhit, docLength}: {wordstart: number, wordend: number, pageSize: number, findhit?: number, docLength: number}): {wordstart: number, wordend: number} {
	if (!findhit || (findhit >= wordstart && findhit < wordend)) return {wordstart, wordend};
	const newPageStart = Math.floor(findhit / pageSize) * pageSize;
	return {
		wordstart: newPageStart,
		wordend: clamp(newPageStart + pageSize, 0, docLength)
	}
}

function fixInput(input: Input, doc: BLDoc, hits?: [number, number][]): ValidPaginationAndDocDisplayParameters {
	const docLength = doc.docInfo.lengthInTokens;
	let {wordstart, wordend} = getDefaultPagination(input, docLength);
	const findhit = getValidfindhit(input.findhit, hits);
	const pageSize = input.pageSize || doc.docInfo.lengthInTokens;

	({wordstart, wordend} = fixPagination({wordstart, wordend, pageSize, findhit, docLength}));

	return {
		indexId: input.indexId!,
		docId: input.docId!,
		docLength,

		patt: input.patt || undefined,
		pattgapdata: input.pattgapdata || undefined,

		wordstart,
		wordend,
		findhit,
		// We wouldn't have gotten here if these were missing

		pageSize,
		page: Math.floor(wordstart / pageSize),
		maxPage: Math.floor(docLength / pageSize),

		searchField: input.searchField!,
		viewField: input.viewField!
	}
}
