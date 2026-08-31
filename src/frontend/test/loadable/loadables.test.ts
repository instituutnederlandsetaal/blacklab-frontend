import { EMPTY, map, Observable, of, Subject, switchMap } from 'rxjs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { computed, effectScope, nextTick } from 'vue';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';
import { isLoadable, isError, isLoading, isEmpty, Loadable, LoadableState } from '@/shared/utils/loadable/loadable-core';
import {
	combineLoadables,
	combineLoadablesIncludingEmpty,
	withRequiredKeys,
	mapLoaded,
	switchMapLoaded,
	loadableFromStream,
	createInteractiveLoadable,
	combineLoadableStreams,
	combineLoadableStreamsIncludingEmpty,
} from '@/shared/utils/loadable/loadable-stream';

const apiError: ApiError = new ApiError('', '', '', 0);
const loading = Loadable.Loading<number>();
const loaded = Loadable.Loaded(1);
const error = Loadable.LoadingError<number>(apiError);
const empty = Loadable.Empty<number>();
const dummyObject = { a: 1 };

const eachState = [
	['loading', loading],
	['loaded', loaded],
	['error', error],
	['empty', empty],
] as const;
const eachCheck = [
	['isLoadable', isLoadable],
	['isEmpty', isEmpty],
	['isError', isError],
	['isLoading', isLoading],
] as const;

function allValuesFrom<T>(o: Observable<T>): Promise<T[]> {
	return new Promise((resolve, reject) => {
		const values: T[] = [];
		o.subscribe({
			next: v => values.push(v),
			complete: () => resolve(values),
			error: e => {
				console.error('Error in allValuesFrom', e);
				reject(e);
			},
		});
	});
}

describe('Loadable state checks', () => {
	test.each(eachCheck)('%s Should return false for non-loadable object', (_, f) => expect(f(dummyObject)).toBe(false));
	test.each(eachState)('%s isLoadable', (_, v) => expect(Loadable.isLoadable(v)).toBe(true));
	test('isLoaded should return true for loaded', () => expect(Loadable.isLoaded(loaded) && loaded.isLoaded()).toBe(true));
	test('isLoading should return true for loading', () => expect(Loadable.isLoading(loading) && loading.isLoading()).toBe(true));
	test('isError should return true for error', () => expect(Loadable.isError(error) && error.isError()).toBe(true));
	test('isEmpty should return true for empty', () => expect(Loadable.isEmpty(empty) && empty.isEmpty()).toBe(true));
});

describe('value checks', () => {
	test('error contains the error', () => expect(error.error).toBe(apiError));
	test('loaded contains the value', () => expect(loaded.value).toBe(1));
	test('empty contains no value', () => expect(empty.value).toBe(undefined));
	test('loading contains no value', () => expect(loading.value).toBe(undefined));
	test('loaded contains no error', () => expect(loaded.error).toBe(undefined));
	test('empty contains no error', () => expect(empty.error).toBe(undefined));
	test('loading contains no error', () => expect(loading.error).toBe(undefined));
});

describe('Loadable helpers', () => {
	test('map maps loaded values and passes through other states', () => {
		const mapper = vi.fn((value: number) => value + 1);

		expect(Loadable.map(loaded, mapper)).toEqual(Loadable.Loaded(2));
		expect(Loadable.map(loading, mapper)).toBe(loading);
		expect(Loadable.map(error, mapper)).toBe(error);
		expect(Loadable.map(empty, mapper)).toBe(empty);
		expect(mapper).toHaveBeenCalledTimes(1);
	});
});

