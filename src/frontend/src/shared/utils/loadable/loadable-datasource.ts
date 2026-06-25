import { tryOnScopeDispose } from '@vueuse/core';
import axios from 'axios';
import { ref, toRef, toValue, watch, type MaybeRef } from 'vue';

import { LoadableState } from './loadable-core';
import { loadableReactive, type ControlledLoadable } from './loadable-reactive';

import { ApiError, type CancelableRequest } from '@/shared/api/lib/api-types';

export type LoadableFromRequest<T> = ControlledLoadable<T>;

/**
 * Create a Loadable that is driven by a CancelableRequest. The request is triggered immediately, and can be retriggered by calling retry(). The request can be cancelled by calling stop().
 * This is basically a simple wrapper to go from async behavior to reactive behavior.
 *
 * When called from within a vue component, cleanup will happen automatically on unmount,
 * but otherwise,
 * Don't forget to call stop() after you're done with it, or the stream will keep running.
 */
export function loadableFromRequest<T>(makeRequest: () => CancelableRequest<T>): LoadableFromRequest<T> {
	const value = ref<T>();
	const error = ref<ApiError>();
	const state = ref<LoadableState>(LoadableState.empty);

	let r: CancelableRequest<T>;
	function retry() {
		if (r) r.cancel();
		const localR = (r = makeRequest());
		r.then(
			v => {
				if (localR !== r) return; // request cancelled or retried, ignore
				value.value = v;
				error.value = undefined;
				state.value = LoadableState.loaded;
			},
			e => {
				if (localR !== r) return; // request cancelled or retried, ignore

				if ((e instanceof ApiError && e.isCancelledRequest) || axios.isCancel(e)) {
					value.value = undefined;
					error.value = undefined;
					state.value = LoadableState.empty;
				} else {
					value.value = undefined;
					error.value = ApiError.wrap(e);
					state.value = LoadableState.error;
				}
			},
		);
	}
	function stop() {
		r?.cancel();
	}

	tryOnScopeDispose(stop);

	retry(); // initial request.
	return loadableReactive(state, value, error, { retry, stop });
}

export function loadableFromComputedRequest<T>(request: MaybeRef<CancelableRequest<T>>): LoadableFromRequest<T> {
	request = toRef(request);
	const inner = loadableFromRequest(() => toValue(request));
	watch(request, _ => inner.retry()); // not immediate! inner has already started
	return inner;
}
