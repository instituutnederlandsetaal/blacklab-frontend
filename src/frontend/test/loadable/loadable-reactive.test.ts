import { describe, expect, test, vi } from 'vitest';
import { ref, watch, type Ref } from 'vue';

import { ApiError } from '@/shared/api/lib/api-types';
import { Loadable, LoadableState, type LoadableLike } from '@/shared/utils/loadable/loadable';
import { combineLoadablesValue, mapLoadedValue, flatMapLoadedValue } from '@/shared/utils/loadable/loadable-operators';
import { combineLoadablesReactive, flatMapLoadedReactive, loadableFromLoadables, loadableFromRefs, mapLoadedReactive, resolveMaybeRefLoadables } from '@/shared/utils/loadable/loadable-reactive';

function createControlledLoadable<T>(initial: Loadable<T>, extra: Partial<{ retry: () => void; stop: () => void }> = {}) {
	const state = ref(initial.state);
	const value = ref(initial.value);
	const error = ref(initial.error);

	return {
		state,
		value,
		error,
		loadable: loadableFromRefs(state, value, error, {
			retry: vi.fn<() => void>(),
			stop: vi.fn<() => void>(),
			...extra,
		}),
	};
}

describe('non-reactive loadable primitives', () => {
	test('combineLoadablesValue combines loaded arrays', () => {
		const result = combineLoadablesValue([Loadable.Loaded(1), Loadable.Loaded(2)] as const);

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toEqual([1, 2]);
	});

	test('combineLoadablesValue passes through first non-loaded state', () => {
		const result = combineLoadablesValue([Loadable.Loaded(1), Loadable.Empty<number>(), Loadable.Loading()] as const);

		expect(result.state).toBe(LoadableState.empty);
	});

	test('mapLoadedValue maps only for fully loaded input', () => {
		const loaded = mapLoadedValue({ a: Loadable.Loaded(2), b: Loadable.Loaded(3) }, ({ a, b }) => a + b);
		expect(loaded.state).toBe(LoadableState.loaded);
		expect(loaded.value).toBe(5);

		const notLoaded = mapLoadedValue({ a: Loadable.Loading<number>(), b: Loadable.Loaded(3) }, ({ a, b }) => a + b);
		expect(notLoaded.state).toBe(LoadableState.loading);
	});

	test('flatMapLoadedValue maps to loadable only for fully loaded input', () => {
		const loaded = flatMapLoadedValue([Loadable.Loaded(4), Loadable.Loaded(5)] as const, ([a, b]) => Loadable.Loaded(a * b));
		expect(loaded.state).toBe(LoadableState.loaded);
		expect(loaded.value).toBe(20);

		const notLoaded = flatMapLoadedValue([Loadable.Loaded(4), Loadable.Loading<number>()] as const, ([a, b]) => Loadable.Loaded(a * b));
		expect(notLoaded.state).toBe(LoadableState.loading);
	});

	test('resolveMaybeRefLoadables unwraps refs and plain values', () => {
		const a: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
		const b = Loadable.Loaded(2);
		const resolved = resolveMaybeRefLoadables([a, b] as const);

		expect(resolved[0].state).toBe(LoadableState.loaded);
		expect(resolved[0].value).toBe(1);
		expect(resolved[1].state).toBe(LoadableState.loaded);
		expect(resolved[1].value).toBe(2);
	});

	test('combineLoadablesValue accepts plain LoadableLike shape', () => {
		const a: LoadableLike<number> = { state: LoadableState.loaded, value: 1, error: undefined };
		const b: LoadableLike<number> = { state: LoadableState.loaded, value: 2, error: undefined };
		const result = combineLoadablesValue([a, b] as const);

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toEqual([1, 2]);
	});

	test('combineLoadablesValue passes through original non-loaded LoadableLike', () => {
		const loadingLike: LoadableLike<number> = {
			state: LoadableState.loading,
			value: undefined,
			error: undefined,
		};
		const result = combineLoadablesValue([loadingLike, Loadable.Loaded(2)] as const);

		expect(result).toBe(loadingLike);
	});
});

