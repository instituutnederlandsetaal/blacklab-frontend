import { afterEach, describe, expect, test } from 'vitest';

import type { CorpusContext } from '@/app/state/useCorpusContext';
import * as FilterStore from '@/features/search/model/form/filter-state';

describe('legacy filter state', () => {
	afterEach(() => FilterStore.init({ index: undefined } as CorpusContext));

	test('keeps corpus date fields configured as date filters', () => {
		FilterStore.init({
			index: {
				metadataGroups: [
					{
						id: 'Publication',
						fields: [
							{
								id: 'published',
								uiType: 'date',
								defaultDisplayName: 'Publication date',
								defaultDescription: 'Date of publication',
							},
						],
					},
				],
			},
		} as CorpusContext);

		expect(FilterStore.getState().filters.published).toMatchObject({
			componentName: 'filter-date',
			metadata: { field: 'published' },
		});
	});
});
