import { tryOnScopeDispose } from '@vueuse/core';
import axios from 'axios';
import { computed, shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';

import { Loadable, type Empty, type Loaded, type LoadingError } from './loadable-core';

import { ApiError } from '@/shared/api/lib/api-types';

export type RequestLike<T> = PromiseLike<T> & { cancel?: () => void };
type Settled<T> = Empty<T> | Loaded<T> | LoadingError<T>;

export interface RequestRun {
	readonly signal: AbortSignal;
	wait<T>(request: RequestLike<T>): Promise<T>;
	/** Call immediately after a progressive `await run.wait(...)`, before mutating domain state. */
	throwIfAborted(): void;
}

export interface RequestResourceState<T> {
	readonly loading: boolean;
	readonly settled: Settled<T>;
}

type RequestResourceOptions<I, T> = {
	request: (input: I, run: RequestRun) => RequestLike<T>;
} & (
	| { mode: 'manual' }
	| {
			mode: 'reactive';
			source: MaybeRefOrGetter<I | null | undefined>;
			key?: (input: I) => unknown;
	  }
);

export interface RequestResource<I, T> {
	readonly state: Readonly<Ref<RequestResourceState<T>>>;
	run(input: I): void;
	retry(): void;
	cancel(): void;
	reset(): void;
}

interface ActiveRun<I> extends RequestRun {
	input: I;
	controller: AbortController;
}

const ABORTED = Symbol('request resource aborted');
const EMPTY_STATE: RequestResourceState<never> = {
	loading: false,
	settled: Loadable.Empty(),
};

/** Bind a child request to a run's abort signal and ignore any settlement after abort. */
function waitForRequest<T>(signal: AbortSignal, request: RequestLike<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let settled = false;
		const onAbort = () => {
			if (settled) return;
			settled = true;
			signal.removeEventListener('abort', onAbort);
			try {
				request.cancel?.();
			} catch {}
			reject(ABORTED);
		};
		const settle = (callback: () => void) => {
			if (settled) return;
			if (signal.aborted) return onAbort();
			settled = true;
			signal.removeEventListener('abort', onAbort);
			callback();
		};
		if (signal.aborted) return onAbort();
		signal.addEventListener('abort', onAbort, { once: true });
		try {
			request.then(
				value => settle(() => resolve(value)),
				error => settle(() => reject(error)),
			);
		} catch (error) {
			settle(() => reject(error));
		}
	});
}

export function useRequestResource<I, T>(options: RequestResourceOptions<I, T>): RequestResource<I, T> {
	const snapshot = shallowRef<RequestResourceState<T>>(EMPTY_STATE);
	let active: ActiveRun<I> | undefined;
	let retryInput: { value: I } | undefined;
	let disposed = false;
	let stopSource = () => {};

	const publish = (state: RequestResourceState<T>) => {
		if (!disposed) snapshot.value = state;
	};
	const takeActive = (run: ActiveRun<I>) => {
		if (active !== run) return false;
		active = undefined;
		run.controller.abort();
		return true;
	};
	const start = async (run: ActiveRun<I>) => {
		try {
			const value = await run.wait(options.request(run.input, run));
			if (takeActive(run)) publish({ loading: false, settled: Loadable.Loaded(value) });
		} catch (error) {
			if (!takeActive(run)) return;
			const cancelled = error === ABORTED || (error instanceof ApiError && error.isCancelledRequest) || axios.isCancel(error);
			publish(
				cancelled
					? EMPTY_STATE
					: {
							loading: false,
							settled: Loadable.LoadingError<T>(ApiError.wrap(error)),
						},
			);
		}
	};
	const trigger = (input: I) => {
		if (disposed) return;
		retryInput = { value: input };
		if (active) takeActive(active);
		const controller = new AbortController();
		const run: ActiveRun<I> = {
			input,
			controller,
			signal: controller.signal,
			wait: request => waitForRequest(controller.signal, request),
			throwIfAborted() {
				if (controller.signal.aborted) throw ABORTED;
			},
		};
		active = run;
		publish({ loading: true, settled: snapshot.value.settled });
		void start(run);
	};

	const resource: RequestResource<I, T> = {
		state: computed(() => snapshot.value),
		run: trigger,
		retry: () => {
			if (retryInput) trigger(retryInput.value);
		},
		cancel: () => {
			if (active && !disposed) {
				takeActive(active);
				publish(EMPTY_STATE);
			}
		},
		reset: () => {
			if (disposed) return;
			if (active) takeActive(active);
			retryInput = undefined;
			publish(EMPTY_STATE);
		},
	};

	if (options.mode === 'reactive') {
		stopSource = watch(
			() => {
				const input = toValue(options.source);
				return [input, input == null ? undefined : options.key ? options.key(input) : input] as const;
			},
			([input, key], previous) => {
				if (input == null) resource.reset();
				else if (previous?.[0] == null || !Object.is(previous[1], key)) trigger(input);
			},
			{ immediate: true, flush: 'sync' },
		);
	}

	tryOnScopeDispose(() => {
		resource.cancel();
		disposed = true;
		stopSource();
	});
	return resource;
}
