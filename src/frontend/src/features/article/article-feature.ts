import type { App, MaybeRefOrGetter } from 'vue';
import type { Router } from 'vue-router';

import { createArticlePageState, provideArticleState } from '@/features/article/model/article-page-state';
import type { Corpus } from '@/types/apptypes';
import { createArticleUrlBinding } from '@/url/article-state';

export function createArticleFeature({ corpus, router }: { corpus: MaybeRefOrGetter<Corpus | undefined>; router: Router }) {
	const state = createArticlePageState(corpus);
	const navigation = createArticleUrlBinding(router, state, corpus);

	return {
		install(app: App) {
			provideArticleState(app, state);
			app.use(navigation);
		},
	};
}
