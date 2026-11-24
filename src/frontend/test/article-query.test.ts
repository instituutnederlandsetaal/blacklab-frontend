import { expect, test } from 'vitest';

import { articleFieldParams, writeArticleQuery } from '@/app/router/url/article-query';

test.each([
	{ mainField: 'contents', field: 'contents', searchfield: 'contents', expected: { patt: '[]' } },
	{ mainField: 'contents__nl', field: 'contents__en', searchfield: 'contents__nl', expected: { patt: '[]', field: 'contents__en', searchfield: 'contents__nl' } },
	{ mainField: 'contents__nl', field: 'contents__en', searchfield: 'contents__en', expected: { patt: '[]', field: 'contents__en' } },
	{ mainField: 'contents__nl', field: 'contents__nl', searchfield: 'contents__en', expected: { patt: '[]', searchfield: 'contents__en' } },
])('document links preserve necessary fields for $field from $searchfield', ({ expected, mainField, ...fields }) => {
	expect(writeArticleQuery({ patt: '[]', ...articleFieldParams({ patt: '[]', ...fields }, mainField) })).toEqual(expected);
});

test('opening a document without a pattern only needs the displayed field', () => {
	expect(writeArticleQuery(articleFieldParams({ field: 'translation', searchfield: 'contents' }, 'contents'))).toEqual({ field: 'translation' });
});
