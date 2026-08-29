import { afterEach, describe, expect, test, vi } from 'vitest';
import { effectScope, nextTick, ref, shallowRef } from 'vue';

import type { CorpusContext } from '@/app/state/useCorpusContext';
import startGlobalCorpusDependentEffects from '@/features/corpus/effects';
import type { Corpus } from '@/types/apptypes';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { LoadableState } from '@/shared/utils/loadable/loadable-core';
import { loadableReactive } from '@/shared/utils/loadable/loadable-reactive';

const mock = vi.hoisted(() => ({
	filterString: vi.fn(() => 'author:Austen'),
	next: vi.fn(),
	sourceField: vi.fn(() => 'contents'),
}));

vi.mock('@/features/search/model/query-state', () => ({ get: { filterString: mock.filterString, sourceField: mock.sourceField } }));
vi.mock('@/features/search/resources/selected-subcorpus-count.resource', () => ({ selectedSubcorpusLoader: { next: mock.next } }));

const blacklab = {} as BlackLabApi;
const corpus = (id: string) => ({ id }) as Corpus;
const context = (index: Corpus): CorpusContext => ({ index }) as CorpusContext;

function createContextLoader(initial?: CorpusContext) {
	const state = ref(initial ? LoadableState.loaded : LoadableState.empty);
	const value = shallowRef(initial);
	return { loader: loadableReactive(state, value), state, value };
}

afterEach(() => {
	mock.filterString.mockReset().mockReturnValue('author:Austen');
	mock.next.mockReset();
	mock.sourceField.mockReset().mockReturnValue('contents');
});

describe('global corpus effects', () => {
	test('refreshes once when started with an already published corpus', () => {
		const first = corpus('first');
		const { loader } = createContextLoader(context(first));
		const scope = effectScope();

		scope.run(() => startGlobalCorpusDependentEffects(loader, blacklab));

		expect(mock.next).toHaveBeenCalledOnce();
		expect(mock.next).toHaveBeenCalledWith({ index: first, annotatedFieldId: 'contents', filter: 'author:Austen', blacklab });
		scope.stop();
	});

	test('refreshes once per published corpus through empty, error, retry, and switch states', async () => {
		const first = corpus('first');
		const second = corpus('second');
		const { loader, state, value } = createContextLoader();
		const scope = effectScope();
		scope.run(() => startGlobalCorpusDependentEffects(loader, blacklab));

		expect(mock.next).not.toHaveBeenCalled();

		state.value = LoadableState.loading;
		await nextTick();
		state.value = LoadableState.error;
		await nextTick();
		expect(mock.next).not.toHaveBeenCalled();

		value.value = context(first);
		state.value = LoadableState.loaded;
		await nextTick();
		expect(mock.next).toHaveBeenCalledTimes(1);

		value.value = { ...value.value!, config: {} } as CorpusContext;
		await nextTick();
		expect(mock.next).toHaveBeenCalledTimes(1);

		value.value = undefined;
		state.value = LoadableState.loading;
		await nextTick();
		state.value = LoadableState.error;
		await nextTick();
		expect(mock.next).toHaveBeenCalledTimes(1);

		value.value = context(first);
		state.value = LoadableState.loaded;
		await nextTick();
		expect(mock.next).toHaveBeenCalledTimes(2);

		mock.sourceField.mockReturnValue('parallel__nl');
		mock.filterString.mockReturnValue('year:2026');
		value.value = context(second);
		state.value = LoadableState.loaded;
		await nextTick();

		expect(mock.next).toHaveBeenCalledTimes(3);
		expect(mock.next.mock.calls.map(([input]) => input.index)).toEqual([first, first, second]);
		expect(mock.next).toHaveBeenLastCalledWith({ index: second, annotatedFieldId: 'parallel__nl', filter: 'year:2026', blacklab });
		scope.stop();
	});
});
