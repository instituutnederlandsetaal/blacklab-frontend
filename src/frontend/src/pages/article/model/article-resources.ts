import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type { ArticleParameters } from '@/app/router/url/article-query';
import { getArticlePagination } from '@/pages/article/model/article-pagination';
import type { BLHitResults, BLSearchParameters } from '@/types/blacklabtypes';

import { type BlackLabApi, type DocumentContentsParameters, type FrontendApi } from '@/shared/api/lib/api-types';
import { getDocumentLength } from '@/shared/blacklab-helpers/corpus';
import { getDocumentSnippet } from '@/shared/blacklab-helpers/document-snippet';
import { combine } from '@/shared/utils/loadable/loadable-combine';
import { Loadable } from '@/shared/utils/loadable/loadable-core';
import { useRequestResource, type RequestLike, type RequestRun } from '@/shared/utils/loadable/loadable-request-resource';
import { stableStringify } from '@/shared/utils/stable-stringify';

export type Input = Partial<ArticleParameters> & {
	indexId: string | null;
	mainField: string;
	docId?: string | null;
	pageSize?: number | null;
};

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

function articleRequest<I, T>(source: () => I | undefined, request: (input: I, run: RequestRun) => RequestLike<T>) {
	return useRequestResource(request, { source, key: stableStringify }).current;
}

function parseHtml(markup: string) {
	const html = document.createElement('div');
	html.innerHTML = markup;
	return html;
}

export function createArticleResources(blacklab: BlackLabApi, frontend: FrontendApi, inputs: MaybeRefOrGetter<Input>, statisticsEnabled: MaybeRefOrGetter<boolean>) {
	const documentId = computed(() => {
		const { indexId, docId } = toValue(inputs);
		return indexId != null && docId != null ? { indexId, docId } : undefined;
	});
	const metadata = articleRequest(
		() => documentId.value,
		async ({ indexId, docId }, run) => {
			const [json, html] = await Promise.all([run.wait(blacklab.getDocumentInfo(indexId, docId)), run.wait(frontend.getDocumentMetadata(indexId, docId))]);
			return { json, html: parseHtml(html) };
		},
	);
	const hits = articleRequest(
		() => {
			const { patt, mainField, field, searchfield, pattgapdata } = toValue(inputs);
			const doc = documentId.value;
			if (!doc || patt == null) return;
			return {
				indexId: doc.indexId,
				targetField: searchfield ? (field ?? mainField) : undefined,
				params: { docpid: doc.docId, patt, field, searchfield, pattgapdata: pattgapdata || undefined },
			};
		},
		({ indexId, params, targetField }, run) => getDocumentHits(blacklab, indexId, params, run, targetField),
	);

	const pagination = computed(() => {
		const optionalHits = hits.value.isEmpty() ? Loadable.Loaded(undefined) : hits.value;
		return Loadable.map(combine([metadata.value, optionalHits] as const), ([doc, ranges]) => {
			const input = toValue(inputs);
			const length = getDocumentLength(doc.json.docInfo, input.mainField, input.field) ?? 0;
			const findhit = input.findhit != null && input.findhit >= 0 && input.findhit < length ? getValidfindhit(input.findhit, ranges) : undefined;
			return { ...getArticlePagination({ ...input, findhit }, length), findhit };
		});
	});
	const contentsRequest = articleRequest(
		(): DocumentContentsParameters | undefined => {
			const page = pagination.value.value;
			const doc = documentId.value;
			if (!page || !doc) return;
			const input = toValue(inputs);
			return {
				...doc,
				field: input.field,
				searchfield: input.searchfield,
				patt: input.patt || undefined,
				pattgapdata: input.pattgapdata || undefined,
				wordstart: page.pageSize != null ? page.wordstart : undefined,
				wordend: page.pageSize != null ? page.wordend : undefined,
			};
		},
		params =>
			frontend.getDocumentContents(params).then(markup => {
				const html = parseHtml(markup);
				return { html, highlights: Array.from(html.querySelectorAll<HTMLElement>('.hl')) };
			}),
	);
	const contents = computed(() => Loadable.map(combine([pagination.value, contentsRequest.value] as const), ([, content]) => content));
	const hitToHighlight = computed(() =>
		Loadable.map(combine([pagination.value, hits.value, contents.value] as const), ([pagination, hits, { highlights }]) => {
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
	);
	const snippet = articleRequest(
		() => {
			const page = pagination.value.value;
			const doc = documentId.value;
			if (!toValue(statisticsEnabled) || !page || !doc) return;
			return { ...doc, field: toValue(inputs).field, start: page.wordstart, end: page.wordend };
		},
		({ indexId, docId, field, start, end }) => getDocumentSnippet(blacklab, indexId, docId, field, start, end),
	);
	const statistics = computed(() => Loadable.map(combine([pagination.value, snippet.value, metadata.value] as const), ([, snippet, metadata]) => ({ snippet, document: metadata.json })));

	return { metadata, hits, pagination, contents, hitToHighlight, statistics };
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

/** The server may cap each hits window even when a larger number is requested. */
async function getDocumentHits(blacklab: BlackLabApi, indexId: string, params: Omit<BLSearchParameters, 'number'>, run: RequestRun, targetField?: string | null) {
	const ranges: [number, number][] = [];
	for (let first = 0; ;) {
		const results = await run.wait(blacklab.getHits<BLHitResults>(indexId, { ...params, first, number: 2 ** 31 - 1, context: 0, listvalues: '__do_not_send_anything__' }));
		run.signal.throwIfAborted();
		// A parallel hit carries its target coordinates alongside the range in the search field.
		for (const hit of results.hits) {
			const range = targetField ? hit.otherFields?.[targetField] : hit;
			if (range) ranges.push([range.start, range.end]);
		}
		if (!results.summary.results.window?.hasNext || !results.hits.length) return ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
		first += results.hits.length;
	}
}
