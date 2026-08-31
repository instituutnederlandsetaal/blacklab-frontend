import type { Observable } from 'rxjs';
import { BehaviorSubject, combineLatest, distinctUntilChanged, map, of, ReplaySubject, shareReplay } from 'rxjs';

import type { BLDoc, BLHitResults } from '@/types/blacklabtypes';

import type { BlackLabApi, FrontendApi } from '@/shared/api/lib/api-types';
import { getDocumentLength } from '@/shared/blacklab-helpers/normalize/result-helpers';
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

export type Input = Partial<{
	indexId: string | null;
	docId: string | null;
	patt: string | null;
	searchfield: string | null | undefined;
	pattgapdata: string | null | undefined;
	wordstart: number | null;
	wordend: number | null;
	findhit: number | null;
	pageSize: number | null;
	viewField: string | null;
}>;

/** Return an exact hit index, or `-insertionIndex - 1` when no hit starts at the requested position. */
function findHitIndex(hits: [number, number][], start: number): number {
	let low = 0;
	let high = hits.length - 1;
	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		if (hits[mid][0] < start) low = mid + 1;
		else if (hits[mid][0] > start) high = mid - 1;
		else return mid;
	}
	return -low - 1;
}

type ValidPaginationAndDocDisplayParameters = {
	indexId: string;
	docId: string;
	wordstart: number;
	wordend: number;
	pageSize: number | null;
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
		switchMapLoaded(m =>
			combineLoadableStreamsIncludingEmpty({
				doc: of(m),
				input: input$,
				hits: hits$,
			}),
		),
		mapLoaded(({ input, doc, hits }) => fixInput(input, doc.json, hits)),
		distinctUntilChanged(compareAsSortedJson),
		shareReplay(1),
	);

	const contents$ = validPaginationParameters$.pipe(
		mapLoaded(input => {
			// only let through the necessary parameters, otherwise we might refresh unnecessarily
			const request = {
				indexId: input.indexId,
				docId: input.docId,
				viewField: input.viewField,
				searchfield: input.searchfield,
				patt: input.patt,
				pattgapdata: input.pattgapdata,
			};

			return input.pageSize == null
				? request
				: {
						...request,
						wordstart: input.wordstart,
						wordend: input.wordend,
					};
		}),
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
		mapLoaded(([pagination, hits, { highlights }]) => {
			const firstHitIndex = findHitIndex(hits, pagination.wordstart);
			const firstVisibleHitIndex = hits.length ? clamp(firstHitIndex < 0 ? -firstHitIndex - 1 : firstHitIndex, 0, hits.length - 1) : 0;
			const hitIndexToHighlight = pagination.findhit != null ? findHitIndex(hits, pagination.findhit) : firstVisibleHitIndex;
			const localHitIndexToHighlight = hitIndexToHighlight - firstVisibleHitIndex;
			const hl = highlights[localHitIndexToHighlight] as HTMLElement | undefined;
			return {
				totalHits: hits.length,
				hitIndexToHighlight,
				hl,
				isHitVisible: hl != null,
			};
		}),
		shareReplay(1),
	);

	const currentPageSnippet$ = combineLatest([validPaginationParameters$, retrieveSnippetToggle$] as const).pipe(
		map(([pagination, enabled]) => (enabled ? pagination : Loadable.Empty())),
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
		contents$,
		hitToHighlight$,
	};
}

/** Given unvalidated pagination parameters and the size of the document, return the validated/fixed pagination parameters. */
function getDefaultPagination(input: Input, doclength: number): { wordstart: number; wordend: number } {
	const pageSize = getValidPageSize(input.pageSize);
	if (pageSize == null) {
		return { wordstart: 0, wordend: doclength };
	}

	// Defaults.
	let wordstart = input.wordstart ?? 0;
	let wordend = input.wordend ?? doclength;
	// Fix order (just in case)
	if (wordstart > wordend) [wordstart, wordend] = [wordend, wordstart];
	// Fix bounds.
	return {
		wordstart: clamp(wordstart, 0, doclength),
		wordend: clamp(wordend, 0, wordstart + pageSize),
	};
}

function getValidPageSize(pageSize: number | null | undefined): number | null {
	return pageSize != null && pageSize > 0 ? pageSize : null;
}

/**
 * Given all hits in the document and a findhit, return the findhit if it is a valid hit, otherwise return undefined.
 * @param findhit wordstart of a hit
 * @param hits the hits in the document (if any)
 * @returns
 */
function getValidfindhit(findhit: number | undefined | null, hits?: [number, number][]): number | undefined {
	if (findhit == null || !hits) return undefined;
	return findHitIndex(hits, findhit) >= 0 ? findhit : undefined;
}

function fixInput(input: Input, doc: BLDoc, hits?: [number, number][]): ValidPaginationAndDocDisplayParameters {
	const docLength = getDocumentLength(doc.docInfo, input.viewField ?? undefined);
	let { wordstart, wordend } = getDefaultPagination(input, docLength);
	const findhit = getValidfindhit(input.findhit, hits);
	const pageSize = getValidPageSize(input.pageSize);

	if (pageSize != null && findhit != null && (findhit < wordstart || findhit >= wordend)) {
		wordstart = Math.floor(findhit / pageSize) * pageSize;
		wordend = clamp(wordstart + pageSize, 0, docLength);
	}

	return {
		indexId: input.indexId!,
		docId: input.docId!,

		patt: input.patt || undefined,
		pattgapdata: input.pattgapdata || undefined,

		wordstart,
		wordend,
		findhit,
		// We wouldn't have gotten here if these were missing

		pageSize,
		page: pageSize == null ? 0 : Math.floor(wordstart / pageSize),
		maxPage: pageSize == null ? 0 : Math.max(0, Math.ceil(docLength / pageSize) - 1),

		searchfield: input.searchfield!,
		viewField: input.viewField!,
	};
}
