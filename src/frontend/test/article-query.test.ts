import { expect, test } from 'vitest';

import { writeArticleQuery } from '@/app/router/url/article-query';

test.each([
	{ mainField: 'contents', viewField: 'contents', searchfield: 'contents', expected: { patt: '[]' } },
	{ mainField: 'contents__nl', viewField: 'contents__en', searchfield: 'contents__nl', expected: { patt: '[]', field: 'contents__en', searchfield: 'contents__nl' } },
	{ mainField: 'contents__nl', viewField: 'contents__en', searchfield: 'contents__en', expected: { patt: '[]', field: 'contents__en' } },
	{ mainField: 'contents__nl', viewField: 'contents__nl', searchfield: 'contents__en', expected: { patt: '[]', searchfield: 'contents__en' } },
])('document links preserve necessary fields for $viewField from $searchfield', ({ expected, mainField, ...fields }) => {
	expect(writeArticleQuery({ patt: '[]', ...fields }, mainField)).toEqual(expected);
});
