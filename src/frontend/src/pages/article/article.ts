import { ApiError, blacklab, Canceler, frontend } from '@/api';
import { BLDoc, BLHitResults } from '@/types/blacklabtypes';
import { binarySearch, clamp } from '@/utils';
import jsonStableStringify from 'json-stable-stringify';
import * as ArticleStore from '@/store/article';

import { BehaviorSubject, combineLatest, distinctUntilChanged, map, merge, mergeMap, Observable, ObservableInput, of, OperatorFunction, partition, ReplaySubject, shareReplay, switchMap, tap } from 'rxjs';


// Define some input/intermediate types and utils.

enum LoadableState {
	Loading = 'loading',
	Loaded = 'loaded',
	Error = 'error',
	Empty = 'empty'
}

type Loading<T> = {state: LoadableState.Loading};
type Loaded<T> = {state: LoadableState.Loaded, value: T};
type Error<T> = {state: LoadableState.Error, error: ApiError};
type Empty<T> = {state: LoadableState.Empty};
type Loadable<T> = Loading<T> | Loaded<T> | Error<T> | Empty<T>;

const Loading = <T>(): Loading<T> => ({state: LoadableState.Loading});
const Loaded = <T>(value: T): Loaded<T> => ({state: LoadableState.Loaded, value});
const Error = <T>(error: ApiError): Error<T> => ({state: LoadableState.Error, error});
const Empty = <T>(): Empty<T> => ({state: LoadableState.Empty});

const isLoaded = <T>(v: Loadable<T>): v is Loaded<T> => v.state === LoadableState.Loaded;
const isLoading = <T>(v: Loadable<T>): v is Loading<T> => v.state === LoadableState.Loading;
const isError = <T>(v: Loadable<T>): v is Error<T> => v.state === LoadableState.Error;
const isEmpty = <T>(v: Loadable<T>): v is Empty<T> => v.state === LoadableState.Empty;

type LoadableTypeFromState<T> = {
	[LoadableState.Loading]: Loading<T>;
	[LoadableState.Loaded]: Loaded<T>;
	[LoadableState.Error]: Error<T>;
	[LoadableState.Empty]: Empty<T>;
}


function mapLoaded<T, U>(mapper: (v: T) => U): OperatorFunction<Loadable<T>, Loadable<U>> {
	return map(v => isLoaded(v) ? Loaded(mapper(v.value)) : v);
}

type CancelableRequest<T> = {
	cancel: Canceler,
	request: Promise<T>
}

type DocInput = {
	indexId: string;
	docId: string;
}
type HitsInput = {
	indexId: string;
	docId: string;
	searchField: string;
	patt: string;
	pattgapdata?: string;
}

type PageInput = {
	wordstart: number;
	wordend: number;
	findhit?: number;
	pageSize: number;
	viewField: string;
}

type _Input = Partial<DocInput & HitsInput & PageInput>
type Input = { [K in keyof _Input]: _Input[K] | null; }

/** Map the request/canceler into an observable. The observable will never error, but instead emit an error object. */
const toObservable = <T>({cancel, request}: CancelableRequest<T>) => new Observable<Loadable<T>>(observer => {
	observer.next(Loading());
	request.then(v => {
		observer.next(Loaded(v));
		observer.complete();
	}).catch((e: ApiError) => {
		if (e.title === 'Request cancelled') observer.complete();
		else observer.next(Error(e));
	});
	return () => cancel();
});
const compareAsSortedJson = (a: any, b: any) => jsonStableStringify(a) === jsonStableStringify(b);

/** The initial input */
const input$ = new ReplaySubject<Input>(1);


// Document metadata

const isValidDocInput = (i: Input): i is DocInput => !!i.indexId && i.docId != null;
const [validMetadataInput$, invalidMetadataInput$] = partition(input$, isValidDocInput);
const metadata$ =  merge(
	invalidMetadataInput$.pipe(map(Empty)),
	validMetadataInput$.pipe(
		distinctUntilChanged(compareAsSortedJson),
		switchMap(i => toObservable(blacklab.getDocumentInfo(i.indexId, i.docId))),
		shareReplay(1)
	)
);


// Document hits

