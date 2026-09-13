import { afterEach, describe, expect, test, vi } from 'vitest';
import { effectScope, nextTick, shallowRef } from 'vue';

import type { CorpusContext } from '@/app/state/useCorpusContext';
import startGlobalCorpusDependentEffects from '@/features/corpus/effects';
import type { Corpus } from '@/types/apptypes';

import { ApiError, type BlackLabApi } from '@/shared/api/lib/api-types';
import { Loadable } from '@/shared/utils/loadable/loadable-core';
import { loadableReactiveFromSnapshot } from '@/shared/utils/loadable/loadable-reactive';

const mock = vi.hoisted(() => ({
	filterString: vi.fn(() => 'author:Austen'),
	next: vi.fn(),
	sourceField: vi.fn(() => 'contents'),
}));

vi.mock('@/features/search/resources/selected-subcorpus-count.resource', () => ({ selectedSubcorpusLoader: { next: mock.next } }));

const blacklab = {} as BlackLabApi;
const corpus = (id: string) => ({ id }) as Corpus;
const context = (index: Corpus): CorpusContext => ({ index }) as CorpusContext;

function createContextLoader(initial?: CorpusContext) {
	const snapshot = shallowRef<Loadable<CorpusContext>>(initial ? Loadable.Loaded(initial) : Loadable.Empty());
	return { loader: loadableReactiveFromSnapshot(snapshot, {}), snapshot };
}

afterEach(() => {
	mock.filterString.mockReset().mockReturnValue('author:Austen');
	mock.next.mockReset();
	mock.sourceField.mockReset().mockReturnValue('contents');
});

describe('global corpus effects', () => {
	test('refreshes the selected subcorpus when the committed query changes', async () => {
		const first = corpus('first');
		const { loader } = createContextLoader(context(first));
		const params = shallowRef({ number: 20, searchfield: 'contents', filter: 'year:1800' });
		const scope = effectScope();
		scope.run(() => startGlobalCorpusDependentEffects(loader, blacklab, params));
		params.value = { ...params.value, filter: 'year:1900' };
		await nextTick();
		expect(mock.next).toHaveBeenLastCalledWith({ index: first, annotatedFieldId: 'contents', filter: 'year:1900', blacklab });
		expect(mock.next).toHaveBeenCalledTimes(2);
		params.value = { ...params.value, number: 50 };
		await nextTick();
		expect(mock.next).toHaveBeenCalledTimes(2);
		scope.stop();
	});

	test('refreshes once when started with an already published corpus', () => {
		const first = corpus('first');
		const { loader } = createContextLoader(context(first));
		const scope = effectScope();

		scope.run(() => startGlobalCorpusDependentEffects(loader, blacklab, () => ({ number: 20, searchfield: mock.sourceField(), filter: mock.filterString() })));

		expect(mock.next).toHaveBeenCalledOnce();
		expect(mock.next).toHaveBeenCalledWith({ index: first, annotatedFieldId: 'contents', filter: 'author:Austen', blacklab });
		scope.stop();
	});

	test('refreshes once per published corpus through empty, error, retry, and switch states', async () => {
		const first = corpus('first');
		const second = corpus('second');
		const { loader, snapshot } = createContextLoader();
		const scope = effectScope();
		scope.run(() => startGlobalCorpusDependentEffects(loader, blacklab, () => ({ number: 20, searchfield: mock.sourceField(), filter: mock.filterString() })));

		expect(mock.next).not.toHaveBeenCalled();

		snapshot.value = Loadable.Loading();
		await nextTick();
		snapshot.value = Loadable.LoadingError(ApiError.wrap(new Error('failed')));
		await nextTick();
		expect(mock.next).not.toHaveBeenCalled();

		snapshot.value = Loadable.Loaded(context(first));
		await nextTick();
		expect(mock.next).toHaveBeenCalledTimes(1);

		snapshot.value = Loadable.Loaded({ ...snapshot.value.value!, config: {} } as CorpusContext);
		await nextTick();
		expect(mock.next).toHaveBeenCalledTimes(1);

		snapshot.value = Loadable.Loading();
		await nextTick();
		snapshot.value = Loadable.LoadingError(ApiError.wrap(new Error('failed')));
		await nextTick();
		expect(mock.next).toHaveBeenCalledTimes(1);

		snapshot.value = Loadable.Loaded(context(first));
		await nextTick();
		expect(mock.next).toHaveBeenCalledTimes(2);

		mock.sourceField.mockReturnValue('parallel__nl');
		mock.filterString.mockReturnValue('year:2026');
		snapshot.value = Loadable.Loaded(context(second));
		await nextTick();

		expect(mock.next).toHaveBeenCalledTimes(3);
		expect(mock.next.mock.calls.map(([input]) => input.index)).toEqual([first, first, second]);
		expect(mock.next).toHaveBeenLastCalledWith({ index: second, annotatedFieldId: 'parallel__nl', filter: 'year:2026', blacklab });
		scope.stop();
	});
});
