import useInjectable from '@/app/plugins/lib/useInjectable';
import { default as routerOptions } from '@/app/routes/router-options';
import { computed, type ObjectPlugin, type Ref } from 'vue';
import { createRouter as createRouterImpl } from 'vue-router';

const [_currentCorpusIdInjectionKey, _provideCurrentCorpusId, useCurrentCorpusId] = useInjectable<Ref<string | null>>("currentCorpusId");
const [_currentDocumentIdInjectionKey, _provideCurrentDocumentId, useCurrentDocumentId] = useInjectable<Ref<string | null>>("currentDocumentId");

export default function createRouter(): ObjectPlugin&{
	currentCorpusId: Ref<string|null>
	currentDocumentId: Ref<string|null>
} {
	const router = createRouterImpl(routerOptions);
	const currentCorpusId = computed(() => router.currentRoute.value.params.corpus as string || null);
	const currentDocumentId = computed(() => router.currentRoute.value.params.document as string || null);
	return {
		currentCorpusId,
		currentDocumentId,
		install(app) {
			app.use(router);
			_provideCurrentCorpusId(app, currentCorpusId);
			_provideCurrentDocumentId(app, currentDocumentId);
		}
	}
}

export { useCurrentCorpusId, useCurrentDocumentId };

