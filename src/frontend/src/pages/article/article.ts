import type { Observable } from 'rxjs';
import { BehaviorSubject, combineLatest, distinctUntilChanged, map, of, ReplaySubject, shareReplay } from 'rxjs';
import { toValue, type MaybeRefOrGetter } from 'vue';

import { getArticlePagination } from '@/features/article/model/article-pagination';
import type { Corpus } from '@/types/apptypes';
import type { BLDoc, BLHitResults, BLSearchParameters } from '@/types/blacklabtypes';

import { ApiError, CancelableRequest, type BlackLabApi, type DocumentContentsParameters, type FrontendApi } from '@/shared/api/lib/api-types';
import { getDocumentLength } from '@/shared/blacklab-helpers/corpus';
import { getDocumentSnippet } from '@/shared/blacklab-helpers/document-snippet';
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

export type Input = Partial<{
	indexId: string | null;
	docId: string | null;
	patt: string | null;
	searchfield: string | null;
	pattgapdata: string | null;
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

export function createArticleStreams(blacklab: BlackLabApi, frontend: FrontendApi, corpus: MaybeRefOrGetter<Corpus>) {
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
			field: i.searchfield !== toValue(corpus).mainAnnotatedField ? i.searchfield || undefined : undefined,
			viewField: i.viewField,
			searchfield: i.searchfield,
			pattgapdata: i.pattgapdata || undefined,
		})),
		distinctUntilChanged(compareAsSortedJson),
		switchMapLoaded(({ indexId, viewField, searchfield, ...params }) => getDocumentHits(blacklab, indexId, params, viewField !== searchfield ? viewField : undefined).toObservable()),
		mapLoaded(hits => hits.sort((a, b) => a[0] - b[0] || a[1] - b[1])),
		shareReplay(1),
	);

	/**
	 * This is only available after metadata and any requested hits are loaded.
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
		mapLoaded(({ input, doc, hits }) => fixInput(toValue(corpus), input, doc.json, hits)),
		distinctUntilChanged(compareAsSortedJson),
		shareReplay(1),
	);

	const contents$ = validPaginationParameters$.pipe(
		mapLoaded((input): DocumentContentsParameters => ({
			// only let through the necessary parameters, otherwise we might refresh unnecessarily
			indexId: input.indexId,
			docId: input.docId,
			viewField: input.viewField !== toValue(corpus).mainAnnotatedField ? input.viewField : undefined,
			searchfield: input.searchfield !== input.viewField ? input.searchfield : undefined,
			patt: input.patt,
			pattgapdata: input.pattgapdata,
			wordstart: input.pageSize != null ? input.wordstart : undefined,
			wordend: input.pageSize != null ? input.wordend : undefined,
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
		mapLoaded(([pagination, hits, { highlights }]) => {
			const firstHitIndex = findHitIndex(hits, pagination.wordstart);
			const overlapping = hits.findIndex(([start, end]) => start < pagination.wordend && end > pagination.wordstart);
			const firstVisibleHitIndex = overlapping >= 0 ? overlapping : hits.length ? Math.min(Math.max(firstHitIndex < 0 ? -firstHitIndex - 1 : firstHitIndex, 0), hits.length - 1) : 0;
			const hitIndexToHighlight = pagination.findhit != null ? findHitIndex(hits, pagination.findhit) : firstVisibleHitIndex;
			const localHitIndexToHighlight = hitIndexToHighlight - firstVisibleHitIndex;
			// Generated BlackLab stylesheets copy start/end; our built-ins expose data-hit-start/end.
			const positioned = highlights.filter(highlight => highlight.hasAttribute('data-hit-start') || highlight.hasAttribute('start'));
			const range = hits[hitIndexToHighlight];
			const hl = positioned.length
				? positioned.find(
						highlight => Number(highlight.dataset.hitStart ?? highlight.getAttribute('start')) === range?.[0] && Number(highlight.dataset.hitEnd ?? highlight.getAttribute('end')) === range?.[1],
					)
				: highlights[localHitIndexToHighlight];
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
		switchMapLoaded(pagination =>
			getDocumentSnippet(
				blacklab,
				pagination.indexId,
				pagination.docId,
				pagination.viewField !== toValue(corpus).mainAnnotatedField ? pagination.viewField : undefined,
				pagination.wordstart,
				pagination.wordend,
			).toObservable(),
		),
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

function fixInput(corpus: Corpus, input: Input, doc: BLDoc, hits?: [number, number][]): ValidPaginationAndDocDisplayParameters {
	const docLength = getDocumentLength(corpus, doc.docInfo, input.viewField) ?? 0;
	const findhit = input.findhit != null && input.findhit >= 0 && input.findhit < docLength ? getValidfindhit(input.findhit, hits) : undefined;

	return {
		indexId: input.indexId!,
		docId: input.docId!,

		patt: input.patt || undefined,
		pattgapdata: input.pattgapdata || undefined,

		...getArticlePagination({ ...input, findhit }, docLength),
		findhit,
		// We wouldn't have gotten here if these were missing

		searchfield: input.searchfield!,
		viewField: input.viewField!,
	};
}

/** The server may cap each hits window even when a larger number is requested. */
function getDocumentHits(blacklab: BlackLabApi, indexId: string, params: Omit<BLSearchParameters, 'number'>, targetField?: string | null): CancelableRequest<[number, number][]> {
	let pending: CancelableRequest<BLHitResults> | undefined;
	let cancelled = false;
	async function retrieve() {
		const ranges: [number, number][] = [];
		for (let first = 0; ;) {
			if (cancelled) throw ApiError.CANCELLED;
			pending = blacklab.getHits<BLHitResults>(indexId, { ...params, first, number: 2 ** 31 - 1, context: 0, listvalues: '__do_not_send_anything__' });
			const results = await pending;
			// Keep the query in its source field; parallel hits already carry target coordinates.
			for (const hit of results.hits) {
				const range = targetField ? hit.otherFields?.[targetField] : hit;
				if (range) ranges.push([range.start, range.end]);
			}
			if (!results.summary.results.window.hasNext || !results.hits.length) return ranges;
			first += results.hits.length;
		}
	}
	return new CancelableRequest(retrieve(), () => {
		cancelled = true;
		pending?.cancel();
	});
}
