import { describe, expect, test, vi } from 'vitest';

import { ApiError } from '@/shared/api/lib/api-types';
import { combine } from '@/shared/utils/loadable/loadable-combine';
import { isLoadable, isError, isLoading, isEmpty, Loadable, LoadableState } from '@/shared/utils/loadable/loadable-core';

const apiError: ApiError = new ApiError('', '', '', 0);
const loading = Loadable.Loading<number>();
const loaded = Loadable.Loaded(1);
const error = Loadable.LoadingError<number>(apiError);
const empty = Loadable.Empty<number>();
const dummyObject = { a: 1 };

const eachCheck = [
	['isLoadable', isLoadable],
	['isEmpty', isEmpty],
	['isError', isError],
	['isLoading', isLoading],
] as const;

describe('Loadable state checks', () => {
	test.each(eachCheck)('%s Should return false for non-loadable object', (_, f) => expect(f(dummyObject)).toBe(false));
	test.each([
		['loading', loading, LoadableState.loading, undefined, undefined],
		['loaded', loaded, LoadableState.loaded, 1, undefined],
		['error', error, LoadableState.error, undefined, apiError],
		['empty', empty, LoadableState.empty, undefined, undefined],
	] as const)('%s has a coherent snapshot and matching predicates', (_, value, state, expectedValue, expectedError) => {
		expect(Loadable.isLoadable(value)).toBe(true);
		expect(value).toMatchObject({ state, value: expectedValue, error: expectedError });
		expect(value.error).toBe(expectedError);
		const expected = [state === LoadableState.loading, state === LoadableState.loaded, state === LoadableState.error, state === LoadableState.empty];
		expect([Loadable.isLoading(value), Loadable.isLoaded(value), Loadable.isError(value), Loadable.isEmpty(value)]).toEqual(expected);
		expect([value.isLoading(), value.isLoaded(), value.isError(), value.isEmpty()]).toEqual(expected);
	});
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

describe('combine', () => {
	test('unwraps loaded values while preserving plain values and the input shape', () => {
		const plain = { state: LoadableState.loading, value: undefined, error: undefined };
		expect(combine([loaded, plain]).value).toEqual([1, plain]);
		expect(combine({ first: loaded, plain, optional: null }).value).toEqual({ first: 1, plain, optional: null });
		expect(Loadable.wrap(plain).value).toBe(plain);
		expect(Loadable.wrap(loading)).toBe(loading);
	});

	test.each([loading, empty, error])('passes through the first unsettled dependency', state => {
		expect(combine([loaded, state, empty])).toBe(state);
		expect(combine({ first: loaded, second: state })).toBe(state);
	});
});
