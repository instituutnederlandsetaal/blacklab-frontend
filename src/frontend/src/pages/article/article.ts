import type { Observable } from 'rxjs';
import { BehaviorSubject, combineLatest, distinctUntilChanged, map, mergeMap, of, ReplaySubject, shareReplay } from 'rxjs';

import type { BLDoc, BLHitResults } from '@/types/blacklabtypes';

import type { BlackLabApi, FrontendApi } from '@/shared/api/lib/api-types';
import { getDocumentLength } from '@/shared/blacklab-helpers/normalize/result-helpers';
import { binarySearch } from '@/shared/utils/array-utils';
import { Loadable } from '@/shared/utils/loadable/loadable-core';
import {
	combineLoadables,
	combineLoadableStreams,
	combineLoadableStreamsIncludingEmpty,
	compareAsSortedJson,
	mapLoaded,
	switchMapLoaded,
	withRequiredKeys,
} from '@/shared/utils/loadable/loadable-stream';
import { clamp } from '@/shared/utils/number-utils';

// Define some input/intermediate types and utils.

export type DocInput = {
	indexId: string;
	docId: string;
};
export type HitsInput = {
	indexId: string;
	docId: string;
	patt: string;
	searchfield?: string | undefined;
	pattgapdata?: string | undefined;
};

export type PageInput = {
	wordstart: number;
	wordend: number;
	findhit?: number;
	pageSize: number;
	viewField: string;
};

type _Input = Partial<DocInput & HitsInput & PageInput>;
export type Input = { [K in keyof _Input]: _Input[K] | null };

type ValidPaginationAndDocDisplayParameters = {
	indexId: string;
	docId: string;
	docLength: number;
	wordstart: number;
	wordend: number;
	pageSize: number;
	/** 0-indexed */
	page: number;
	/** 0-indexed. Inclusive */
	maxPage: number;
	/** wordstart of a hit */
	findhit?: number;

	patt?: string;
	pattgapdata?: string;

	searchfield: string;
	viewField: string;
};

export function createArticleStreams(blacklab: BlackLabApi, frontend: FrontendApi) {
	/** The initial input */
	const inputsFromStore$ = new ReplaySubject<Input>(1);
	const input$ = inputsFromStore$.pipe(distinctUntilChanged(compareAsSortedJson), shareReplay(1));

	const retrieveSnippetToggle$ = new BehaviorSubject<boolean>(false);

	// Document metadata, both as JSON and HTML.
	// The HTML is used to display the document metadata in the UI, and has the backend XSLT transformations applied,
	// while the JSON is used to extract the document length for pagination purposes.
	const metadata$ = input$.pipe(
		map(withRequiredKeys('indexId', 'docId')),
		mapLoaded(i => ({ indexId: i.indexId, docId: i.docId })),
		distinctUntilChanged(compareAsSortedJson),
		switchMapLoaded(i =>
			combineLoadableStreams({
				json: blacklab.getDocumentInfo(i.indexId, i.docId).toObservable(),
				html: frontend
					.getDocumentMetadata(i.indexId, i.docId)
					.toObservable()
					.pipe(
						mapLoaded(html => {
							const container = document.createElement('div');
							container.innerHTML = html;
							return container;
						}),
					),
			}),
		),
		shareReplay(1),
	);

	// Document hits
	const hits$ = input$.pipe(
		map(withRequiredKeys('indexId', 'docId', 'patt')),
		mapLoaded(i => ({
			indexId: i.indexId,
			docpid: i.docId, // NOTE: blacklab requires docpid (lowercased), not docId!
			patt: i.patt,
			searchfield: i.searchfield || undefined,
			pattgapdata: i.pattgapdata || undefined,
		})),
		distinctUntilChanged(compareAsSortedJson),
		switchMapLoaded(i =>
			blacklab
				.getHits<BLHitResults>(i.indexId, {
					...i,
					first: 0,
					number: Math.pow(2, 31) - 1, // JAVA BACKEND: max_safe_integer is 2^31-1
					context: 0,
					listvalues: '__do_not_send_anything__', // we don't need this info
				})
				.toObservable(),
		),
		mapLoaded(hits => hits.hits.map(h => [h.start, h.end] as [number, number])),
		shareReplay(1),
	);

	/**
	 * This is only available after the metadata and hits are loaded.
	 * It is a guaranteed valid set of pagination parameters.
	 */
	const validPaginationParameters$: Observable<Loadable<ValidPaginationAndDocDisplayParameters>> = metadata$.pipe(
		switchMapLoaded(m => combineLoadableStreamsIncludingEmpty({ doc: of(m), input: input$, hits: hits$ })),
		mapLoaded(({ input, doc, hits }) => fixInput(input, doc.json, hits)),
		distinctUntilChanged(compareAsSortedJson),
		shareReplay(1),
	);

	// This observable is used to correct the store when the user enters on or navigates to a page that is out of bounds or otherwise invalid.
	const correctionsForStore$ = combineLatest([input$, validPaginationParameters$]).pipe(
		map(combineLoadables),
		mapLoaded(([maybeInvalid, valid]) => {
			const commonKeys = Object.keys(maybeInvalid).filter(k => k in valid) as Extract<keyof typeof maybeInvalid, keyof typeof valid>[];
			// extract those properties that are different
			const difference = commonKeys.reduce(
				(acc, key) => {
					if (maybeInvalid[key] !== valid[key]) acc[key] = maybeInvalid[key] as any;
					return acc;
				},
				{} as Partial<Pick<Input, (typeof commonKeys)[number]>>,
			);

			return difference;
		}),
		shareReplay(1),
	);

	const contents$ = validPaginationParameters$.pipe(
		mapLoaded(input => ({
			// only let through the necessary parameters, otherwise we might refresh unnecessarily
			indexId: input.indexId,
			docId: input.docId,
			viewField: input.viewField,
			searchfield: input.searchfield,
			patt: input.patt,
			pattgapdata: input.pattgapdata,
			wordstart: input.wordstart,
			wordend: input.wordend,
		})),
		distinctUntilChanged(compareAsSortedJson),
		switchMapLoaded(input => frontend.getDocumentContents(input).toObservable()),
		mapLoaded(v => {
			const html = document.createElement('div');
			html.innerHTML = v;
			const highlights = Array.from(html.querySelectorAll('.hl')) as HTMLElement[];
			return { html, highlights };
		}),
		shareReplay(1),
	);

	const hitToHighlight$ = combineLatest([validPaginationParameters$, hits$, contents$]).pipe(
		map(combineLoadables),
		mapLoaded(([pagination, hits, { html: container, highlights }]) => {
			const firstVisibleHitIndex = hits.length ? clamp(Math.abs(binarySearch(hits, h => pagination.wordstart - h[0])), 0, hits.length - 1) : 0;
			const hitIndexToHighlight = pagination.findhit != null ? binarySearch(hits, h => pagination.findhit! - h[0]) : firstVisibleHitIndex;
			const localHitIndexToHighlight = hitIndexToHighlight - firstVisibleHitIndex;
			const hl = highlights[localHitIndexToHighlight] as HTMLElement | undefined;
			return {
				totalHits: hits.length,
				hitIndexToHighlight,
				firstVisibleHitIndex,
				localHitIndexToHighlight,
				hl,
				isHitVisible: hl != null,
				container,
			};
		}),
		shareReplay(1),
	);

	const currentPageSnippet$ = combineLatest([validPaginationParameters$, retrieveSnippetToggle$] as const).pipe(
		mergeMap(([pagination, enabled]) => (enabled ? of(pagination) : of(Loadable.Empty()))),
		switchMapLoaded(pagination => blacklab.getSnippet(pagination.indexId, pagination.docId, pagination.viewField, pagination.wordstart, pagination.wordend, 0).toObservable()),
		shareReplay(1),
	);

	return {
		input$: inputsFromStore$,
		currentPageSnippet$,
		retrieveSnippetToggle$,
		metadata$,
		hits$,
		validPaginationParameters$,
		correctionsForStore$,
		contents$,
		hitToHighlight$,
	};
}

