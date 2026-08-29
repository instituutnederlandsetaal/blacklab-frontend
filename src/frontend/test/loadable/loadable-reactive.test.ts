import { describe, expect, test, vi } from 'vitest';
import { nextTick, reactive, ref, watch, type Ref } from 'vue';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';
import { combine, combineOptional } from '@/shared/utils/loadable/loadable-combine';
import { combineLoadables, unwrapLoadableRefs } from '@/shared/utils/loadable/loadable-combine-reactive';
import { Loadable, LoadableState, type LoadableLike } from '@/shared/utils/loadable/loadable-core';
import { loadableFromRequest } from '@/shared/utils/loadable/loadable-datasource';
import { loadableReactive, tapLoadedReactive } from '@/shared/utils/loadable/loadable-reactive';

function createControlledLoadable<T>(initial: Loadable<T>, extra: Partial<{ retry: () => void; stop: () => void }> = {}) {
	const state = ref(initial.state);
	const value = ref(initial.value);
	const error = ref(initial.error);

	return {
		state,
		value,
		error,
		loadable: loadableReactive(state, value, error, {
			retry: vi.fn<() => void>(),
			stop: vi.fn<() => void>(),
			...extra,
		}),
	};
}

function createDeferredRequest<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const cancel = vi.fn<() => void>();
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return {
		request: new CancelableRequest(promise, cancel),
		resolve,
		reject,
		cancel,
	};
}

async function flushPromises() {
	await Promise.resolve();
	await Promise.resolve();
}

describe('non-reactive loadable primitives', () => {
	test('combine combines loaded arrays', () => {
		const result = combine([Loadable.Loaded(1), Loadable.Loaded(2)] as const);

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toEqual([1, 2]);
	});

	test('combine passes through first non-loaded state', () => {
		const result = combine([Loadable.Loaded(1), Loadable.Empty<number>(), Loadable.Loading()] as const);

		expect(result.state).toBe(LoadableState.empty);
	});

	test('resolveMaybeRefLoadables unwraps refs and plain values', () => {
		const a: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
		const b = Loadable.Loaded(2);
		const resolved = unwrapLoadableRefs([a, b] as const);

		expect(resolved[0].state).toBe(LoadableState.loaded);
		expect(resolved[0].value).toBe(1);
		expect(resolved[1].state).toBe(LoadableState.loaded);
		expect(resolved[1].value).toBe(2);
	});

	test('resolveMaybeRefLoadables unwraps object inputs', () => {
		const a: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
		const b = Loadable.Empty<number>();
		const resolved = unwrapLoadableRefs({ a, b });

		expect(resolved.a.state).toBe(LoadableState.loaded);
		expect(resolved.a.value).toBe(1);
		expect(resolved.b.state).toBe(LoadableState.empty);
	});

	test('combine accepts plain LoadableLike shape', () => {
		const a: LoadableLike<number> = { state: LoadableState.loaded, value: 1, error: undefined };
		const b: LoadableLike<number> = { state: LoadableState.loaded, value: 2, error: undefined };
		const result = combine([a, b] as const);

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toEqual([1, 2]);
	});

	test('combine passes through original non-loaded LoadableLike', () => {
		const loadingLike: LoadableLike<number> = {
			state: LoadableState.loading,
			value: undefined,
			error: undefined,
		};
		const result = combine([loadingLike, Loadable.Loaded(2)] as const);

		expect(result).toBe(loadingLike);
	});

	test('combine handles mixed plain values and loadables', () => {
		const result = combine([Loadable.Loaded(1), { plain: true }] as const);

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toEqual([1, { plain: true }]);
	});

	test('combineOptional treats empty loadables as settled undefined', () => {
		const result = combineOptional({ value: Loadable.Empty<number>(), plain: 'x' });

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toEqual({ value: undefined, plain: 'x' });
	});
});

