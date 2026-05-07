import { describe, expect, test, vi } from 'vitest';
import { ref, type Ref } from 'vue';

import { ApiError } from '@/_new/shared/api/lib/api-types';
import { Loadable, LoadableState, type LoadableLike } from '@/_new/utils/loadable/loadable';
import { combineLoadablesValue, mapLoadedValue, flatMapLoadedValue } from '@/_new/utils/loadable/loadable-operators';
import { combineLoadablesReactive, flatMapLoadedReactive, mapLoadedReactive, resolveMaybeRefLoadables, loadableFromRefs } from '@/_new/utils/loadable/loadable-reactive';

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
		const loadingLike: LoadableLike<number> = { state: LoadableState.loading, value: undefined, error: undefined };
		const result = combineLoadablesValue([loadingLike, Loadable.Loaded(2)] as const);

		expect(result).toBe(loadingLike);
	});
});

describe('combineLoadablesReactive', () => {
	test('combines maybeRef loadables in arrays', () => {
		const a: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
		const b = Loadable.Loaded(2);

		const combined = combineLoadablesReactive([a, b] as const);

		expect(combined.value.state).toBe(LoadableState.loaded);
		expect(combined.value.value).toEqual([1, 2]);

		a.value = Loadable.Loading();
		expect(combined.value.state).toBe(LoadableState.loading);
	});

	test('combines maybeRef loadables in objects', () => {
		const a: Ref<Loadable<string>> = ref(Loadable.Loaded('x'));
		const b: Ref<Loadable<string>> = ref(Loadable.Loaded('y'));

		const combined = combineLoadablesReactive({ a, b });

		expect(combined.value.state).toBe(LoadableState.loaded);
		expect(combined.value.value).toEqual({ a: 'x', b: 'y' });

		b.value = Loadable.Empty();
		expect(combined.value.state).toBe(LoadableState.empty);
	});
});

describe('mapLoadedReactive', () => {
	test('maps only when all inputs are loaded (array)', () => {
		const first: Ref<Loadable<number>> = ref(Loadable.Loading<number>());
		const second: Ref<Loadable<number>> = ref(Loadable.Loaded(2));
		const mapper = vi.fn<(values: readonly [number, number]) => number>(([a, b]) => a + b);

		const result = mapLoadedReactive([first, second] as const, mapper);

		expect(result.value.state).toBe(LoadableState.loading);
		expect(mapper).not.toHaveBeenCalled();

		first.value = Loadable.Loaded(3);
		expect(result.value.state).toBe(LoadableState.loaded);
		expect(result.value.value).toBe(5);
		expect(mapper).toHaveBeenCalledTimes(1);

		second.value = Loadable.Loading();
		expect(result.value.state).toBe(LoadableState.loading);
		expect(mapper).toHaveBeenCalledTimes(1);
	});

	test('maps only when all inputs are loaded (object)', () => {
		const a: Ref<Loadable<string>> = ref(Loadable.Loaded('foo'));
		const b: Ref<Loadable<string>> = ref(Loadable.Loaded('bar'));
		const mapper = vi.fn<(values: { a: string; b: string }) => string>(({ a, b }) => `${a}-${b}`);

		const result = mapLoadedReactive({ a, b }, mapper);

		expect(result.value.state).toBe(LoadableState.loaded);
		expect(result.value.value).toBe('foo-bar');
		expect(mapper).toHaveBeenCalledTimes(1);

		a.value = Loadable.LoadingError(new ApiError('err', 'nope', 'bad request', 400));
		expect(result.value.state).toBe(LoadableState.error);
		expect(mapper).toHaveBeenCalledTimes(1);
	});
});

describe('flatMapLoadedReactive variants', () => {
	test('flatMapLoadedReactive returns mapped loadable when all loaded', () => {
		const left: Ref<Loadable<number>> = ref(Loadable.Loaded(4));
		const right: Ref<Loadable<number>> = ref(Loadable.Loaded(5));

		const result = flatMapLoadedReactive([left, right] as const, ([a, b]) => Loadable.Loaded(a * b));

		expect(result.value.state).toBe(LoadableState.loaded);
		expect(result.value.value).toBe(20);
	});

	test('flatMapLoadedReactive passes through non-loaded states', () => {
		const first: Ref<Loadable<number>> = ref(Loadable.Empty<number>());
		const second: Ref<Loadable<number>> = ref(Loadable.Loaded(2));
		const mapper = vi.fn<(values: { first: number; second: number }) => Loadable<number>>(({ first, second }) => Loadable.Loaded(first + second));

		const result = flatMapLoadedReactive({ first, second }, mapper);

		expect(result.value.state).toBe(LoadableState.empty);
		expect(mapper).not.toHaveBeenCalled();

		first.value = Loadable.Loaded(8);
		expect(result.value.state).toBe(LoadableState.loaded);
		expect(result.value.value).toBe(10);
		expect(mapper).toHaveBeenCalledTimes(1);
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
