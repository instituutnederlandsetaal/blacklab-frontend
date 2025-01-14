import { blacklab, frontend } from '@/api';
import { BLDoc, BLHitResults } from '@/types/blacklabtypes';
import { binarySearch, clamp } from '@/utils';

import { combineLoadables, combineLoadablesIncludingEmpty, compareAsSortedJson, Empty, isLoaded, Loadable, Loaded, mapLoaded, switchMapLoaded, toObservable } from '@/utils/loadable-streams';
import { combineLatest, distinctUntilChanged, map, Observable, ReplaySubject, shareReplay, tap } from 'rxjs';

// Define some input/intermediate types and utils.

export type DocInput = {
	indexId: string;
	docId: string;
}
export type HitsInput = {
	indexId: string;
	docId: string;
	searchField: string;
	patt: string;
	pattgapdata?: string;
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
const toDocInput = (i: Input): Loadable<DocInput> => (!!i.indexId && i.docId != null) ? Loaded(i) : Empty();
export const metadata$ =  input$.pipe(
	map(toDocInput),
	switchMapLoaded(i => toObservable(blacklab.getDocumentInfo(i.indexId, i.docId))),
	shareReplay(1)
);

// Document hits
const toHitsInput = (i: Input): Loadable<HitsInput> => (!!i.indexId && i.docId != null && !!i.patt) ? Loaded(i) : Empty();
export const hits$ = input$.pipe(
	map(toHitsInput),
	switchMapLoaded(i => toObservable(blacklab.getHits<BLHitResults>(i.indexId, {
		docpid: i.docId,
		field: i.searchField,
		patt: i.patt,
		first: 0,
		number: Math.pow(2, 31)-1, // JAVA BACKEND: max_safe_integer is 2^31-1
		context: 0,
		includetokencount: false,
		listvalues: "__do_not_send_anything__", // we don't need this info
	}))),
	mapLoaded(hits => hits.hits.map(h => [h.start, h.end] as [number, number])),
	tap(hits => console.log('hits in article view', hits)),
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
export const validPaginationParameters$ = combineLatest([input$, metadata$, hits$]).pipe(
	map(([input, doc, hits]) => combineLoadablesIncludingEmpty([input, doc, hits] as const)),
	mapLoaded(([input, doc, hits]) => fixInput(input, doc!, hits)),
	distinctUntilChanged(compareAsSortedJson), // type inference breaks if we pass compareAsSortedJson directly
	shareReplay(1)
)

// This observable is used to correct the store when the user enters on or navigates to a page that is out of bounds or otherwise invalid.
export const correctionsForStore$ = combineLatest([inputsFromStore$, validPaginationParameters$]).pipe(
	map(combineLoadables),
	mapLoaded(([input, pagination]) => {
		const commonKeys = Object.keys(input).filter(k => k in pagination) as Extract<keyof typeof input, keyof typeof pagination>[];
		// extract those properties that are different
		const difference = commonKeys.reduce((acc, key) => {
			if (input[key] !== pagination[key]) acc[key] = input[key] as any;
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
		if (isLoaded(a) && isLoaded(b)) {
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
export const snippetAndDocument$ = combineLatest([snippet$, metadata$]).pipe(map(combineLoadables));

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
