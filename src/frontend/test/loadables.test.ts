import {test, expect, describe} from 'vitest';
import { EMPTY, Observable, of, Subject } from 'rxjs';

import {Loadable, LoadableFromStream, LoadableState, combineLoadableStreams, combineLoadableStreamsIncludingEmpty, combineLoadables, combineLoadablesIncludingEmpty, flatMapLoadable, loadableFromObservable, loadableStreamFromPromise, loadedIfNotNull, mapLoadable, mergeMapLoadable, promiseFromLoadableStream, switchMapLoadable, toObservable} from '@/utils/loadable-streams';
import { ApiError } from '@/api';
import { CancelableRequest } from '@/api/apiutils';

const apiError: ApiError = new ApiError('', '', '', 0);
const loading = Loadable.Loading();
const loaded = Loadable.Loaded(1);
const error = Loadable.LoadingError(apiError);
const empty = Loadable.Empty();
const dummyObject = {a: 1};

const eachState = [['loading', loading], ['loaded', loaded], ['error', error], ['empty', empty]] as const;
const eachCheck = [['isLoadable', Loadable.isLoadable], ['isEmpty', Loadable.isEmpty], ['isError', Loadable.isError], ['isLoading', Loadable.isLoading]] as const;

function allValuesFrom<T>(o: Observable<T>): Promise<T[]> {
	return new Promise((resolve, reject) => {
		const values: T[] = [];
		o.subscribe({
			next: v => values.push(v),
			complete: () => resolve(values),
			error: e => {
				console.log('Error in allValuesFrom', e);
				reject(e);
			}
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
})

describe('combineLoadables', () => {
	function sharedCombineTests(name: string, combiner: typeof combineLoadables|typeof combineLoadablesIncludingEmpty) {
		test(name + ' should return proper value when used with an array', () => {
			const combined = combiner([loaded, dummyObject, loaded] as const);
			expect(combined.isLoaded()).toBe(true);
			expect(combined.value![0]).toBe(1);
			expect(combined.value![1].a).toBe(1);
			expect(combined.value![2]).toBe(1);
			expect(Loadable.isLoadable(combined)).toBe(true);
		});
		test(name + ' should return proper value when used with an object', () => {
			const toCombine = {a: loaded, b: dummyObject, c: loaded};
			const combinedObj = combiner(toCombine);
			expect(combinedObj.isLoaded()).toBe(true);
			expect(combinedObj.value!.a).toBe(1);
			expect(combinedObj.value!.b.a).toBe(1);
			expect(combinedObj.value!.c).toBe(1);
			expect(Loadable.isLoadable(combinedObj)).toBe(true);
		});
		test(name + ' with a loading value should return the loading state', () => {
			const combinedObj = combiner({a: loading, b: dummyObject, c: loaded});
			expect(combinedObj.isLoading()).toBe(true);
			expect(combinedObj.value).toBe(undefined);
		});
		test(name + ' with an error value should return the error state', () => {
			const combinedObj = combiner({a: error, b: dummyObject, c: loaded});
			expect(combinedObj.isError()).toBe(true);
			expect(combinedObj.error).toBe(apiError);
		});
		test(name + ' should handle null and undefined', () => {
			const combinedWithNull = combiner({a: null, b: undefined, c: Loadable.Loaded(undefined), d: Loadable.Loaded(null)});
			expect(combinedWithNull.isLoaded()).toBe(true);
			expect(combinedWithNull.value!.a).toBe(null);
			expect(combinedWithNull.value!.b).toBe(undefined);
			expect(combinedWithNull.value!.c).toBe(undefined);
			expect(combinedWithNull.value!.d).toBe(null);
		})
	}
	sharedCombineTests('combineLoadables', combineLoadables);
	test('combineLoadables with an empty value should return the empty state', () => {
		const combinedObj = combineLoadables({a: empty, b: {a: 2}, c: loaded});
		expect(combinedObj.isEmpty()).toBe(true);
		expect(combinedObj.value).toBe(undefined);
	});

	sharedCombineTests('combineLoadablesIncludingEmpty', combineLoadablesIncludingEmpty);
	test('combineLoadablesIncludingEmpty with an empty value should return the loaded state', () => {
		const combinedObj = combineLoadablesIncludingEmpty({a: empty, b: {a: 2}, c: loaded});
		expect(combinedObj.isLoaded()).toBe(true);
		expect(combinedObj.value).toEqual({a: undefined, b: {a: 2}, c: loaded.value});
	});
})

describe('loadedIfNotNull', () => {
	type T = {[K in keyof typeof dummyObject]?: undefined|null|(typeof dummyObject)[K]}&{b?: number|null|undefined};
	test('returns a loaded if the keys are not null', () => {
		// When given a (set of) keys, check inside the object.
		expect(loadedIfNotNull<T>('a')(dummyObject)).toEqual(Loadable.Loaded(dummyObject));
		expect(loadedIfNotNull<T>('a')({a: null})).toEqual(empty);
		expect(loadedIfNotNull<T>('a')({a: null})).toEqual(empty);
		expect(loadedIfNotNull<T>('a', 'b')(dummyObject)).toEqual(empty); // b key not present -> empty
		expect(loadedIfNotNull<T>('a', 'b')({a: null, b: null})).toEqual(empty); // a and b keys are null -> empty
		expect(loadedIfNotNull<T>('a', 'b')({a: null, b: 1})).toEqual(empty); // a key is null -> empty
		expect(loadedIfNotNull<T>('a', 'b')({a: 1, b: 1})).toEqual(Loadable.Loaded({a: 1, b: 1})); // b key is null -> empty

		// When given no keys, check the object itself.
		expect(loadedIfNotNull<T>()(null as any)).toEqual(empty);
		expect(loadedIfNotNull<T>()(undefined as any)).toEqual(empty);
		expect(loadedIfNotNull<T>()({})).toEqual(Loadable.Loaded({})); // no key given, parameter is not null -> result is loaded
	})
})


describe('toObservable', () => {
	const successValue = dummyObject;
	const failValue = apiError;
	// Vitest doesn't like if we create a rejected promise outside a test, so do it in a function we call from within test()...
	const successRequest = () => new CancelableRequest(Promise.resolve(successValue), () => {});
	const failRequest = () => new CancelableRequest(Promise.reject(failValue), () => {});

	test('should return an observable', () => expect(successRequest().toObservable()).toBeInstanceOf(Observable));
	test('for a success, should emit [Loading, Loaded]', () => expect(allValuesFrom(successRequest().toObservable())).resolves.toEqual([loading, Loadable.Loaded(successValue)]));
	test('for a failure, should emit [Loading, Error]', () => expect(allValuesFrom(failRequest().toObservable())).resolves.toEqual([loading, Loadable.LoadingError(failValue)]));
});

// Big combination test for all loadable stream operators with all possible input values.
describe('loadable streams operators', () => {
	const expectedValueOutput = {a: 2};
	const expectedLoadableOutput = Loadable.Loaded(expectedValueOutput);
	const operatorsAndImplementations = [
		{op: mapLoadable, ret: () => expectedValueOutput}, // return value of mapLoadable is implicitly wrapped in Loaded, so return raw value
		{op: mergeMapLoadable, ret: () => of(expectedLoadableOutput)},
		{op: switchMapLoadable, ret: () => of(expectedLoadableOutput)},
		{op: flatMapLoadable, ret: () => expectedLoadableOutput}
	];

	for (const {op, ret} of operatorsAndImplementations) {
		for (const streamInput of [loaded, error, loading, empty]) {
			const normalStreamOutput = streamInput;
			const stream = of(streamInput);
			for (const operateOnThisState of [LoadableState.Empty, LoadableState.Error, LoadableState.Loading, LoadableState.Loaded]) {
				const expectedStreamOutput = operateOnThisState === streamInput.state ? expectedLoadableOutput : normalStreamOutput;
				const outputdescription = operateOnThisState === streamInput.state ? 'the replaced value' : 'the original value';
				test(`${op.name} state ${operateOnThisState} in stream containing ${streamInput.state} should return ${outputdescription}`, () =>
					expect(allValuesFrom(stream.pipe((op as any)(operateOnThisState, ret)))).resolves.toEqual([expectedStreamOutput])
				);
			}
		}
	}
})

describe('loadableFromStream', () => {
	test('the default initial state should be empty', () => {
		const ob$ = new Subject<number>();
		const o = new LoadableFromStream(ob$);
		expect(o.state).toBe(LoadableState.Empty);
		o.dispose();
	})
	test('if configured, the initial state should be loading', () => {
		const ob$ = new Subject<number>();
		const o = new LoadableFromStream(ob$, {loadingOnStart: true});
		expect(o.state).toBe(LoadableState.Loading);
		o.dispose();
	})
	test('the state should be empty after the stream completes', () => {
		const ob$ = new Subject<number>();
		const o = new LoadableFromStream(ob$, {loadingOnStart: true});
		ob$.complete();
		expect(o.state).toBe(LoadableState.Empty);
		o.dispose();
	})
	test('if configured, the final should be preserved after the stream completes', () => {
		const ob$ = new Subject<number>();
		const o = new LoadableFromStream(ob$, {loadingOnStart: true, keepValueAfterCompletion: true});
		ob$.complete();
		expect(o.state).toBe(LoadableState.Loading);
		o.dispose();
	})
	test('its value should mirror the stream output', () => {
		const ob$ = new Subject<number>();
		const o = new LoadableFromStream(ob$);
		ob$.next(1);
		expect(o.state).toBe(LoadableState.Loaded);
		expect(o.value).toBe(1);
		ob$.next(2);
		expect(o.state).toBe(LoadableState.Loaded);
		expect(o.value).toBe(2);
		o.dispose();
	})
	test('it should unpack loadables in the stream', () => {
		const ob$ = new Subject<Loadable<Number>>();
		const o = new LoadableFromStream(ob$);
		ob$.next(Loadable.Loaded(1));
		expect(o.state).toBe(LoadableState.Loaded);
		expect(o.value).toBe(1);
		ob$.next(Loadable.Loaded(2));
		expect(o.state).toBe(LoadableState.Loaded);
		expect(o.value).toBe(2);
		ob$.next(error as Loadable<any>);
		expect(o.state).toBe(LoadableState.Error);
		expect(o.error).toBe(error.error);
		ob$.next(empty as Loadable<any>);
		expect(o.state).toBe(LoadableState.Empty);
		o.dispose();
	})
	test('it should capture errors in the stream', () => {
		const ob$ = new Subject<number>();
		const o = new LoadableFromStream(ob$);
		ob$.error(apiError);
		expect(o.state).toBe(LoadableState.Error);
		expect(o.error).toBeInstanceOf(ApiError);
		o.dispose();
	})
})


describe('promiseFromLoadableStream', () => {
	test('should return a promise that resolves to the value', () => expect(promiseFromLoadableStream(of(loaded))).resolves.toBe(loaded.value));
	test('should return a promise that rejects on error', () => expect(promiseFromLoadableStream(of(error))).rejects.toBeInstanceOf(ApiError));
	test('should ignore loading states', () => expect(promiseFromLoadableStream(of(loading, loaded))).resolves.toBe(loaded.value));
	test('should ignore subsequent values after the first', () => expect(promiseFromLoadableStream(of(Loadable.Loaded(1), Loadable.Loaded(2)))).resolves.toBe(1));
})


describe('loadableStreamFromPromise', () => {
	test('stream from successful promise returns loading state followed by loaded state', () =>
		expect(allValuesFrom(loadableStreamFromPromise(Promise.resolve(loaded.value)))).resolves.toEqual([loading, loaded])
	);
	test('stream from failed promise returns loading state followed by error state', () =>
		expect(allValuesFrom(loadableStreamFromPromise(Promise.reject(apiError)))).resolves.toEqual([loading, error])
	);
})



describe('combineLoadableStreams', () => {
	test('works with array', async () => {
		await expect(allValuesFrom(combineLoadableStreams([of(loaded), of(loaded), of(loaded)]))).resolves.toEqual([Loadable.Loaded([loaded.value, loaded.value, loaded.value])]);
		await expect(allValuesFrom(combineLoadableStreams([of(empty), of(loaded), of(loaded)]))).resolves.toEqual([empty]);
		await expect(allValuesFrom(combineLoadableStreams([of(error), of(loaded), of(loaded)]))).resolves.toEqual([error]);
		await expect(allValuesFrom(combineLoadableStreams([of(loading), of(loaded), of(loaded)]))).resolves.toEqual([loading]);
		await expect(allValuesFrom(combineLoadableStreams([EMPTY, of(loaded), of(loaded)]))).resolves.toEqual([]);
	})
	test('works with objects', async () => {
		await expect(allValuesFrom(combineLoadableStreams({a: of(loaded), b: of(loaded), c: of(loaded)}))).resolves.toEqual([Loadable.Loaded({a: loaded.value, b: loaded.value, c: loaded.value})]);
		await expect(allValuesFrom(combineLoadableStreams({a: of(empty), b: of(loaded), c: of(loaded)}))).resolves.toEqual([empty]);
		await expect(allValuesFrom(combineLoadableStreams({a: of(error), b: of(loaded), c: of(loaded)}))).resolves.toEqual([error]);
		await expect(allValuesFrom(combineLoadableStreams({a: of(loading), b: of(loaded), c: of(loaded)}))).resolves.toEqual([loading]);
		await expect(allValuesFrom(combineLoadableStreams({a: EMPTY, b: of(loaded), c: of(loaded)}))).resolves.toEqual([]);
	})
	test('does not emit repeated loading states', async () =>
		expect(allValuesFrom(combineLoadableStreams([of(loaded), of(loaded), of(loading, loading, loaded)]))).resolves.toEqual([loading, Loadable.Loaded([loaded.value, loaded.value, loaded.value])])
	)
	test('does not emit repeated empty states', async () =>
		expect(allValuesFrom(combineLoadableStreams([of(loaded), of(loaded), of(empty, empty, loaded)]))).resolves.toEqual([empty, Loadable.Loaded([loaded.value, loaded.value, loaded.value])])
	)
})

describe('combineLoadableStreamsIncludingEmpty', () => {
	test('works with array', async () => {
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([of(loaded), of(loaded), of(loaded)]))).resolves.toEqual([Loadable.Loaded([loaded.value, loaded.value, loaded.value])]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([of(empty), of(loaded), of(loaded)]))).resolves.toEqual([Loadable.Loaded([undefined, loaded.value, loaded.value])]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([of(error), of(loaded), of(loaded)]))).resolves.toEqual([error]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([of(loading), of(loaded), of(loaded)]))).resolves.toEqual([loading]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([EMPTY, of(loaded), of(loaded)]))).resolves.toEqual([]);
	})
	test('works with objects', async () => {
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty({a: of(loaded), b: of(loaded), c: of(loaded)}))).resolves.toEqual([Loadable.Loaded({a: loaded.value, b: loaded.value, c: loaded.value})]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty({a: of(empty), b: of(loaded), c: of(loaded)}))).resolves.toEqual([Loadable.Loaded({a: undefined, b: loaded.value, c: loaded.value})]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty({a: of(error), b: of(loaded), c: of(loaded)}))).resolves.toEqual([error]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty({a: of(loading), b: of(loaded), c: of(loaded)}))).resolves.toEqual([loading]);
		await expect(allValuesFrom(combineLoadableStreamsIncludingEmpty({a: EMPTY, b: of(loaded), c: of(loaded)}))).resolves.toEqual([]);
	})
	test('does not emit repeated loading states', async () =>
		expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([of(loaded), of(loaded), of(loading, loading, loaded)]))).resolves.toEqual([loading, Loadable.Loaded([loaded.value, loaded.value, loaded.value])])
	)
	test('does not emit repeated empty states', async () =>
		expect(allValuesFrom(combineLoadableStreamsIncludingEmpty([of(loaded), of(loaded), of(empty, empty, loaded)]))).resolves.toEqual([
			Loadable.Loaded([loaded.value, loaded.value, undefined]),
			Loadable.Loaded([loaded.value, loaded.value, undefined]),
			Loadable.Loaded([loaded.value, loaded.value, loaded.value])
		])
	)
})