import { toValue, type MaybeRefOrGetter } from 'vue';
import type { LocationQueryRaw, Router } from 'vue-router';

import type { ArticleState } from '@/features/article/model/article-page-state';
import type { Corpus } from '@/types/apptypes';
import { queryNumber, queryString } from '@/url/query';
import { createUrlProjection } from '@/url/url-projection';

export function createArticleUrlBinding(router: Router, state: ArticleState, corpus: MaybeRefOrGetter<Corpus | undefined>) {
	let extras: LocationQueryRaw = {};
	return createUrlProjection(router, {
		context: route => {
			const index = toValue(corpus);
			return route.name === 'article' && index?.id === route.params.corpus ? index : null;
		},
		read: route => {
			const query = route.query;
			extras = { ...query };
			for (const key of ['field', 'searchfield', 'searchField', 'wordstart', 'wordend', 'findhit', 'patt', 'query', 'pattgapdata']) delete extras[key];
			const docId = route.params.docId;
			state.restore({
				docId: (Array.isArray(docId) ? docId[0] : docId) || null,
				viewField: queryString(query, 'field'),
				searchfield: queryString(query, 'searchfield'),
				wordstart: queryNumber(query, 'wordstart'),
				wordend: queryNumber(query, 'wordend'),
				findhit: queryNumber(query, 'findhit'),
				patt: queryString(query, 'patt'),
				pattgapdata: queryString(query, 'pattgapdata'),
			});
		},
		write: route => {
			const { docId: _docId, viewField: field, ...query } = state.query.value;
			return {
				path: route.path,
				hash: route.hash,
				query: {
					...extras,
					...Object.fromEntries(
						Object.entries({ field, ...query })
							.filter(([, value]) => value !== null)
							.map(([key, value]) => [key, String(value)]),
					),
				},
			};
		},
		leave: state.reset,
	});
}
