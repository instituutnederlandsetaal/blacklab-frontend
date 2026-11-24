import { shallowReactive, type Ref } from 'vue';

import { loadableMethods, type Loadable } from './loadable-core';

export type RetryableLoadable<T> = Loadable<T> & { retry: () => void };

export function loadableReactiveFromSnapshot<T>(snapshot: Readonly<Ref<Loadable<T>>>, retry: () => void): RetryableLoadable<T> {
	return shallowReactive({
		...loadableMethods,
		retry,
		get state() {
			return snapshot.value.state;
		},
		get value() {
			return snapshot.value.value;
		},
		get error() {
			return snapshot.value.error;
		},
	});
}
