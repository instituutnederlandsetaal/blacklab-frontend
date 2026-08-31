import { computed } from 'vue';

import { Loadable } from './loadable-core';
import { loadableReactiveFromSnapshot, type RetryableLoadable } from './loadable-reactive';
import { useRequestResource } from './loadable-request-resource';

import type { CancelableRequest } from '@/shared/api/lib/api-types';

export type LoadableFromRequest<T> = RetryableLoadable<T>;

/**
 * Create a Loadable that is driven by a CancelableRequest. The request is triggered immediately and can be retriggered by calling retry().
 * This is basically a simple wrapper to go from async behavior to reactive behavior.
 */
export function loadableFromRequest<T>(makeRequest: () => CancelableRequest<T>): LoadableFromRequest<T> {
	const resource = useRequestResource<void, T>({
		mode: 'manual',
		request: makeRequest,
	});
	resource.run();
	return loadableReactiveFromSnapshot(
		computed(() => (resource.state.value.loading ? Loadable.Loading<T>() : resource.state.value.settled)),
		{ retry: () => resource.retry() },
	) as LoadableFromRequest<T>;
}