describe('combineLoadables', () => {
	function sharedCombineTests(name: string, combiner: typeof combineLoadables | typeof combineLoadablesIncludingEmpty) {
		test(name + ' should return proper value when used with an array', () => {
			const combined = combiner([loaded, dummyObject, loaded] as const);
			expect(combined.isLoaded()).toBe(true);
			expect(combined.value![0]).toBe(1);
			expect(combined.value![1].a).toBe(1);
			expect(combined.value![2]).toBe(1);
			expect(Loadable.isLoadable(combined)).toBe(true);
		});
		test(name + ' should return proper value when used with an object', () => {
			const toCombine = { a: loaded, b: dummyObject, c: loaded };
			const combinedObj = combiner(toCombine);
			expect(combinedObj.isLoaded()).toBe(true);
			expect(combinedObj.value!.a).toBe(1);
			expect(combinedObj.value!.b.a).toBe(1);
			expect(combinedObj.value!.c).toBe(1);
			expect(Loadable.isLoadable(combinedObj)).toBe(true);
		});
		test(name + ' with a loading value should return the loading state', () => {
			const combinedObj = combiner({ a: loading, b: dummyObject, c: loaded });
			expect(combinedObj.isLoading()).toBe(true);
			expect(combinedObj.value).toBe(undefined);
		});
		test(name + ' with an error value should return the error state', () => {
			const combinedObj = combiner({ a: error, b: dummyObject, c: loaded });
			expect(combinedObj.isError()).toBe(true);
			expect(combinedObj.error).toBe(apiError);
		});
		test(name + ' should handle null and undefined', () => {
			const combinedWithNull = combiner({
				a: null,
				b: undefined,
				c: Loadable.Loaded(undefined),
				d: Loadable.Loaded(null),
			});
			expect(combinedWithNull.isLoaded()).toBe(true);
			expect(combinedWithNull.value!.a).toBe(null);
			expect(combinedWithNull.value!.b).toBe(undefined);
			expect(combinedWithNull.value!.c).toBe(undefined);
			expect(combinedWithNull.value!.d).toBe(null);
		});
	}
	sharedCombineTests('combineLoadables', combineLoadables);
	test('combineLoadables with an empty value should return the empty state', () => {
		const combinedObj = combineLoadables({ a: empty, b: { a: 2 }, c: loaded });
		expect(combinedObj.isEmpty()).toBe(true);
		expect(combinedObj.value).toBe(undefined);
	});

	sharedCombineTests('combineLoadablesIncludingEmpty', combineLoadablesIncludingEmpty);
	test('combineLoadablesIncludingEmpty with an empty value should return the loaded state', () => {
		const combinedObj = combineLoadablesIncludingEmpty({ a: empty, b: { a: 2 }, c: loaded });
		expect(combinedObj.isLoaded()).toBe(true);
		expect(combinedObj.value).toEqual({ a: undefined, b: { a: 2 }, c: loaded.value });
	});
});

describe('loadedIfNotNull', () => {
	type T = { [K in keyof typeof dummyObject]?: undefined | null | (typeof dummyObject)[K] } & {
		b?: number | null | undefined;
	};
	test('returns a loaded if the keys are not null', () => {
		// When given a (set of) keys, check inside the object.
		expect(withRequiredKeys<T>('a' as const)(dummyObject)).toEqual(Loadable.Loaded(dummyObject));
		expect(withRequiredKeys<T>('a')({ a: null })).toEqual(empty);
		expect(withRequiredKeys<T>('a')({ a: null })).toEqual(empty);
		expect(withRequiredKeys<T>('a', 'b')(dummyObject)).toEqual(empty); // b key not present -> empty
		expect(withRequiredKeys<T>('a', 'b')({ a: null, b: null })).toEqual(empty); // a and b keys are null -> empty
		expect(withRequiredKeys<T>('a', 'b')({ a: null, b: 1 })).toEqual(empty); // a key is null -> empty
		expect(withRequiredKeys<T>('a', 'b')({ a: 1, b: 1 })).toEqual(Loadable.Loaded({ a: 1, b: 1 })); // b key is null -> empty

		// When given no keys, check the object itself.
		expect(withRequiredKeys<T>()(null as any)).toEqual(empty);
		expect(withRequiredKeys<T>()(undefined as any)).toEqual(empty);
		expect(withRequiredKeys<T>()({})).toEqual(Loadable.Loaded({})); // no key given, parameter is not null -> result is loaded
	});
});

describe('toObservable', () => {
	const successValue = dummyObject;
	const failValue = apiError;
	// Vitest doesn't like if we create a rejected promise outside a test, so do it in a function we call from within test()...
	const successRequest = () => new CancelableRequest(Promise.resolve(successValue), () => {});
	const failRequest = () => new CancelableRequest(Promise.reject(failValue), () => {});

	test('should return an observable', () => expect(successRequest().toObservable()).toBeInstanceOf(Observable));
	test('for a success, should emit [Loading, Loaded]', () => expect(allValuesFrom(successRequest().toObservable())).resolves.toEqual([loading, Loadable.Loaded(successValue)]));
	test('for a failure, should emit [Loading, Error]', () => expect(allValuesFrom(failRequest().toObservable())).resolves.toEqual([loading, Loadable.LoadingError(failValue)]));
	test.each([
		['Error', new Error('unexpected'), new ApiError('Unknown Error', 'unexpected', 'Error', undefined)],
		['plain rejection', { message: 'unexpected' }, new ApiError('Unknown Error', 'unexpected', 'Error', undefined)],
	])('wraps an unexpected %s in ApiError', async (_name, rejection, expected) => {
		const values = await allValuesFrom(new CancelableRequest(Promise.reject(rejection), () => {}).toObservable());
		expect(values).toEqual([loading, Loadable.LoadingError(expected)]);
		expect(values[1].error).toBeInstanceOf(ApiError);
	});
	test('maps cancellation to Empty', () => expect(allValuesFrom(new CancelableRequest(Promise.reject(ApiError.CANCELLED), () => {}).toObservable())).resolves.toEqual([loading, empty]));
});

