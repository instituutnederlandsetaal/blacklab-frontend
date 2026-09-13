import { computed, readonly, shallowRef, toValue, type MaybeRefOrGetter } from 'vue';

import type { Corpus } from '@/types/apptypes';

import useInjectable from '@/shared/utils/useInjectable';

export type ArticleQuery = {
	docId: string | null;
	viewField: string | null;
	searchfield: string | null;
	wordstart: number | null;
	wordend: number | null;
	findhit: number | null;
	patt: string | null;
	pattgapdata: string | null;
};

export type ArticleState = ReturnType<typeof createArticlePageState>;
export const [, provideArticleState, useArticleState] = useInjectable<ArticleState>('article-state');

/** Article controls change state; URL publication observes the completed change. */
export function createArticlePageState(corpus: MaybeRefOrGetter<Corpus | undefined>) {
	const empty: ArticleQuery = { docId: null, viewField: null, searchfield: null, wordstart: null, wordend: null, findhit: null, patt: null, pattgapdata: null };
	const query = shallowRef(empty);
	function field(value: string | null) {
		const index = toValue(corpus);
		return value && index?.allAnnotatedFieldsMap[value] ? value : (index?.mainAnnotatedField ?? '');
	}
	return {
		query: readonly(query),
		parameters: computed(() => ({ ...query.value, viewField: field(query.value.viewField), searchfield: field(query.value.searchfield) })),
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