describe('combineLoadables', () => {
	test('combines maybeRef loadables in arrays', async () => {
		const a: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
		const b = Loadable.Loaded(2);

		const combined = combineLoadables([a, b] as const);

		expect(combined.state).toBe(LoadableState.loaded);
		expect(combined.value).toEqual([1, 2]);

		a.value = Loadable.Loading();
		await nextTick();
		expect(combined.state).toBe(LoadableState.loading);
	});

	test('combines maybeRef loadables in objects', async () => {
		const a: Ref<Loadable<string>> = ref(Loadable.Loaded('x'));
		const b: Ref<Loadable<string>> = ref(Loadable.Loaded('y'));

		const combined = combineLoadables({ a, b });

		expect(combined.state).toBe(LoadableState.loaded);
		expect(combined.value).toEqual({ a: 'x', b: 'y' });

		b.value = Loadable.Empty();
		await nextTick();
		expect(combined.state).toBe(LoadableState.empty);
	});

	test('supports includeEmpty', () => {
		const loaded: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
		const empty: Ref<Loadable<number>> = ref(Loadable.Empty());

		const combined = combineLoadables([loaded, empty] as const, { includeEmpty: true });

		expect(combined.state).toBe(LoadableState.loaded);
		expect(combined.value).toEqual([1, undefined]);
	});

	test('combineLoadables can include empty values', () => {
		const loaded: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
		const empty: Ref<Loadable<number>> = ref(Loadable.Empty());

		const combined = combineLoadables([loaded] as const);
		const optional = combineLoadables([loaded, empty] as const, { includeEmpty: true });

		expect(combined.value).toEqual([1]);
		expect(optional.value).toEqual([1, undefined]);
	});
});

