import * as RootStore from '@/app/state/root-store';
import router from '@/navigation/router';
import UrlStateParserArticle from '@/url/url-state-parser-article';
import { until } from '@vueuse/core';
import { onScopeDispose, ref } from 'vue';

export const articleLoadPending = ref(false);

let started = false;
export function startTemporaryArticleInitialUrlParse() {
	if (started) return;
	started = true;
	// Track stoppage locally instead of globally, 
	// because otherwise this sequence would be broken:
	// 1. start sequence, 
	// 2. sequence waiting for promise resolution,
	// 3. stop sequence (before promise resolves),
	// 4. start sequence again (while first one is still waiting for promise resolution),
	// 5. promise resolves, but we don't want to apply the result of the first sequence, because it was stopped in the meantime by step 3.
	// If we tracked stoppage globally, then step 3 would stop the first sequence, but then step 4 would start it again, and when the promise resolves in step 5, it would apply the result of the first sequence, even though it was stopped in step 3.
	// By tracking stoppage locally, we can ensure that when the promise resolves in step 5, we check if this particular sequence was stopped in step 3, and if so, we don't apply the result.
	let stopped = false;

	 // whatever started us was stopped again
	onScopeDispose(() => {
		stopped = true;
		started = false;
	});

	articleLoadPending.value = true;
	void router
		.isReady()
		.then(() => {
			const initialRoute = router.currentRoute.value;
			if (initialRoute.name !== 'article') {
				return;
			}
			return until(RootStore.get.loadingState()).toMatch(state => state.isLoaded())
		})
		.then(() => new UrlStateParserArticle().get())
		.then(stateFromUrl => {
			if (!stopped) {
				RootStore.actions.replace(stateFromUrl);
			}
		})
		.catch(e => {
			console.error('Failed to parse initial article URL state, falling back to defaults', e);
		})
		.finally(() => articleLoadPending.value = false);
}