describe('combineLoadablesReactive', () => {
	test('combines maybeRef loadables in arrays', () => {
		const a: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
		const b = Loadable.Loaded(2);

		const combined = combineLoadablesReactive([a, b] as const);

		expect(combined.state).toBe(LoadableState.loaded);
		expect(combined.value).toEqual([1, 2]);

		a.value = Loadable.Loading();
		expect(combined.state).toBe(LoadableState.loading);
	});

	test('combines maybeRef loadables in objects', () => {
		const a: Ref<Loadable<string>> = ref(Loadable.Loaded('x'));
		const b: Ref<Loadable<string>> = ref(Loadable.Loaded('y'));

		const combined = combineLoadablesReactive({ a, b });

		expect(combined.state).toBe(LoadableState.loaded);
		expect(combined.value).toEqual({ a: 'x', b: 'y' });

		b.value = Loadable.Empty();
		expect(combined.state).toBe(LoadableState.empty);
	});
});

describe('loadableFromLoadables', () => {
	test('keeps value hidden until every input is loaded and surfaces the first unsettled state', () => {
		const first = createControlledLoadable(Loadable.Loading<number>());
		const second = createControlledLoadable(Loadable.Loading<number>());
		const combined = loadableFromLoadables([first.loadable, second.loadable] as const);

		expect(combined.state).toBe(LoadableState.loading);
		expect(combined.value).toBeUndefined();
		expect(combined.error).toBeUndefined();

		first.value.value = 1;
		first.state.value = LoadableState.loaded;
		expect(combined.state).toBe(LoadableState.loading);
		expect(combined.value).toBeUndefined();

		const failure = new ApiError('boom', 'boom', 'broken', 500);
		second.error.value = failure;
		second.state.value = LoadableState.error;
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
		const combined = loadableFromLoadables([first.loadable, second.loadable, Loadable.Loaded(3)] as const);

		combined.retry();
		combined.stop();

		expect(retryA).toHaveBeenCalledTimes(1);
		expect(retryB).toHaveBeenCalledTimes(1);
		expect(stopA).toHaveBeenCalledTimes(1);
		expect(stopB).toHaveBeenCalledTimes(1);
	});

	test('supports treating empty inputs as settled', () => {
		const loaded = createControlledLoadable(Loadable.Loaded(1));
		const empty = createControlledLoadable(Loadable.Empty<number>());
		const combined = loadableFromLoadables([loaded.loadable, empty.loadable] as const, {
			includeEmpty: true,
		});

		expect(combined.state).toBe(LoadableState.loaded);
		expect(combined.value).toEqual([1, undefined]);
		expect(combined.error).toBeUndefined();
	});

	test('does not trigger watchers when an input settles but the exposed output stays the same', () => {
		const first = createControlledLoadable(Loadable.Loading<number>());
		const second = createControlledLoadable(Loadable.Loading<number>());
		const combined = loadableFromLoadables([first.loadable, second.loadable] as const);
		const onStateChange = vi.fn<(value: LoadableState, oldValue: LoadableState | undefined) => void>();
		const onValueChange = vi.fn<(value: unknown, oldValue: unknown) => void>();

		watch(() => combined.state, onStateChange, { immediate: true, flush: 'sync' });
		watch(() => combined.value, onValueChange, { immediate: true, flush: 'sync' });

		first.value.value = 1;
		first.state.value = LoadableState.loaded;
		expect(onStateChange).toHaveBeenCalledTimes(1);
		expect(onValueChange).toHaveBeenCalledTimes(1);

		second.value.value = 2;
		second.state.value = LoadableState.loaded;
		expect(onStateChange).toHaveBeenCalledTimes(2);
		expect(onValueChange).toHaveBeenCalledTimes(2);
		expect(combined.value).toEqual([1, 2]);
	});

	test('reuses the combined loaded value when the underlying loaded values are unchanged', () => {
		const shared = { id: 1 };
		const first: Ref<Loadable<{ id: number }>> = ref(Loadable.Loaded(shared));
		const second: Ref<Loadable<number>> = ref(Loadable.Loaded(2));
		const combined = loadableFromLoadables([first, second] as const);
		const onValueChange = vi.fn<(value: unknown, oldValue: unknown) => void>();
		const initialValue = combined.value;

		watch(() => combined.value, onValueChange, { immediate: true, flush: 'sync' });

		first.value = Loadable.Loaded(shared);

		expect(onValueChange).toHaveBeenCalledTimes(1);
		expect(combined.value).toBe(initialValue);
	});
});

