import { createMockApi, resolvedRequest } from '@test/mocks/api';
import { expect, test, vi } from 'vitest';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';
import { getDocumentSnippet } from '@/shared/blacklab-helpers/document-snippet';

test.each([undefined, 'contents__en'])('retrieves the entire %s field when BlackLab caps arrays but echoes the requested end', async field => {
	const { blacklabApi } = createMockApi({
		blacklab: {
			getSnippet: (_index, docPid, _field, start, end) =>
				resolvedRequest({
					docPid,
					start,
					end,
					before: { punct: [] },
					after: { punct: [] },
					match: { punct: [' ', ' '], word: ['a', 'b', 'c', 'd', 'e', 'f'].slice(start, start + 2) },
				}),
		},
	});
	const snippet = await getDocumentSnippet(blacklabApi, 'parallel', 'doc', field, 0, 6);
	expect(snippet.match.word).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
	expect(blacklabApi.getSnippet.mock.calls.map(call => call.slice(2, 6))).toEqual([
		[field, 0, 6, 0],
		[field, 2, 6, 0],
		[field, 4, 6, 0],
	]);
});

test('an empty field needs no snippet request', async () => {
	const { blacklabApi } = createMockApi();
	await expect(getDocumentSnippet(blacklabApi, 'parallel', 'doc', 'contents__en', 0, 0)).resolves.toMatchObject({ start: 0, end: 0, match: { punct: [] } });
	expect(blacklabApi.getSnippet).not.toHaveBeenCalled();
});

test('cancels the outstanding request when statistics are hidden or the document changes', async () => {
	let reject!: (error: ApiError) => void;
	const cancel = vi.fn(() => reject(ApiError.CANCELLED));
	const { blacklabApi } = createMockApi({
		blacklab: {
			getSnippet: () =>
				new CancelableRequest(
					new Promise((_resolve, rejectRequest) => {
						reject = rejectRequest;
					}),
					cancel,
				),
		},
	});
	const request = getDocumentSnippet(blacklabApi, 'parallel', 'doc', 'contents__en', 10, 20);
	request.cancel();
	await expect(request).rejects.toBe(ApiError.CANCELLED);
	expect(cancel).toHaveBeenCalledOnce();
});