describe('loadableFromLoadables', () => {
	test('keeps value hidden until every input is loaded and surfaces the first unsettled state', async () => {
		const first = createControlledLoadable(Loadable.Loading<number>());
		const second = createControlledLoadable(Loadable.Loading<number>());
		const combined = combineLoadables([first.loadable, second.loadable] as const);

		expect(combined.state).toBe(LoadableState.loading);
		expect(combined.value).toBeUndefined();
		expect(combined.error).toBeUndefined();

		first.value.value = 1;
		first.state.value = LoadableState.loaded;
		await nextTick();
		expect(combined.state).toBe(LoadableState.loading);
		expect(combined.value).toBeUndefined();

		const failure = new ApiError('boom', 'boom', 'broken', 500);
		second.error.value = failure;
		second.state.value = LoadableState.error;
		await nextTick();
		expect(combined.state).toBe(LoadableState.error);
		expect(combined.error).toBe(failure);
		expect(combined.value).toBeUndefined();
	});

	test('fans out retry and stop to retryable inputs only', () => {
		const retryA = vi.fn<() => void>();
		const stopA = vi.fn<() => void>();
		const retryB = vi.fn<() => void>();
		const stopB = vi.fn<() => void>();
		const first = createControlledLoadable(Loadable.Loading<number>(), {
			retry: retryA,
			stop: stopA,
		});
		const second = createControlledLoadable(Loadable.Loading<number>(), {
			retry: retryB,
			stop: stopB,
		});
		const combined = combineLoadables([first.loadable, second.loadable, Loadable.Loaded(3)] as const);

		combined.retry();
		combined.stop();

		expect(retryA).toHaveBeenCalledTimes(1);
		expect(retryB).toHaveBeenCalledTimes(1);
		expect(stopA).toHaveBeenCalledTimes(1);
		expect(stopB).toHaveBeenCalledTimes(1);
	});

	test('fans out retry and stop once per unique retryable input', () => {
		const retry = vi.fn<() => void>();
		const stop = vi.fn<() => void>();
		const source = createControlledLoadable(Loadable.Loading<number>(), { retry, stop });
		const combined = combineLoadables([source.loadable, source.loadable] as const);

		combined.retry();
		combined.stop();

		expect(retry).toHaveBeenCalledTimes(1);
		expect(stop).toHaveBeenCalledTimes(1);
	});

	test('fans out retry through object inputs', () => {
		const retry = vi.fn<() => void>();
		const source = createControlledLoadable(Loadable.Loading<number>(), { retry });
		const combined = combineLoadables({ source: source.loadable });

		combined.retry();

		expect(retry).toHaveBeenCalledTimes(1);
	});

	test('supports treating empty inputs as settled', () => {
		const loaded = createControlledLoadable(Loadable.Loaded(1));
		const empty = createControlledLoadable(Loadable.Empty<number>());
		const combined = combineLoadables([loaded.loadable, empty.loadable] as const, {
			includeEmpty: true,
		});

		expect(combined.state).toBe(LoadableState.loaded);
		expect(combined.value).toEqual([1, undefined]);
		expect(combined.error).toBeUndefined();
	});

	test('supports treating empty object inputs as settled', () => {
		const loaded = createControlledLoadable(Loadable.Loaded(1));
		const empty = createControlledLoadable(Loadable.Empty<number>());
		const combined = combineLoadables({ loaded: loaded.loadable, empty: empty.loadable }, { includeEmpty: true });

		expect(combined.state).toBe(LoadableState.loaded);
		expect(combined.value).toEqual({ loaded: 1, empty: undefined });
	});

	test('passes through unresolved states when treating empty inputs as settled', () => {
		const empty = createControlledLoadable(Loadable.Empty<number>());
		const loading = createControlledLoadable(Loadable.Loading<number>());
		const combined = combineLoadables([empty.loadable, loading.loadable] as const, {
			includeEmpty: true,
		});

		expect(combined.state).toBe(LoadableState.loading);
		expect(combined.value).toBeUndefined();
	});

	test('does not trigger watchers when an input settles but the exposed output stays the same', async () => {
		const first = createControlledLoadable(Loadable.Loading<number>());
		const second = createControlledLoadable(Loadable.Loading<number>());
		const combined = combineLoadables([first.loadable, second.loadable] as const);
		const onStateChange = vi.fn<(value: LoadableState, oldValue: LoadableState | undefined) => void>();
		const onValueChange = vi.fn<(value: unknown, oldValue: unknown) => void>();

		watch(() => combined.state, onStateChange, { immediate: true, flush: 'sync' });
		watch(() => combined.value, onValueChange, { immediate: true, flush: 'sync' });

		first.value.value = 1;
		first.state.value = LoadableState.loaded;
		await nextTick();
		expect(onStateChange).toHaveBeenCalledTimes(1);
		expect(onValueChange).toHaveBeenCalledTimes(1);

		second.value.value = 2;
		second.state.value = LoadableState.loaded;
		await nextTick();
		expect(onStateChange).toHaveBeenCalledTimes(2);
		expect(onValueChange).toHaveBeenCalledTimes(2);
		expect(combined.value).toEqual([1, 2]);
	});

	test('reuses the combined loaded value when the underlying loaded values are unchanged', async () => {
		const shared = { id: 1 };
		const first: Ref<Loadable<{ id: number }>> = ref(Loadable.Loaded(shared));
		const second: Ref<Loadable<number>> = ref(Loadable.Loaded(2));
		const combined = combineLoadables([first, second] as const);
		const onValueChange = vi.fn<(value: unknown, oldValue: unknown) => void>();
		const initialValue = combined.value;

		watch(() => combined.value, onValueChange, { immediate: true, flush: 'sync' });

		first.value = Loadable.Loaded(shared);
		await nextTick();

		expect(onValueChange).toHaveBeenCalledTimes(1);
		expect(combined.value).toBe(initialValue);
	});

	test('reuses object combined values only when entries are unchanged', async () => {
		const shared = { id: 1 };
		const first: Ref<Loadable<{ id: number }>> = ref(Loadable.Loaded(shared));
		const second: Ref<Loadable<number>> = ref(Loadable.Loaded(2));
		const combined = combineLoadables({ first, second });
		const initialValue = combined.value;

		first.value = Loadable.Loaded(shared);
		await nextTick();
		expect(combined.value).toBe(initialValue);

		first.value = Loadable.Loaded({ id: 1 });
		await nextTick();
		expect(combined.value).not.toBe(initialValue);
		expect(combined.value).toEqual({ first: { id: 1 }, second: 2 });
	});
});

