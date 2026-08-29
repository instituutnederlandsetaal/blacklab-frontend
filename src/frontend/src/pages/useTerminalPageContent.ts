import { usePageBootstrap } from '@/navigation/page-bootstrap';
import { useCorpusId } from '@/navigation/page-context';

import { useFrontendApi } from '@/shared/api';
import { loadableFromStream } from '@/shared/utils/loadable/loadable-stream';

export function useTerminalPageContent(endpoint: 'getAbout' | 'getHelp') {
	const content = loadableFromStream(useFrontendApi()[endpoint](useCorpusId().value).toObservable());
	const pageBootstrap = usePageBootstrap();
	return { content, onContentSettled: () => pageBootstrap.markSettled() };
}
