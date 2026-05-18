import { computed, type ObjectPlugin, type Ref } from 'vue';
import { createRouter as createRouterImpl } from 'vue-router';

import routerOptions from '@/app/routes/router-options';
import { provideCurrentCorpusId } from '@/entities/corpus/model/current-corpus-id';
import { provideCurrentDocumentId } from '@/entities/corpus/model/current-document-id';

export default function createRouter(): ObjectPlugin & {
	currentCorpusId: Ref<string | null>;
	currentDocumentId: Ref<string | null>;
} {
	const router = createRouterImpl(routerOptions);
	const currentCorpusId = computed(() => (router.currentRoute.value.params.corpus as string) || null);
	const currentDocumentId = computed(() => (router.currentRoute.value.params.document as string) || null);
	return {
		currentCorpusId,
		currentDocumentId,
		install(app) {
			app.use(router);
			provideCurrentCorpusId(app, currentCorpusId);
			provideCurrentDocumentId(app, currentDocumentId);
		},
	};
}