describe('reactive loadable map', () => {
	test('maps a single loadable input', () => {
		const source = createControlledLoadable(Loadable.Loaded(2));
		const result = source.loadable.map(value => value + 1);

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toBe(3);
	});

	test('maps only when all inputs are loaded (array)', async () => {
		const first: Ref<Loadable<number>> = ref(Loadable.Loading<number>());
		const second: Ref<Loadable<number>> = ref(Loadable.Loaded(2));
		const mapper = vi.fn<(values: readonly [number, number]) => number>(([a, b]) => a + b);

		const result = combineLoadables([first, second] as const).map(mapper);

		expect(result.state).toBe(LoadableState.loading);
		expect(mapper).not.toHaveBeenCalled();

		first.value = Loadable.Loaded(3);
		await nextTick();
		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toBe(5);
		expect(mapper).toHaveBeenCalledTimes(1);

		first.value = Loadable.Loaded(4);
		await nextTick();
		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toBe(6);
		expect(mapper).toHaveBeenCalledTimes(2);

		second.value = Loadable.Loading();
		await nextTick();
		expect(result.state).toBe(LoadableState.loading);
		expect(mapper).toHaveBeenCalledTimes(2);
	});

	test('maps only when all inputs are loaded (object)', async () => {
		const a: Ref<Loadable<string>> = ref(Loadable.Loaded('foo'));
		const b: Ref<Loadable<string>> = ref(Loadable.Loaded('bar'));
		const mapper = vi.fn<(values: { a: string; b: string }) => string>(({ a, b }) => `${a}-${b}`);

		const result = combineLoadables({ a, b }).map(mapper);

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toBe('foo-bar');
		expect(mapper).toHaveBeenCalledTimes(1);

		a.value = Loadable.LoadingError(new ApiError('err', 'nope', 'bad request', 400));
		await nextTick();
		expect(result.state).toBe(LoadableState.error);
		expect(mapper).toHaveBeenCalledTimes(1);
	});

	test('does not collect dependencies from synchronous consumers during publication', async () => {
		const source = createControlledLoadable(Loadable.Loading<{ values: string[] }>());
		const mapper = vi.fn((value: { values: string[] }) => ({ value }));
		const mapped = source.loadable.map(mapper);
		const published = tapLoadedReactive(mapped, context => {
			context.value.values = [...context.value.values];
		});

		source.value.value = { values: ['NOU'] };
		source.state.value = LoadableState.loaded;
		await nextTick();

		expect(published.isLoaded()).toBe(true);
		expect(mapper).toHaveBeenCalledTimes(1);

		published.value!.value.values = [...published.value!.value.values, 'VRB'];
		await nextTick();
		expect(mapper).toHaveBeenCalledTimes(1);
	});

	test('tracks only the declared loadable source, not reactive reads inside the mapper', async () => {
		const source = createControlledLoadable(Loadable.Loaded(2));
		const incidental = ref(10);
		const mapper = vi.fn((value: number) => value + incidental.value);
		const mapped = source.loadable.map(mapper);

		expect(mapped.value).toBe(12);
		incidental.value = 20;
		await nextTick();
		expect(mapper).toHaveBeenCalledTimes(1);
		expect(mapped.value).toBe(12);

		source.value.value = 3;
		await nextTick();
		expect(mapper).toHaveBeenCalledTimes(2);
		expect(mapped.value).toBe(23);
	});

	test('tracks nested input changes only when deep is enabled', async () => {
		const value = reactive({ count: 1 });
		const source = createControlledLoadable(Loadable.Loaded(value));
		const shallowMapper = vi.fn((input: { count: number }) => input.count);
		const deepMapper = vi.fn((input: { count: number }) => input.count);
		const shallowMapped = source.loadable.map(shallowMapper);
		const deepMapped = source.loadable.map(deepMapper, { deep: true });

		value.count = 2;
		await nextTick();

		expect(shallowMapper).toHaveBeenCalledTimes(1);
		expect(shallowMapped.value).toBe(1);
		expect(deepMapper).toHaveBeenCalledTimes(2);
		expect(deepMapped.value).toBe(2);
	});

	test('publishes state, value, and error as one synchronous snapshot', async () => {
		const source = createControlledLoadable(Loadable.Loading<number>());
		const mapped = source.loadable.map(value => value + 1);
		const snapshots: Array<readonly [LoadableState, number | undefined, ApiError | undefined]> = [];

		watch(
			() => [mapped.state, mapped.value, mapped.error] as const,
			snapshot => snapshots.push(snapshot),
			{ immediate: true, flush: 'sync' },
		);

		source.value.value = 1;
		source.state.value = LoadableState.loaded;
		await nextTick();

		const failure = new ApiError('boom', 'boom', 'broken', 500);
		source.error.value = failure;
		source.state.value = LoadableState.error;
		await nextTick();

		expect(snapshots).toEqual([
			[LoadableState.loading, undefined, undefined],
			[LoadableState.loaded, 2, undefined],
			[LoadableState.error, undefined, failure],
		]);
	});
});