describe('loaded stream operators', () => {
	test('maps and switch-maps loaded values', async () => {
		await expect(allValuesFrom(of(loaded).pipe(mapLoaded(value => value + 1)))).resolves.toEqual([Loadable.Loaded(2)]);
		await expect(allValuesFrom(of(loaded).pipe(switchMapLoaded(value => of(Loadable.Loaded(value + 1)))))).resolves.toEqual([Loadable.Loaded(2)]);
	});

	test.each([loading, error, empty])('passes through the exact non-loaded object', async state => {
		expect((await allValuesFrom(of(state).pipe(mapLoaded(value => value))))[0]).toBe(state);
		expect((await allValuesFrom(of(state).pipe(switchMapLoaded(value => of(Loadable.Loaded(value))))))[0]).toBe(state);
	});

	test('switchMapLoaded cancels the previous inner stream when a new state arrives', () => {
		const source = new Subject<Loadable<number>>();
		const innerTeardown = vi.fn();
		const output: Loadable<number>[] = [];
		const subscription = source
			.pipe(
				switchMapLoaded(
					value =>
						new Observable<Loadable<number>>(observer => {
							observer.next(Loadable.Loaded(value + 1));
							return innerTeardown;
						}),
				),
			)
			.subscribe(value => output.push(value));

		source.next(loaded);
		const nextState = Loadable.Loading<number>();
		source.next(nextState);

		expect(innerTeardown).toHaveBeenCalledOnce();
		expect(output.at(-1)).toBe(nextState);
		subscription.unsubscribe();
	});
});

describe('loadableFromStream', () => {
	test('starts empty', () => {
		const ob$ = new Subject<number>();
		const o = loadableFromStream(ob$);
		expect(o.isEmpty()).toBe(true);
		ob$.complete();
	});

	test('wraps plain values and mirrors loadable states', () => {
		const ob$ = new Subject<number>();
		const o = loadableFromStream(ob$);
		ob$.next(1);
		expect(o.isLoaded() && o.value).toBe(1);
		ob$.complete();
	});

	test('publishes each state, value, and error atomically', async () => {
		const ob$ = new Subject<{ html: string }>();
		const o = loadableFromStream(ob$);
		const mappedValues: Array<{ html: string } | undefined> = [];
		const mapped = computed(() =>
			Loadable.map(o, value => {
				mappedValues.push(value);
				return value?.html ?? 'missing';
			}),
		);

		ob$.next({ html: '<p>Rendered content</p>' });
		await nextTick();

		expect(mapped.value.state).toBe(LoadableState.loaded);
		expect(mapped.value.value).toBe('<p>Rendered content</p>');
		expect(mappedValues).toEqual([{ html: '<p>Rendered content</p>' }]);
		ob$.complete();
	});

	test('unpacks all loadable states', () => {
		const ob$ = new Subject<Loadable<number>>();
		const o = loadableFromStream(ob$);
		ob$.next(Loadable.Loaded(1));
		expect(o).toMatchObject({ state: LoadableState.loaded, value: 1, error: undefined });
		ob$.next(error);
		expect(o).toMatchObject({ state: LoadableState.error, value: undefined, error: apiError });
		ob$.next(loading);
		expect(o).toMatchObject({ state: LoadableState.loading, value: undefined, error: undefined });
		ob$.next(empty);
		expect(o).toMatchObject({ state: LoadableState.empty, value: undefined, error: undefined });
		ob$.complete();
	});

	test('wraps errors from the stream error channel', () => {
		const ob$ = new Subject<number>();
		const o = loadableFromStream(ob$);
		ob$.error(new Error('failed'));
		expect(o.isError() && o.error).toMatchObject({ message: 'failed' });
	});

	test('retains settled states but clears an unfinished loading state on completion', () => {
		const loaded$ = new Subject<Loadable<number>>();
		const loadedOutput = loadableFromStream(loaded$);
		loaded$.next(loaded);
		loaded$.complete();
		expect(loadedOutput).toMatchObject(loaded);

		const error$ = new Subject<Loadable<number>>();
		const errorOutput = loadableFromStream(error$);
		error$.next(error);
		error$.complete();
		expect(errorOutput).toMatchObject(error);

		const loading$ = new Subject<Loadable<number>>();
		const loadingOutput = loadableFromStream(loading$);
		loading$.next(loading);
		loading$.complete();
		expect(loadingOutput.isEmpty()).toBe(true);
	});

	test('unsubscribes with its Vue scope', () => {
		const teardown = vi.fn();
		const scope = effectScope();
		scope.run(() => loadableFromStream(new Observable(() => teardown)));
		scope.stop();
		expect(teardown).toHaveBeenCalledOnce();
	});
});

