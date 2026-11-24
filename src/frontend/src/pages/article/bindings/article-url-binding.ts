import { toValue, type MaybeRefOrGetter } from 'vue';
import type { LocationQueryRaw, RouteLocationNormalizedLoaded, Router } from 'vue-router';

import { readArticleQuery, writeArticleQuery } from '@/app/router/url/article-query';
import { createUrlBinding } from '@/app/router/url/url-binding';
import type { ArticleState } from '@/pages/article/model/article-page-state';
import type { Corpus } from '@/types/apptypes';

export function createArticleUrlBinding(router: Router, state: ArticleState, corpus: MaybeRefOrGetter<Corpus | undefined>) {
	let extras: LocationQueryRaw = {};
	function location(route: RouteLocationNormalizedLoaded) {
		return { path: route.path, hash: route.hash, query: { ...extras, ...writeArticleQuery(state.query.value) } };
	}
	return createUrlBinding(router, {
		context: route => {
			const index = toValue(corpus);
			return route.name === 'article' && index?.id === route.params.corpus ? index : null;
		},
		read: (route, replaceUrl, index) => {
			const decoded = readArticleQuery(route.query, index);
			extras = decoded.extras;
			const docId = route.params.docId;
			state.restore({ indexId: index.id, docId: (Array.isArray(docId) ? docId[0] : docId) || null, ...decoded.parameters });
			const canonical = location(route);
			if (router.resolve(canonical).fullPath !== route.fullPath) replaceUrl(canonical);
		},
		write: location,
		leave: state.reset,
	});
}
