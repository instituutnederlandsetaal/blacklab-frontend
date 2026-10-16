import type { BLHit } from '@/types/blacklabtypes';

import { ApiError, CancelableRequest, type BlackLabApi } from '@/shared/api/lib/api-types';

/** BlackLab can cap annotation arrays while echoing the requested end offset, so advance by the values actually returned. */
export function getDocumentSnippet(blacklab: BlackLabApi, indexId: string, docId: string, field: string | undefined, start: number, end: number): CancelableRequest<BLHit> {
	let pending: CancelableRequest<BLHit> | undefined;
	let cancelled = false;
	const snippet: BLHit = { docPid: docId, start, end, before: { punct: [] }, match: { punct: [] }, after: { punct: [] } };
	async function retrieve() {
		for (let position = start; position < end;) {
			if (cancelled) throw ApiError.CANCELLED;
			pending = blacklab.getSnippet(indexId, docId, field, position, end, 0);
			const part = await pending;
			const count = Object.entries(part.match).find(([annotation]) => annotation !== 'punct')?.[1].length ?? part.match.punct.length;
			if (count <= 0 || count > end - position) throw new ApiError('Invalid document snippet', `No complete annotation data for words ${position}–${end}.`, 'Invalid document snippet', undefined);
			for (const [annotation, values] of Object.entries(part.match)) {
				const combined = (snippet.match[annotation] ??= []);
				for (const value of values) combined.push(value);
			}
			position += count;
		}
		return snippet;
	}
	return new CancelableRequest(retrieve(), () => {
		cancelled = true;
		pending?.cancel();
	});
}
