import { useCorpusId } from '@/app/router/corpus-id-injection';
import { usePageBootstrap } from '@/app/router/page-bootstrap';

import { useFrontendApi } from '@/shared/api';
import { loadableFromStream } from '@/shared/utils/loadable/loadable-stream';

export function usePageContent(endpoint: 'getAbout' | 'getHelp') {
	const content = loadableFromStream(useFrontendApi()[endpoint](useCorpusId().value).toObservable());
	const pageBootstrap = usePageBootstrap();
	return { content, onContentSettled: () => pageBootstrap.markScriptsReady() };
}
