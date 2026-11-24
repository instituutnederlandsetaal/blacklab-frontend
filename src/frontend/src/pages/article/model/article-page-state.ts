import { readonly, shallowRef } from 'vue';

import type { ArticleParameters } from '@/app/router/url/article-query';

import createAppInjection from '@/shared/vue/injection';

type ArticleQuery = ArticleParameters & { indexId: string | null; docId: string | null };

export type ArticleState = ReturnType<typeof createArticlePageState>;
export const [, provideArticlePageState, useArticlePageState] = createAppInjection<ArticleState>('article-page-state');

/** Article controls change state; URL publication observes the completed change. */
export function createArticlePageState() {
	const empty: ArticleQuery = { indexId: null, docId: null, wordstart: null, wordend: null, findhit: null, patt: null, pattgapdata: null };
	const query = shallowRef(empty);
	return {
		query: readonly(query),
		restore: (value: ArticleQuery) => {
			query.value = value;
		},
		reset: () => {
			query.value = empty;
		},
		showPage: (page: number, pageSize: number) => {
			query.value = { ...query.value, wordstart: page * pageSize, wordend: (page + 1) * pageSize, findhit: null };
		},
		showHit: (position: number) => {
			query.value = { ...query.value, wordstart: null, wordend: null, findhit: position };
		},
	};
}
