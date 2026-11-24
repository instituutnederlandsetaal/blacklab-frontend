import type { LocationQuery } from 'vue-router';

import { queryNumber, queryString } from '@/app/router/url/query';

export type ArticleParameters = {
	viewField: string | null;
	searchfield: string | null;
	wordstart: number | null;
	wordend: number | null;
	findhit: number | null;
	patt: string | null;
	pattgapdata: string | null;
};
const articleQueryKeys = new Set(['field', 'searchfield', 'searchField', 'wordstart', 'wordend', 'findhit', 'patt', 'query', 'pattgapdata']);

export function readArticleQuery(query: LocationQuery) {
	const parameters: ArticleParameters = {
		viewField: queryString(query, 'field'),
		searchfield: queryString(query, 'searchfield'),
		wordstart: queryNumber(query, 'wordstart'),
		wordend: queryNumber(query, 'wordend'),
		findhit: queryNumber(query, 'findhit'),
		patt: queryString(query, 'patt'),
		pattgapdata: queryString(query, 'pattgapdata'),
	};
	const extras = Object.fromEntries(Object.entries(query).filter(([key]) => !articleQueryKeys.has(key)));
	return { parameters, extras };
}

export function writeArticleQuery(parameters: Partial<ArticleParameters>, mainField: string | undefined) {
	const { wordstart, wordend, findhit, patt, pattgapdata, viewField, searchfield } = parameters;
	const query: Record<string, string> = {};
	if (wordstart != null) query.wordstart = String(wordstart);
	if (wordend != null) query.wordend = String(wordend);
	if (findhit != null) query.findhit = String(findhit);
	if (patt) query.patt = patt;
	if (pattgapdata) query.pattgapdata = pattgapdata;
	if (viewField && viewField !== mainField) query.field = viewField;
	if (patt && searchfield && searchfield !== (viewField ?? mainField)) query.searchfield = searchfield;
	return query;
}
