import * as RootStore from '@/app/state/root-store';
import router from '@/navigation/router';
import UrlStateParserArticle from '@/url/url-state-parser-article';
import { ref, watch } from 'vue';

let stopTemporaryArticleInitialUrlParseHandle: (() => void)|null = null;

export const temporaryArticleInitialUrlParsePending = ref(false);

function getRelativeLocationSegments(): string[] {
	const pathSegments = window.location.pathname.split('/').filter(Boolean);
	const contextSegments = (CONTEXT_URL || '').split('/').filter(Boolean);
	return pathSegments.slice(contextSegments.length);
}

function shouldTemporarilyDecodeInitialArticleUrl(): boolean {
	const [, page, docId] = getRelativeLocationSegments();
	return page === 'docs' && !!docId;
}

export function startTemporaryArticleInitialUrlParse(): () => void {
	if (stopTemporaryArticleInitialUrlParseHandle) {
		return stopTemporaryArticleInitialUrlParseHandle;
	}

	let stopped = false;
	let stopWaitForStore: (() => void)|null = null;
	temporaryArticleInitialUrlParsePending.value = shouldTemporarilyDecodeInitialArticleUrl();

	void router.isReady().then(() => {
		if (stopped) {
			return;
		}

		const initialRoute = router.currentRoute.value;
		if (initialRoute.name !== 'article' || !initialRoute.params.corpus) {
			temporaryArticleInitialUrlParsePending.value = false;
			return;
		}

		// TEMPORARY VALIDATION PATCH:
		// Re-enable initial URL decode only for direct article-page loads so the migrated
		// article store can be validated without reconnecting the broader URL sync subsystem.
		stopWaitForStore = watch(() => RootStore.get.loadingState().value, loadingState => {
			if (!loadingState.isLoaded()) {
				return;
			}

			stopWaitForStore?.();
			stopWaitForStore = null;

			if (stopped || router.currentRoute.value.name !== 'article') {
				temporaryArticleInitialUrlParsePending.value = false;
				return;
			}

			void new UrlStateParserArticle()
				.get()
				.then(stateFromUrl => {
					if (!stopped && router.currentRoute.value.name === 'article') {
						RootStore.actions.replace(stateFromUrl);
					}
				})
				.catch(error => {
					console.error('Temporary article initial URL decode failed', error);
				})
				.finally(() => {
					temporaryArticleInitialUrlParsePending.value = false;
				});
		}, {
			immediate: true,
		});
	});

	stopTemporaryArticleInitialUrlParseHandle = () => {
		stopped = true;
		temporaryArticleInitialUrlParsePending.value = false;
		stopWaitForStore?.();
		stopWaitForStore = null;
		stopTemporaryArticleInitialUrlParseHandle = null;
	};

	return stopTemporaryArticleInitialUrlParseHandle;
}