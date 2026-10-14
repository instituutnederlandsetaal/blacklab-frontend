// @vitest-environment jsdom

import { createMockApi, rejectedRequest } from '@test/mocks/api';
import { describe, expect, test } from 'vitest';
import { effectScope } from 'vue';

import * as UIStore from '@/app/state/ui-state';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import { queryHistoryFromUrl } from '@/url/query-history';

import { createCorpus, resetSearchFormConfig } from './form/search-form-fixture';

describe('legacy query restoration', () => {
	test('regression: imported legacy pattern aliases survive a failed server parse', async () => {
		const corpus = createCorpus();
		resetSearchFormConfig();
		const scope = effectScope();
		const customizations = scope.run(() => createCustomizations(createCustomizationRegistry(corpus), corpus, UIStore.getState, () => {}))!;
		const api = createMockApi({ blacklab: { getParsePattern: () => rejectedRequest('Unsupported pattern') } });
		const url = '/test/search/hits?query=' + encodeURIComponent('[word="water"]');
		try {
			await expect(queryHistoryFromUrl(url, { blacklabApi: api.blacklabApi, corpus, customizations, filterState: { filters: {} }, tagsetState: null })).resolves.toEqual({
				url,
				displayValues: { pattern: '[word="water"]', filters: '' },
			});
		} finally {
			scope.stop();
		}
	});
});