describe('mapLoadedReactive', () => {
	test('maps only when all inputs are loaded (array)', () => {
		const first: Ref<Loadable<number>> = ref(Loadable.Loading<number>());
		const second: Ref<Loadable<number>> = ref(Loadable.Loaded(2));
		const mapper = vi.fn<(values: readonly [number, number]) => number>(([a, b]) => a + b);

		const result = mapLoadedReactive([first, second] as const, mapper);

		expect(result.state).toBe(LoadableState.loading);
		expect(mapper).not.toHaveBeenCalled();

		first.value = Loadable.Loaded(3);
		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toBe(5);
		expect(mapper).toHaveBeenCalledTimes(1);

		second.value = Loadable.Loading();
		expect(result.state).toBe(LoadableState.loading);
		expect(mapper).toHaveBeenCalledTimes(1);
	});

	test('maps only when all inputs are loaded (object)', () => {
		const a: Ref<Loadable<string>> = ref(Loadable.Loaded('foo'));
		const b: Ref<Loadable<string>> = ref(Loadable.Loaded('bar'));
		const mapper = vi.fn<(values: { a: string; b: string }) => string>(({ a, b }) => `${a}-${b}`);

		const result = mapLoadedReactive({ a, b }, mapper);

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toBe('foo-bar');
		expect(mapper).toHaveBeenCalledTimes(1);

		a.value = Loadable.LoadingError(new ApiError('err', 'nope', 'bad request', 400));
		expect(result.state).toBe(LoadableState.error);
		expect(mapper).toHaveBeenCalledTimes(1);
	});
});

describe('flatMapLoadedReactive variants', () => {
	test('flatMapLoadedReactive returns mapped loadable when all loaded', () => {
		const left: Ref<Loadable<number>> = ref(Loadable.Loaded(4));
		const right: Ref<Loadable<number>> = ref(Loadable.Loaded(5));

		const result = flatMapLoadedReactive([left, right] as const, ([a, b]) => Loadable.Loaded(a * b));

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toBe(20);
	});

	test('flatMapLoadedReactive passes through non-loaded states', () => {
		const first: Ref<Loadable<number>> = ref(Loadable.Empty<number>());
		const second: Ref<Loadable<number>> = ref(Loadable.Loaded(2));
		const mapper = vi.fn<(values: { first: number; second: number }) => Loadable<number>>(({ first, second }) => Loadable.Loaded(first + second));

		const result = flatMapLoadedReactive({ first, second }, mapper);

		expect(result.state).toBe(LoadableState.empty);
		expect(mapper).not.toHaveBeenCalled();

		first.value = Loadable.Loaded(8);
		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toBe(10);
		expect(mapper).toHaveBeenCalledTimes(1);
	});

	test('flatMapLoadedReactive chains from a single loadable and preserves control fanout', () => {
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

		const result = flatMapLoadedReactive(source.loadable, value => {
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

	test('loadableFromRefs state check functions work as expected', () => {
		const state = ref(LoadableState.loaded);
		const value = ref(42);
		const error = ref<ApiError | undefined>(undefined);
		const loadable = loadableFromRefs(state, value, error);
		expect(loadable.state).toBe(LoadableState.loaded);
		expect(loadable.value).toBe(42);
		expect(loadable.error).toBeUndefined();
		expect(loadable.isLoaded()).toBe(true);

		state.value = LoadableState.error;
		expect(loadable.isError()).toBe(true);
		expect(loadable.isLoaded()).toBe(false);
	});
});
