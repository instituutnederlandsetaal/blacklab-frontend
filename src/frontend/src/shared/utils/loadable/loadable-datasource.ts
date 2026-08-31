import { computed } from 'vue';

import { loadableReactive, type ControlledLoadable } from './loadable-reactive';
import { resourceLoadable, useRequestResource } from './loadable-request-resource';

import type { CancelableRequest } from '@/shared/api/lib/api-types';

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
	const resource = useRequestResource<void, T>({ mode: 'manual', request: makeRequest });
	const loadable = resourceLoadable(resource);
	resource.run();
	return loadableReactive(
		computed(() => loadable.value.state),
		computed(() => loadable.value.value),
		computed(() => loadable.value.error),
		{ retry: () => resource.retry(), stop: () => resource.cancel() },
	) as LoadableFromRequest<T>;
}
