// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { createMockCorpusContext } from '@test/mocks/corpus';
import { createMockCustomizations } from '@test/mocks/customizations';
import { shallowMount } from '@vue/test-utils';
import { describe, expect, test, vi } from 'vitest';
import type * as Vue from 'vue';
import { defineComponent, h, nextTick } from 'vue';

import * as ExploreStore from '@/features/search/model/form/explore-state';
import type { Corpus } from '@/types/apptypes';

import QueryFormExplore from '@/pages/search/form/QueryFormExplore.vue';

const watcherCallback = vi.hoisted(() => vi.fn());
const corpus = vi.hoisted(() => ({
	allAnnotationsMap: {
		lexicon: { id: 'lexicon', uiType: 'lexicon' },
	},
	allMetadataFieldsMap: {},
	annotationGroups: [],
	id: 'test',
	isParallelCorpus: false,
	metadataGroups: [],
	parallelAnnotatedFields: [],
	parallelAnnotatedFieldsMap: {},
	textDirection: 'ltr',
}));

vi.mock('vue', async importOriginal => {
	const vue = await importOriginal<typeof Vue>();
	return {
		...vue,
		watch: ((...args: Parameters<typeof vue.watch>) => {
			const [source, callback, options] = args;
			return vue.watch(
				source,
				(...callbackArgs) => {
					watcherCallback();
					return callback(...callbackArgs);
				},
				options,
			);
		}) as typeof vue.watch,
	};
});

describe('legacy explore form', () => {
	test('stops resetting lexicons when unmounted and observes resets after remount', async () => {
		const customizations = createMockCustomizations(corpus as unknown as Corpus);
		const api = createMockApi();
		const corpusContext = createMockCorpusContext({ corpus: corpus as unknown as Corpus });
		ExploreStore.actions.ngram.replace({
			groupAnnotationId: 'lexicon',
			maxSize: 1,
			size: 1,
			tokens: [{ id: 'lexicon', value: '' }],
		});
		const reset = vi.fn();
		const LexiconStub = defineComponent({
			setup(_, { expose }) {
				expose({ reset });
				return () => h('span');
			},
		});
		const mountExplore = () =>
			shallowMount(QueryFormExplore, {
				global: { plugins: [api, corpusContext, customizations], stubs: { Lexicon: LexiconStub } },
			});

		const first = mountExplore();
		ExploreStore.resetSignal.value++;
		await nextTick();
		expect(reset).toHaveBeenCalledTimes(1);
		expect(watcherCallback).toHaveBeenCalledTimes(1);

		first.unmount();
		ExploreStore.resetSignal.value++;
		await nextTick();
		expect(reset).toHaveBeenCalledTimes(1);
		expect(watcherCallback).toHaveBeenCalledTimes(1);

		const second = mountExplore();
		ExploreStore.resetSignal.value++;
		await nextTick();
		expect(reset).toHaveBeenCalledTimes(2);
		expect(watcherCallback).toHaveBeenCalledTimes(2);
		second.unmount();
	});
});
