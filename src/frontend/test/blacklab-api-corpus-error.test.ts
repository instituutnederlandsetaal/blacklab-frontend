import { beforeEach, expect, test, vi } from 'vitest';

import { createBlackLabApi } from '@/shared/api/blacklabApi';
import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';

const mock = vi.hoisted(() => ({ getCancelable: vi.fn() }));

vi.mock('@/shared/api/lib/api-endpoint', () => ({ createEndpoint: () => ({ getCancelable: mock.getCancelable }) }));

beforeEach(() => {
	mock.getCancelable.mockReset();
});

function corpusRequest() {
	let reject!: (error: ApiError) => void;
	mock.getCancelable.mockImplementation(
		() =>
			new CancelableRequest(
				new Promise((_, rejectPromise) => {
					reject = rejectPromise;
				}),
				() => {},
			),
	);
	return (error: ApiError) => reject(error);
}

test('preserves the BlackLab error for a missing corpus', async () => {
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0' });
	const reject = corpusRequest();
	const request = api.getCorpus('test');
	const error = new ApiError('CANNOT_OPEN_INDEX', "Could not open index 'test'. Please check the name.", 'Not Found', 404);
	const result = request.request.catch(cause => cause);
	reject(error);

	expect(await result).toBe(error);
});

test('preserves other 404 responses without adding corpus-specific wording', async () => {
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0' });
	const reject = corpusRequest();
	const request = api.getCorpus('test');
	const error = new ApiError('NOT_FOUND', 'No resource at this path', 'Not Found', 404);
	const result = request.request.catch(cause => cause);
	reject(error);

	expect(await result).toBe(error);
});