describe('state-specific reactive methods', () => {
	test('mapError and recover transform error values', () => {
		const error = new ApiError('Title', 'Message', 'Bad Request', 400);
		const replacement = new ApiError('Replacement', 'Mapped', 'Mapped Error', 500);
		const source = createControlledLoadable(Loadable.LoadingError<number>(error));
		const mapped = source.loadable.mapError(() => replacement);
		const recovered = source.loadable.recover(value => value.httpCode ?? 0);

		expect(mapped.state).toBe(LoadableState.error);
		expect(mapped.error).toBe(replacement);
		expect(recovered.state).toBe(LoadableState.loaded);
		expect(recovered.value).toBe(400);
	});

	test('or maps Empty while preserving an absent fallback', () => {
		const source = createControlledLoadable(Loadable.Empty<number>());
		const fallback = source.loadable.or(() => 10);
		const absent = source.loadable.or(() => undefined);

		expect(fallback.value).toBe(10);
		expect(absent.state).toBe(LoadableState.empty);
	});

	test('optional reactive mappers treat empty as an undefined value', () => {
		const loaded = createControlledLoadable(Loadable.Loaded(2)).loadable.mapOptional(value => value ?? 10);
		const empty = createControlledLoadable(Loadable.Empty<number>()).loadable.mapOptional(value => value ?? 10);

		expect(loaded.value).toBe(2);
		expect(empty.value).toBe(10);
	});

	test('flatMapOptional preserves an Empty returned by the mapper', () => {
		const mapper = vi.fn(() => Loadable.Empty<string>());
		const result = createControlledLoadable(Loadable.Loaded(2)).loadable.flatMapOptional(mapper);

		expect(result.state).toBe(LoadableState.empty);
		expect(mapper).toHaveBeenCalledTimes(1);
	});

	test('flatMapError maps its matching state', () => {
		const error = new ApiError('Title', 'Message', 'Bad Request', 400);
		const mappedError = createControlledLoadable(Loadable.LoadingError<number>(error)).loadable.flatMapError(value => Loadable.Loaded(value.httpCode));

		expect(mappedError.value).toBe(400);
	});
});