describe('createInteractiveLoadable', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	test('cancels a pending per-input debounce when a newer input arrives', async () => {
		vi.useFakeTimers();
		const loadable = createInteractiveLoadable<number, number>(
			input$ => input$.pipe(map(value => Loadable.Loaded(value))),
			value => (value < 0 ? 20 : 0),
		);

		loadable.next(1);
		loadable.next(-1);
		await vi.advanceTimersByTimeAsync(10);
		loadable.next(-2);
		expect(loadable.isLoaded() && loadable.value).toBe(1);

		await vi.advanceTimersByTimeAsync(20);
		expect(loadable.isLoaded() && loadable.value).toBe(-2);

		loadable.dispose();
	});

	test('publishes exactly one emitted state and wraps raw errors', () => {
		const output$ = new Subject<Loadable<number>>();
		const loadable = createInteractiveLoadable<number, number>(() => output$, 0);
		const emittedError = new ApiError('Failed', 'Try again', 'Server error', 500);

		output$.next(Loadable.Loaded(1));
		output$.next(Loadable.Loading());
		expect(loadable).toMatchObject({ state: LoadableState.loading, value: undefined, error: undefined });

		output$.next(Loadable.LoadingError(emittedError));
		expect(loadable).toMatchObject({ state: LoadableState.error, value: undefined, error: emittedError });

		output$.error(new Error('raw failure'));
		expect(loadable.isError() && loadable.error).toMatchObject({ message: 'raw failure' });

		loadable.dispose();
	});

	test('clears on completion and stops pending work and late publication when disposed', async () => {
		vi.useFakeTimers();
		const output$ = new Subject<Loadable<number>>();
		const processed = vi.fn();
		const loadable = createInteractiveLoadable<number, number>(
			input$ =>
				input$.pipe(
					map(processed),
					switchMap(() => output$),
				),
			20,
		);

		loadable.next(1);
		loadable.dispose();
		await vi.advanceTimersByTimeAsync(20);
		expect(processed).not.toHaveBeenCalled();
		output$.next(Loadable.Loaded(2));
		expect(loadable.isEmpty()).toBe(true);

		const completing$ = new Subject<Loadable<number>>();
		const completing = createInteractiveLoadable<number, number>(() => completing$, 0);
		completing$.next(Loadable.Loaded(1));
		completing$.complete();
		expect(completing.isEmpty()).toBe(true);
		completing.dispose();
	});
});

