import { describe, expect, test } from 'vitest';

import { ApiError } from '@/shared/api/lib/api-types';
import { handleError } from '@/shared/api/lib/api-utils';

function responseError(data: unknown, contentType: string) {
	return {
		response: {
			config: { url: '/corpora/test/collocations/' },
			data,
			headers: { 'content-type': contentType },
			status: 200,
			statusText: 'OK',
		},
	} as never;
}

describe('API error presentation', () => {
	test('reports malformed JSON without exposing the raw response as the user-facing message', async () => {
		const raw = `{"hitGroups":[{"score":NaN}],"padding":"${'x'.repeat(5000)}"}`;

		const error = await handleError(responseError(raw, 'application/json')).catch(value => value as ApiError);

		expect(error).toBeInstanceOf(ApiError);
		expect(error.message).toBe('The server returned malformed JSON, so the results could not be read.');
		expect(error.message).not.toContain('NaN');
		expect(error.diagnostics).toContain('"score":NaN');
		expect(error.diagnostics!.length).toBeLessThanOrEqual(2001);
	});

	test('reduces an unexpected HTML body to a short plain-text preview', async () => {
		const error = await handleError(responseError(`<html><body>${'failure '.repeat(100)}</body></html>`, 'text/html')).catch(value => value as ApiError);

		expect(error.message).toMatch(/^The server returned an unexpected response: failure/);
		expect(error.message).not.toContain('<html>');
		expect(error.message.length).toBeLessThan(320);
	});
});