describe('loadableFromRequest', () => {
	test('starts immediately and exposes the resolved value', async () => {
		const deferred = createDeferredRequest<number>();
		const makeRequest = vi.fn<() => CancelableRequest<number>>(() => deferred.request);

		const loadable = loadableFromRequest(makeRequest);

		expect(makeRequest).toHaveBeenCalledTimes(1);
		expect(loadable.state).toBe(LoadableState.empty);

		deferred.resolve(42);
		await flushPromises();

		expect(loadable.state).toBe(LoadableState.loaded);
		expect(loadable.value).toBe(42);

		loadable.stop();
		expect(deferred.cancel).toHaveBeenCalledTimes(1);
	});

	test('wraps failed requests as ApiError values', async () => {
		const deferred = createDeferredRequest<number>();
		const loadable = loadableFromRequest(() => deferred.request);

		deferred.reject(new Error('network failed'));
		await flushPromises();

		expect(loadable.state).toBe(LoadableState.error);
		expect(loadable.value).toBeUndefined();
		expect(loadable.error).toBeInstanceOf(ApiError);
		expect(loadable.error?.message).toBe('network failed');
	});

	test('returns to empty when the request is cancelled through ApiError', async () => {
		const deferred = createDeferredRequest<number>();
		const loadable = loadableFromRequest(() => deferred.request);

		deferred.reject(ApiError.CANCELLED);
		await flushPromises();

		expect(loadable.state).toBe(LoadableState.empty);
		expect(loadable.value).toBeUndefined();
		expect(loadable.error).toBeUndefined();
	});

	test('returns to empty when the request is cancelled through axios', async () => {
		const deferred = createDeferredRequest<number>();
		const loadable = loadableFromRequest(() => deferred.request);

		deferred.reject({ __CANCEL__: true });
		await flushPromises();

		expect(loadable.state).toBe(LoadableState.empty);
		expect(loadable.value).toBeUndefined();
		expect(loadable.error).toBeUndefined();
	});

	test('retry cancels and ignores stale request results', async () => {
		const first = createDeferredRequest<number>();
		const second = createDeferredRequest<number>();
		const makeRequest = vi.fn<() => CancelableRequest<number>>().mockReturnValueOnce(first.request).mockReturnValueOnce(second.request);
		const loadable = loadableFromRequest(makeRequest);

		loadable.retry();

		expect(first.cancel).toHaveBeenCalledTimes(1);
		expect(makeRequest).toHaveBeenCalledTimes(2);

		first.resolve(1);
		await flushPromises();
		expect(loadable.state).toBe(LoadableState.empty);

		second.resolve(2);
		await flushPromises();
		expect(loadable.state).toBe(LoadableState.loaded);
		expect(loadable.value).toBe(2);
	});

	test('retry ignores stale request errors', async () => {
		const first = createDeferredRequest<number>();
		const second = createDeferredRequest<number>();
		const makeRequest = vi.fn<() => CancelableRequest<number>>().mockReturnValueOnce(first.request).mockReturnValueOnce(second.request);
		const loadable = loadableFromRequest(makeRequest);

		loadable.retry();
		first.reject(new Error('too late'));
		await flushPromises();

		expect(loadable.state).toBe(LoadableState.empty);
		expect(loadable.error).toBeUndefined();

		second.reject(new Error('current failed'));
		await flushPromises();
		expect(loadable.state).toBe(LoadableState.error);
		expect(loadable.error?.message).toBe('current failed');
	});
});

