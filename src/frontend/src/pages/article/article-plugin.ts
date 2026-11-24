import type { App, MaybeRefOrGetter } from 'vue';
import type { Router } from 'vue-router';

import { createArticleUrlBinding } from '@/pages/article/bindings/article-url-binding';
import { createArticlePageState, provideArticlePageState } from '@/pages/article/model/article-page-state';
import type { Corpus } from '@/types/apptypes';

export function createArticlePlugin({ corpus, router }: { corpus: MaybeRefOrGetter<Corpus | undefined>; router: Router }) {
	const state = createArticlePageState();
	const urlBinding = createArticleUrlBinding(router, state, corpus);

	return {
		install(app: App) {
			provideArticlePageState(app, state);
			app.use(urlBinding);
		},
	};
}