const [validHitsInput$, invalidHitsInput$] = partition(input$, (i): i is HitsInput => !!i.indexId && i.docId != null && !!i.patt);
const hits$ = merge(
	invalidHitsInput$.pipe(map(() => Empty<[number,number][]>())),
	validHitsInput$.pipe(
		distinctUntilChanged(compareAsSortedJson),
		switchMap(i => toObservable(blacklab.getHits<BLHitResults>(i.indexId, {
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
		shareReplay(1)
	)
);

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
const validPaginationParameters$ = combineLatest([input$, metadata$, hits$]).pipe(
	map(([input, doc, hits]): Loadable<ValidPaginationAndDocDisplayParameters> => {
		if (!isLoaded(doc)) return doc; // pass doc state (error, empty, loading) through
		if (isLoading(hits) || isError(hits)) return hits; // pass hits loading/error state through (empty hits are fine)
		return Loaded(fixInput(input, doc.value, isLoaded(hits) ? hits.value : undefined));
	}),
	distinctUntilChanged((a,b) => compareAsSortedJson(a, b)),
	shareReplay(1)
)

// TODO: This is a side effect. move to init code.
validPaginationParameters$.subscribe({
	next: v => {
		if (!isLoaded(v)) return;
		const store = ArticleStore.getState();
		if (v.value.wordstart !== store.wordstart || v.value.wordend !== store.wordend) ArticleStore.actions.page({
			wordstart: v.value.wordstart,
			wordend: v.value.wordend
		})
		if (v.value.findhit != store.findhit) ArticleStore.actions.findhit(v.value.findhit ?? null);
	}
})

const contents$ = validPaginationParameters$.pipe(
	switchMap((v): Observable<Loadable<string>> => {
		if (!isLoaded(v)) return of(v); // pass doc state (error, empty, loading) through
		const input = v.value;

		return toObservable(frontend.getDocumentContents(input.indexId, input.docId, {
			patt: input.patt,
			pattgapdata: input.pattgapdata,
			wordstart: input.wordstart,
			wordend: input.wordend,
			field: input.viewField,
			searchfield: input.searchField
		}))
	}),
	mapLoaded(v => {
		const container = document.createElement('div');
		container.innerHTML = v;
		return container.childNodes.length === 1 ? container.firstChild as HTMLElement : container;
	})
)

const highlightableHits$ = contents$.pipe(
	mapLoaded(v => Array.from(v.querySelectorAll('.hl')) as HTMLElement[]),
	shareReplay(1)
)

type LoadableValues<Input extends readonly Loadable<any>[]> = { [K in keyof Input]: Input[K] extends Loadable<infer L> ? L : never; };
function mergeLoadables<T extends readonly Loadable<any>[]>(t: T): Loadable<LoadableValues<T>> {
	const firstNotLoaded = t.find(v => !isLoaded(v));
	if (firstNotLoaded) return firstNotLoaded;
	else return Loaded(t.map(v => isLoaded(v) ? v.value : undefined) as any);
}

const hitToHighlight$ = combineLatest([validPaginationParameters$, hits$, highlightableHits$]).pipe(
	map(mergeLoadables),
	mapLoaded(([pagination, hits, elements]) => {
		if (pagination.findhit == null) return Empty<HTMLElement>();
		const firstVisibleHitIndex = binarySearch(hits, h => pagination.wordstart - h[0]);
		const hitIndexToHighlight = binarySearch(hits, h => pagination.findhit! - h[0]);
		const localHitIndexToHighlight = hitIndexToHighlight - firstVisibleHitIndex;
		if (hitIndexToHighlight < 0 || hitIndexToHighlight >= elements.length) return Empty<HTMLElement>();
		return Loaded(elements[localHitIndexToHighlight]);
	}),
	distinctUntilChanged((a,b) => compareAsSortedJson(a, b)),
	shareReplay(1)
);

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

export {
	metadata$,
	hits$,
	contents$,
	validPaginationParameters$,
	ValidPaginationAndDocDisplayParameters,
	hitToHighlight$,

	input$,
	Input,

	Loadable,
	Loading,
	isLoading,
	Loaded,
	isLoaded,
	Error,
	isError,
	Empty,
	isEmpty,
}
