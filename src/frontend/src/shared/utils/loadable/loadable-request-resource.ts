import axios from 'axios';
import { computed, onScopeDispose, shallowReadonly, shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';

import { Loadable, type Empty, type Loaded, type LoadingError } from './loadable-core';

import { ApiError } from '@/shared/api/lib/api-types';

export type RequestLike<T> = PromiseLike<T> & { cancel?: () => void };

export interface RequestRun {
	/** Check signal.throwIfAborted() after a progressive await and before mutating domain state. */
	readonly signal: AbortSignal;
	wait<T>(request: RequestLike<T>): Promise<T>;
}

export interface RequestResourceState<T> {
	readonly loading: boolean;
	readonly settled: Empty<T> | Loaded<T> | LoadingError<T>;
}

export interface RequestResource<I, T> {
	/** Render this input's state, hiding the previous result while a request is pending. */
	readonly current: Readonly<Ref<Loadable<T>>>;
	readonly state: Readonly<Ref<RequestResourceState<T>>>;
	run: (input: I) => void;
	retry: () => void;
	cancel(): void;
	reset(): void;
}

class ResourceRun<I> extends AbortController implements RequestRun {
	constructor(
		readonly input: I,
		readonly deferred: boolean,
	) {
		super();
	}

	wait<T>(request: RequestLike<T>): Promise<T> {
		const { signal } = this;
		return new Promise<T>((resolve, reject) => {
			const onAbort = () => {
				reject(signal.reason);
				try {
					request.cancel?.();
				} catch {}
			};
			const onError = (error: unknown) => {
				if (signal.aborted) return;
				signal.removeEventListener('abort', onAbort);
				reject(error);
			};
			if (signal.aborted) onAbort();
			else signal.addEventListener('abort', onAbort, { once: true });
			try {
				request.then(value => {
					if (signal.aborted) return;
					signal.removeEventListener('abort', onAbort);
					resolve(value);
				}, onError);
			} catch (error) {
				onError(error);
			}
		});
	}
}

const EMPTY_STATE: RequestResourceState<never> = { loading: false, settled: Loadable.Empty() };

export function useRequestResource<I = void, T = unknown>(
	request: (input: I, run: RequestRun) => RequestLike<T>,
	reactive?: { source: MaybeRefOrGetter<I | null | undefined>; key?: (input: I) => unknown },
): RequestResource<I, T> {
	const snapshot = shallowRef<RequestResourceState<T>>(EMPTY_STATE);
	// Keep the last input for retry, including after completion or cancellation.
	const latest = shallowRef<ResourceRun<I>>();
	let disposed = false;

	function finish(run: ResourceRun<I>, state: RequestResourceState<T>) {
		if (run.signal.aborted) return;
		run.abort();
		// A transport's cancel handler can synchronously start a replacement.
		if (latest.value === run) snapshot.value = state;
	}

	async function start(run: ResourceRun<I>) {
		if (run.signal.aborted) return;
		try {
			const value = await run.wait(request(run.input, run));
			finish(run, { loading: false, settled: Loadable.Loaded(value) });
		} catch (error) {
			if (run.signal.aborted) return;
			const cancelled = (error instanceof ApiError && error.isCancelledRequest) || axios.isCancel(error);
			finish(run, cancelled ? EMPTY_STATE : { loading: false, settled: Loadable.LoadingError(ApiError.wrap(error)) });
		}
	}

	function trigger(input: I, deferred = false) {
		if (disposed) return;
		const previous = latest.value;
		const run = new ResourceRun(input, deferred);
		latest.value = run;
		previous?.abort();
		if (run.signal.aborted) return;
		snapshot.value = { loading: true, settled: snapshot.value.settled };
		if (!deferred) void start(run);
	}

	const resource: RequestResource<I, T> = {
		state: shallowReadonly(snapshot),
		current: computed(() => (snapshot.value.loading ? Loadable.Loading<T>() : snapshot.value.settled)),
		run: input => trigger(input),
		retry() {
			if (latest.value) trigger(latest.value.input);
		},
		cancel() {
			if (latest.value) finish(latest.value, EMPTY_STATE);
		},
		reset() {
			if (disposed) return;
			const previous = latest.value;
			latest.value = undefined;
			previous?.abort();
			if (!latest.value) snapshot.value = EMPTY_STATE;
		},
	};

	onScopeDispose(() => {
		disposed = true;
		resource.cancel();
		latest.value = undefined;
	}, true);

	if (reactive) {
		// Abort obsolete work immediately, but batch replacement requests before rendering.
		watch(latest, run => {
			if (run?.deferred) void start(run);
		});
		watch(
			() => {
				const input = toValue(reactive.source);
				return [input, input == null || !reactive.key ? input : reactive.key(input)] as const;
			},
			([input, key], previous) => {
				if (input == null) resource.reset();
				else if (previous?.[0] == null || !Object.is(previous[1], key)) trigger(input, previous !== undefined);
			},
			{ immediate: true, flush: 'sync' },
		);
	}

	return resource;
}