describe('combineLoadableStreams', () => {
	test('works with array', async () => {
		await expect(allValuesFrom(combineLoadableStreams([of(loaded), of(loaded), of(loaded)]))).resolves.toEqual([Loadable.Loaded([loaded.value, loaded.value, loaded.value])]);
		await expect(allValuesFrom(combineLoadableStreams([of(empty), of(loaded), of(loaded)]))).resolves.toEqual([empty]);
		await expect(allValuesFrom(combineLoadableStreams([of(error), of(loaded), of(loaded)]))).resolves.toEqual([error]);
		await expect(allValuesFrom(combineLoadableStreams([of(loading), of(loaded), of(loaded)]))).resolves.toEqual([loading]);
		await expect(allValuesFrom(combineLoadableStreams([EMPTY, of(loaded), of(loaded)]))).resolves.toEqual([]);
	});
	test('works with objects', async () => {
		await expect(allValuesFrom(combineLoadableStreams({ a: of(loaded), b: of(loaded), c: of(loaded) }))).resolves.toEqual([Loadable.Loaded({ a: loaded.value, b: loaded.value, c: loaded.value })]);
		await expect(allValuesFrom(combineLoadableStreams({ a: of(empty), b: of(loaded), c: of(loaded) }))).resolves.toEqual([empty]);
		await expect(allValuesFrom(combineLoadableStreams({ a: of(error), b: of(loaded), c: of(loaded) }))).resolves.toEqual([error]);
		await expect(allValuesFrom(combineLoadableStreams({ a: of(loading), b: of(loaded), c: of(loaded) }))).resolves.toEqual([loading]);
		await expect(allValuesFrom(combineLoadableStreams({ a: EMPTY, b: of(loaded), c: of(loaded) }))).resolves.toEqual([]);
	});
	test('does not emit repeated loading states', async () =>
		expect(allValuesFrom(combineLoadableStreams([of(loaded), of(loaded), of(loading, loading, loaded)]))).resolves.toEqual([loading, Loadable.Loaded([loaded.value, loaded.value, loaded.value])]));
	test('does not emit repeated empty states', async () =>
		expect(allValuesFrom(combineLoadableStreams([of(loaded), of(loaded), of(empty, empty, loaded)]))).resolves.toEqual([empty, Loadable.Loaded([loaded.value, loaded.value, loaded.value])]));
	test('works with streams containing normal values instead of Loadables', async () => {
		await expect(allValuesFrom(combineLoadableStreams([of(loaded.value)]))).resolves.toEqual([Loadable.Loaded([loaded.value])]);
		await expect(allValuesFrom(combineLoadableStreams([of(loaded.value), of(loaded)]))).resolves.toEqual([Loadable.Loaded([loaded.value, loaded.value])]);
	});
});

describe('combineLoadableStreamsIncludingEmpty', () => {
	test('works with array', async () => {
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([of(loaded), of(loaded), of(loaded)]))).resolves.toEqual([Loadable.Loaded([loaded.value, loaded.value, loaded.value])]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([of(empty), of(loaded), of(loaded)]))).resolves.toEqual([Loadable.Loaded([undefined, loaded.value, loaded.value])]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([of(error), of(loaded), of(loaded)]))).resolves.toEqual([error]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([of(loading), of(loaded), of(loaded)]))).resolves.toEqual([loading]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([EMPTY, of(loaded), of(loaded)]))).resolves.toEqual([]);
	});
	test('works with objects', async () => {
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty({ a: of(loaded), b: of(loaded), c: of(loaded) }))).resolves.toEqual([
			Loadable.Loaded({ a: loaded.value, b: loaded.value, c: loaded.value }),
		]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty({ a: of(empty), b: of(loaded), c: of(loaded) }))).resolves.toEqual([
			Loadable.Loaded({ a: undefined, b: loaded.value, c: loaded.value }),
		]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty({ a: of(error), b: of(loaded), c: of(loaded) }))).resolves.toEqual([error]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty({ a: of(loading), b: of(loaded), c: of(loaded) }))).resolves.toEqual([loading]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty({ a: EMPTY, b: of(loaded), c: of(loaded) }))).resolves.toEqual([]);
	});
	test('does not emit repeated loading states', async () =>
		expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([of(loaded), of(loaded), of(loading, loading, loaded)]))).resolves.toEqual([
			loading,
			Loadable.Loaded([loaded.value, loaded.value, loaded.value]),
		]));
	test('does not emit repeated empty states', async () =>
		expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([of(loaded), of(loaded), of(empty, empty, loaded)]))).resolves.toEqual([
			Loadable.Loaded([loaded.value, loaded.value, undefined]),
			Loadable.Loaded([loaded.value, loaded.value, undefined]),
			Loadable.Loaded([loaded.value, loaded.value, loaded.value]),
		]));
	test('works with streams containing normal values instead of Loadables', async () => {
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([of(loaded.value)]))).resolves.toEqual([Loadable.Loaded([loaded.value])]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([of(loaded.value), of(loaded)]))).resolves.toEqual([Loadable.Loaded([loaded.value, loaded.value])]);
	});
});

describe('Empty stream handling in combineLoadableStreams and combineLoadableStreamsIncludingEmpty', () => {
	test('combineLoadableStreams does not emit if one stream is empty', async () => expect(allValuesFrom(combineLoadableStreams([of(loaded), EMPTY, of(loaded)]))).resolves.toEqual([]));
	test('combineLoadableStreamsIncludingEmpty does not emit if one stream is empty', async () =>
		expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([of(loaded), EMPTY, of(loaded)]))).resolves.toEqual([]));
});
