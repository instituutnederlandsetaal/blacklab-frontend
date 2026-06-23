import { type Ref } from 'vue';

import useInjectable from '@/shared/utils/useInjectable';

export type CustomScriptTiming = 'immediate' | 'after-page-bootstrap';

/**
 * We need some metadata about the current route in order for customJs and customCss to work correctly.
 * Store it in a standardized object so we can be sure it's available as expected.
 */
export type PageMeta = {
	name: string;
	getTitle?: (corpusDisplayName: string) => string;
	customScriptTiming?: CustomScriptTiming;
};

const [_corpusIdKey, provideCorpusId, useCorpusId] = useInjectable<Ref<string | undefined>>('corpus_id');
const [_articleIdKey, provideArticleId, useArticleId] = useInjectable<Ref<string | undefined>>('article_id');
const [_pageMetaKey, providePageMeta, usePageMeta] = useInjectable<Ref<PageMeta | null>>('page_meta');

export { provideArticleId, provideCorpusId, providePageMeta, useArticleId, useCorpusId, usePageMeta };
