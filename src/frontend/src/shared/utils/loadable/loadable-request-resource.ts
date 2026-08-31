import { tryOnScopeDispose } from '@vueuse/core';
import axios from 'axios';
import { computed, shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';

import { Loadable, type Loadable as LoadableType } from './loadable-core';

import { ApiError } from '@/shared/api/lib/api-types';

export type RequestLike<T> = PromiseLike<T> & { cancel?: () => void };

export interface RequestRun {
	readonly signal: AbortSignal;
	wait<T>(request: RequestLike<T>): Promise<T>;
}

export interface RequestResourceState<T> {
	readonly phase: 'empty' | 'loading' | 'loaded' | 'error';
	readonly data: T | undefined;
	readonly error: ApiError | undefined;
	readonly showLoading: boolean;
}

type RequestFactory<I, T> = (input: I, run: RequestRun) => RequestLike<T>;

interface RequestResourceOptions<I, T> {
	request: RequestFactory<I, T>;
	debounceMs?: number | ((input: I) => number);
	keepPrevious?: boolean;
	keepPreviousOnError?: boolean;
	loadingIndicatorDelayMs?: number;
}

export interface ManualRequestResourceOptions<I, T> extends RequestResourceOptions<I, T> {
	mode: 'manual';
}

export interface ReactiveRequestResourceOptions<I, T> extends RequestResourceOptions<I, T> {
	mode: 'reactive';
	source: MaybeRefOrGetter<I | null | undefined>;
	immediate?: boolean;
	key?: (input: I) => unknown;
}

export interface RequestResource<I, T> {
	readonly state: Readonly<Ref<RequestResourceState<T>>>;
	run(input: I): void;
	retry(): void;
	cancel(): void;
	reset(): void;
	dispose(): void;
}

interface LoadedSnapshot<T> {
	data: T;
}

interface ActiveRun<I, T> extends RequestRun {
	input: I;
	controller: AbortController;
	previous: LoadedSnapshot<T> | undefined;
	debounceTimer: ReturnType<typeof setTimeout> | undefined;
	loadingTimer: ReturnType<typeof setTimeout> | undefined;
}

const ABORTED = Symbol('request resource aborted');
const EMPTY_STATE: RequestResourceState<never> = { phase: 'empty', data: undefined, error: undefined, showLoading: false };

export function useRequestResource<I, T>(options: ManualRequestResourceOptions<I, T>): RequestResource<I, T>;
export function useRequestResource<I, T>(options: ReactiveRequestResourceOptions<I, T>): RequestResource<I, T>;
export function useRequestResource<I, T>(options: ManualRequestResourceOptions<I, T> | ReactiveRequestResourceOptions<I, T>): RequestResource<I, T> {
	const { debounceMs = 0, keepPrevious = false, keepPreviousOnError = false, loadingIndicatorDelayMs = 0 } = options;
	const snapshot = shallowRef<RequestResourceState<T>>(EMPTY_STATE);
	let active: ActiveRun<I, T> | undefined;
	let retained: LoadedSnapshot<T> | undefined;
	let lastInput: I | undefined;
	let hasLastInput = false;
	let disposed = false;
	let stopSource = () => {};

	const publish = (state: RequestResourceState<T>) => {
		if (!disposed) snapshot.value = state;
	};

	const clearTimers = (run: ActiveRun<I, T>) => {
		if (run.debounceTimer != null) clearTimeout(run.debounceTimer);
		if (run.loadingTimer != null) clearTimeout(run.loadingTimer);
		run.debounceTimer = run.loadingTimer = undefined;
	};

	const abort = (run: ActiveRun<I, T>) => {
		clearTimers(run);
		run.controller.abort();
	};

	const takeActive = (run: ActiveRun<I, T>) => {
		if (active !== run) return false;
		active = undefined;
		abort(run);
		return true;
	};

	const publishCancelled = (run: ActiveRun<I, T>) => {
		publish(keepPrevious && run.previous ? { phase: 'loaded', data: run.previous.data, error: undefined, showLoading: false } : EMPTY_STATE);
	};

	const settleError = (run: ActiveRun<I, T>, error: unknown) => {
		if (!takeActive(run)) return;
		if (error === ABORTED || (error instanceof ApiError && error.isCancelledRequest) || axios.isCancel(error)) publishCancelled(run);
		else publish({ phase: 'error', data: keepPreviousOnError ? run.previous?.data : undefined, error: ApiError.wrap(error), showLoading: false });
	};

	const start = (run: ActiveRun<I, T>) => {
		if (active !== run || disposed) return;
		let request: RequestLike<T>;
		try {
			request = options.request(run.input, run);
		} catch (error) {
			settleError(run, error);
			return;
		}
		run.wait(request).then(
			data => {
				if (!takeActive(run)) return;
				retained = keepPrevious || keepPreviousOnError ? { data } : undefined;
				publish({ phase: 'loaded', data, error: undefined, showLoading: false });
			},
			error => settleError(run, error),
		);
	};

	const trigger = (input: I, bypassDebounce: boolean) => {
		if (disposed) return;
		lastInput = input;
		hasLastInput = true;
		const previous = snapshot.value.phase === 'loaded' ? { data: snapshot.value.data as T } : (active?.previous ?? retained);
		if (active) {
			const replaced = active;
			active = undefined;
			abort(replaced);
		}

		const controller = new AbortController();
		const run: ActiveRun<I, T> = {
			input,
			controller,
			previous,
			debounceTimer: undefined,
			loadingTimer: undefined,
			signal: controller.signal,
			wait<R>(request: RequestLike<R>) {
				if (controller.signal.aborted) {
					try {
						request.cancel?.();
					} catch {}
					return Promise.reject(ABORTED);
				}
				return new Promise<R>((resolve, reject) => {
					let settled = false;
					const cleanup = () => controller.signal.removeEventListener('abort', onAbort);
					const onAbort = () => {
						if (settled) return;
						settled = true;
						cleanup();
						try {
							request.cancel?.();
						} catch {}
						reject(ABORTED);
					};
					controller.signal.addEventListener('abort', onAbort, { once: true });
					try {
						request.then(
							value => {
								if (settled) return;
								if (controller.signal.aborted) return onAbort();
								settled = true;
								cleanup();
								resolve(value);
							},
							error => {
								if (settled) return;
								if (controller.signal.aborted) return onAbort();
								settled = true;
								cleanup();
								reject(error);
							},
						);
					} catch (error) {
						if (settled) return;
						if (controller.signal.aborted) return onAbort();
						settled = true;
						cleanup();
						reject(error);
					}
				});
			},
		};
		active = run;
		publish({ phase: 'loading', data: keepPrevious ? previous?.data : undefined, error: undefined, showLoading: loadingIndicatorDelayMs <= 0 });
		if (loadingIndicatorDelayMs > 0) {
			run.loadingTimer = setTimeout(() => {
				if (active === run) publish({ ...snapshot.value, showLoading: true });
			}, loadingIndicatorDelayMs);
		}

		let delay: number;
		try {
			delay = bypassDebounce ? 0 : typeof debounceMs === 'function' ? debounceMs(input) : debounceMs;
		} catch (error) {
			settleError(run, error);
			return;
		}
		if (delay > 0) run.debounceTimer = setTimeout(() => start(run), delay);
		else start(run);
	};

	const resource: RequestResource<I, T> = {
		state: computed(() => snapshot.value),
		run: input => trigger(input, false),
		retry: () => {
			if (hasLastInput) trigger(lastInput as I, true);
		},
		cancel: () => {
			if (!active || disposed) return;
			const cancelled = active;
			active = undefined;
			abort(cancelled);
			publishCancelled(cancelled);
		},
		reset: () => {
			if (disposed) return;
			if (active) {
				const reset = active;
				active = undefined;
				abort(reset);
			}
			retained = undefined;
			hasLastInput = false;
			lastInput = undefined;
			publish(EMPTY_STATE);
		},
		dispose: () => {
			if (disposed) return;
			resource.cancel();
			disposed = true;
			stopSource();
		},
	};

	if (options.mode === 'reactive') {
		let hasSourceKey = false;
		let sourceKey: unknown;
		if (options.immediate === false) {
			const initialInput = toValue(options.source);
			if (initialInput != null) {
				hasSourceKey = true;
				sourceKey = options.key ? options.key(initialInput) : initialInput;
			}
		}
		stopSource = watch(
			() => toValue(options.source),
			input => {
				if (input == null) {
					hasSourceKey = false;
					sourceKey = undefined;
					resource.reset();
					return;
				}
				const key = options.key ? options.key(input) : input;
				if (hasSourceKey && Object.is(sourceKey, key)) return;
				hasSourceKey = true;
				sourceKey = key;
				trigger(input, false);
			},
			{ immediate: options.immediate ?? true },
		);
	}

	tryOnScopeDispose(() => resource.dispose());
	return resource;
}

export function resourceLoadable<T>(resource: Pick<RequestResource<unknown, T>, 'state'>): Readonly<Ref<LoadableType<T>>> {
	return computed(() => {
		const state = resource.state.value;
		if (state.phase === 'loaded') return Loadable.Loaded(state.data as T);
		if (state.phase === 'error') return Loadable.LoadingError<T>(state.error as ApiError);
		return state.phase === 'loading' ? Loadable.Loading<T>() : Loadable.Empty<T>();
	});
}
