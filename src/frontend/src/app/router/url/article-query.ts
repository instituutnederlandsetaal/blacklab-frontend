import type { LocationQuery } from 'vue-router';

import { queryNumber, queryString } from '@/app/router/url/query';
import type { Corpus } from '@/types/apptypes';

import { resolveAnnotatedField } from '@/shared/blacklab-helpers/corpus';

export type ArticleParameters = {
	field?: string;
	searchfield?: string;
	wordstart: number | null;
	wordend: number | null;
	findhit: number | null;
	patt: string | null;
	pattgapdata: string | null;
};
const articleQueryKeys = new Set(['field', 'searchfield', 'searchField', 'wordstart', 'wordend', 'findhit', 'patt', 'query', 'pattgapdata']);

export function readArticleQuery(query: LocationQuery, corpus: Corpus) {
	const field = resolveAnnotatedField(corpus, queryString(query, 'field'))?.id;
	const source = queryString(query, 'searchfield', ['searchField']);
	const searchfield = source ? resolveAnnotatedField(corpus, source)?.id : undefined;
	const patt = queryString(query, 'patt');
	const parameters: ArticleParameters = {
		...articleFieldParams({ field, searchfield, patt }, corpus.mainAnnotatedField),
		wordstart: queryNumber(query, 'wordstart'),
		wordend: queryNumber(query, 'wordend'),
		findhit: queryNumber(query, 'findhit'),
		patt,
		pattgapdata: queryString(query, 'pattgapdata'),
	};
	const extras = Object.fromEntries(Object.entries(query).filter(([key]) => !articleQueryKeys.has(key)));
	return { parameters, extras };
}

/** Article links and the contents endpoint use the same field parameters. */
export function articleFieldParams({ field, searchfield, patt }: Partial<ArticleParameters>, mainField: string) {
	return {
		field: field !== mainField ? field : undefined,
		searchfield: patt && searchfield && searchfield !== (field ?? mainField) ? searchfield : undefined,
	};
}

export function writeArticleQuery(parameters: Partial<ArticleParameters>) {
	const query: Record<string, string> = {};
	for (const key of ['wordstart', 'wordend', 'findhit', 'patt', 'pattgapdata', 'field', 'searchfield'] as const) {
		const value = parameters[key];
		if (value != null && value !== '') query[key] = String(value);
	}
	return query;
}