describe('reactive loadable flatMap', () => {
	test('returns the mapped loadable when all inputs are loaded', () => {
		const left: Ref<Loadable<number>> = ref(Loadable.Loaded(4));
		const right: Ref<Loadable<number>> = ref(Loadable.Loaded(5));

		const result = combineLoadables([left, right] as const).flatMap(([a, b]) => Loadable.Loaded(a * b));

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toBe(20);
	});

	test('passes through non-loaded states', async () => {
		const first: Ref<Loadable<number>> = ref(Loadable.Empty<number>());
		const second: Ref<Loadable<number>> = ref(Loadable.Loaded(2));
		const mapper = vi.fn<(values: { first: number; second: number }) => Loadable<number>>(({ first, second }) => Loadable.Loaded(first + second));

		const result = combineLoadables({ first, second }).flatMap(mapper);

		expect(result.state).toBe(LoadableState.empty);
		expect(mapper).not.toHaveBeenCalled();

		first.value = Loadable.Loaded(8);
		await nextTick();
		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toBe(10);
		expect(mapper).toHaveBeenCalledTimes(1);
	});

	test('chains from a single loadable and preserves control fanout', () => {
		const retrySource = vi.fn<() => void>();
		const stopSource = vi.fn<() => void>();
		const retryInner = vi.fn<() => void>();
		const stopInner = vi.fn<() => void>();
		const source = createControlledLoadable(Loadable.Loaded(2), {
			retry: retrySource,
			stop: stopSource,
		});
		const inner = createControlledLoadable(Loadable.Loaded(4), {
			retry: retryInner,
			stop: stopInner,
		});

		const result = source.loadable.flatMap(value => {
			expect(value).toBe(2);
			return inner.loadable;
		});

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toBe(4);

		result.retry();
		expect(retrySource).toHaveBeenCalledTimes(1);
		expect(retryInner).toHaveBeenCalledTimes(1);

		result.stop();
		expect(stopSource).toHaveBeenCalledTimes(1);
		expect(stopInner).toHaveBeenCalledTimes(1);
	});

	test('stops the previous mapped loadable when source stops matching', async () => {
		const stopInner = vi.fn<() => void>();
		const source = createControlledLoadable(Loadable.Loaded(2));
		const inner = createControlledLoadable(Loadable.Loaded(4), {
			stop: stopInner,
		});
		const result = source.loadable.flatMap(() => inner.loadable);

		source.state.value = LoadableState.loading;
		await nextTick();

		expect(result.state).toBe(LoadableState.loading);
		expect(stopInner).toHaveBeenCalledTimes(1);
	});

	test('stops the previous mapped loadable when mapping changes', async () => {
		const stopFirstInner = vi.fn<() => void>();
		const source = createControlledLoadable(Loadable.Loaded(1));
		const firstInner = createControlledLoadable(Loadable.Loaded(10), {
			stop: stopFirstInner,
		});
		const secondInner = createControlledLoadable(Loadable.Loaded(20));
		const result = source.loadable.flatMap(value => (value === 1 ? firstInner.loadable : secondInner.loadable));

		source.value.value = 2;
		await nextTick();

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toBe(20);
		expect(stopFirstInner).toHaveBeenCalledTimes(1);
	});

	test('loadableReactive state check functions work as expected', () => {
		const state = ref(LoadableState.loaded);
		const value = ref(42);
		const error = ref<ApiError | undefined>(undefined);
		const loadable = loadableReactive(state, value, error);
		expect(loadable.state).toBe(LoadableState.loaded);
		expect(loadable.value).toBe(42);
		expect(loadable.error).toBeUndefined();
		expect(loadable.isLoaded()).toBe(true);

		state.value = LoadableState.error;
		expect(loadable.isError()).toBe(true);
		expect(loadable.isLoaded()).toBe(false);
	});

	test('loadableReactive is the stable reactive-shell factory name', () => {
		const state = ref(LoadableState.loaded);
		const value = ref(1);
		const loadable = loadableReactive(state, value);

		expect(loadable.state).toBe(LoadableState.loaded);
		expect(loadable.value).toBe(1);
	});

	test('loadableReactive exposes mapper instance functions', async () => {
		const state = ref(LoadableState.loaded);
		const value = ref<number | undefined>(42);
		const error = ref<ApiError | undefined>(undefined);
		const loadable = loadableReactive(state, value, error);

		const mapped = loadable.map(v => v + 1);
		expect(mapped.state).toBe(LoadableState.loaded);
		expect(mapped.value).toBe(43);

		value.value = 7;
		await nextTick();
		expect(mapped.value).toBe(8);

		state.value = LoadableState.error;
		value.value = undefined;
		error.value = new ApiError('title', 'message', 'status', 500);

		const recovered = loadable.recover(() => 7);
		const flatMappedError = loadable.flatMapError(() => Loadable.Empty<number>());
		expect(recovered.state).toBe(LoadableState.loaded);
		expect(recovered.value).toBe(7);
		expect(flatMappedError.state).toBe(LoadableState.empty);
	});
});