/** Given unvalidated pagination parameters and the size of the document, return the validated/fixed pagination parameters. */
function getDefaultPagination(input: Input, doclength: number): { wordstart: number; wordend: number } {
	// Defaults.
	let wordstart = input.wordstart ?? 0;
	let wordend = input.wordend ?? doclength;
	// Fix order (just in case)
	if (wordstart > wordend) [wordstart, wordend] = [wordend, wordstart];
	// Fix bounds.
	return {
		wordstart: clamp(wordstart, 0, doclength),
		wordend: clamp(wordend, 0, input.pageSize ? wordstart + input.pageSize : doclength),
	};
}

/**
 * Given all hits in the document and a findhit, return the findhit if it is a valid hit, otherwise return undefined.
 * @param findhit wordstart of a hit
 * @param hits the hits in the document (if any)
 * @returns
 */
function getValidfindhit(findhit: number | undefined | null, hits?: [number, number][]): number | undefined {
	if (findhit == null || !hits) return undefined;
	const hitIndex = binarySearch(hits, h => findhit - h[0]);
	return hitIndex >= 0 ? findhit : undefined;
}

/** Given a set of unvalidated pagination parameters, return a set of validated pagination parameters. */
function fixPagination({ wordstart, wordend, pageSize, findhit, docLength }: { wordstart: number; wordend: number; pageSize: number; findhit?: number; docLength: number }): {
	wordstart: number;
	wordend: number;
} {
	if (findhit == null || (findhit >= wordstart && findhit < wordend)) return { wordstart, wordend };
	const newPageStart = Math.floor(findhit / pageSize) * pageSize;
	return {
		wordstart: newPageStart,
		wordend: clamp(newPageStart + pageSize, 0, docLength),
	};
}

function fixInput(input: Input, doc: BLDoc, hits?: [number, number][]): ValidPaginationAndDocDisplayParameters {
	const docLength = getDocumentLength(doc.docInfo, input.viewField ?? undefined);
	let { wordstart, wordend } = getDefaultPagination(input, docLength);
	const findhit = getValidfindhit(input.findhit, hits);
	const pageSize = input.pageSize || docLength;

	({ wordstart, wordend } = fixPagination({ wordstart, wordend, pageSize, findhit, docLength }));

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

		searchfield: input.searchfield!,
		viewField: input.viewField!,
	};
}
