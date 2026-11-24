import { computed, shallowRef, toValue, watch, type App, type MaybeRefOrGetter, type Ref } from 'vue';

import type { FormRuntime } from '@/features/form';
import type { SubmittedFormRestoration, SubmittedSearchState } from '@/features/search/model/submitted-search';
import type { Corpus } from '@/types/apptypes';

import { debugLog } from '@/shared/debug/debug';
import useInjectable from '@/shared/utils/useInjectable';

export const [, provideSearchFormRestoring, useSearchFormRestoring] = useInjectable<Readonly<Ref<boolean>>>('search-form-restoring');

/** Incoming searches and runtime replacement restore disposable drafts; submission does not. */
export function createSearchFormRestoration(dependencies: {
	corpus: MaybeRefOrGetter<Corpus | undefined>;
	runtime: Readonly<Ref<FormRuntime | null>>;
	submitted: SubmittedSearchState;
	restoredForm: SubmittedFormRestoration;
	beforeStateLoaded: () => Promise<unknown>;
}) {
	let stopped = false;
	const target = computed(() => {
		const corpus = toValue(dependencies.corpus);
		return corpus && dependencies.submitted.value ? { corpus, runtime: dependencies.runtime.value } : null;
	});
	const pending = shallowRef<typeof target.value>(null);
	const loading = computed(() => pending.value !== null);
	// The hook may rebuild the runtime, so all restores for this corpus share its promise.
	const hooks = new WeakMap<Corpus, Promise<unknown>>();
	async function restore() {
		if (stopped) return;
		const snapshot = target.value;
		pending.value = snapshot;
		if (!snapshot) return;
		const { corpus, runtime } = snapshot;
		if (!hooks.has(corpus)) hooks.set(corpus, Promise.resolve().then(dependencies.beforeStateLoaded));
		try {
			await hooks.get(corpus);
			if (target.value !== snapshot || pending.value !== snapshot) return;
			const form = dependencies.restoredForm.value;
			if (form) runtime?.state.replaceState(form.state);
			if (form?.state.issues.length) debugLog('form', 'Search form restoration issues', form.state.issues);
		} catch (error) {
			if (target.value === snapshot && pending.value === snapshot) console.error('Failed to restore search form', error);
		} finally {
			if (pending.value === snapshot) pending.value = null;
		}
	}
	// Customization registration rebuilds the runtime, so restore the submitted query into each replacement.
	const stopRuntime = watch(dependencies.runtime, () => void restore());
	function stop() {
		stopped = true;
		pending.value = null;
		stopRuntime();
	}
	return {
		restore,
		stop,
		loading,
		install(app: App) {
			provideSearchFormRestoring(app, loading);
			app.onUnmount(stop);
		},
	};
}
