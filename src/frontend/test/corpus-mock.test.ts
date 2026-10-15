// @vitest-environment jsdom

import { createMockCorpusContext } from '@test/mocks/corpus';
import { mount } from '@vue/test-utils';
import { expect, test, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue';

import { defaultConfig, useCfPageConfig, useCorpus, useCorpusContextLoader, type CorpusContext } from '@/app/state/useCorpusContext';
import type { Corpus } from '@/types/apptypes';

import { ApiError } from '@/shared/api/lib/api-types';
import { Loadable, type Loadable as LoadableType } from '@/shared/utils/loadable/loadable-core';
import { loadableReactiveFromSnapshot } from '@/shared/utils/loadable/loadable-reactive';

test('mounted corpus clients keep loading state, configuration and retries independent', async () => {
	const loaded = (id: string, bannerMessage: string): CorpusContext => ({
		index: { id } as Corpus,
		config: { ...structuredClone(defaultConfig), bannerMessage },
		tagset: undefined,
	});
	const snapshot = shallowRef<LoadableType<CorpusContext>>(Loadable.Loaded(loaded('alpha', 'First banner')));
	const retry = vi.fn();
	const first = createMockCorpusContext({ loader: loadableReactiveFromSnapshot(snapshot, { retry }) });
	const second = createMockCorpusContext({
		corpus: shallowRef({ id: 'other' } as Corpus),
		config: ref({ bannerMessage: 'Other banner' }),
	});
	const Client = defineComponent({
		setup() {
			const corpus = useCorpus({ IAcknowledgeItCanBeUndefined: true });
			const config = useCfPageConfig();
			const loader = useCorpusContextLoader();
			return () =>
				h('section', [
					h('p', { class: 'status' }, loader.isLoaded() ? `Loaded ${loader.value.index?.id}` : loader.isLoading() ? 'Loading' : loader.error?.message),
					h('h2', corpus.value?.id ?? 'No corpus'),
					h('p', { class: 'banner' }, config.value.bannerMessage ?? 'No banner'),
					h('button', { onClick: () => loader.retry() }, 'Retry'),
				]);
		},
	});
	const firstClient = mount(Client, { global: { plugins: [first] } });
	const secondClient = mount(Client, { global: { plugins: [second] } });
	expect(firstClient.get('.status').text()).toBe('Loaded alpha');
	expect(firstClient.get('h2').text()).toBe('alpha');
	expect(firstClient.get('.banner').text()).toBe('First banner');
	expect(secondClient.get('.status').text()).toBe('Loaded other');
	expect(secondClient.get('h2').text()).toBe('other');
	expect(secondClient.get('.banner').text()).toBe('Other banner');
	const otherContents = secondClient.html();

	snapshot.value = Loadable.Loading();
	await nextTick();
	expect(firstClient.get('.status').text()).toBe('Loading');
	expect(firstClient.get('h2').text()).toBe('No corpus');
	expect(firstClient.get('.banner').text()).toBe('No banner');
	expect(secondClient.html()).toBe(otherContents);

	snapshot.value = Loadable.LoadingError(new ApiError('Unavailable', 'Offline', '', undefined));
	await nextTick();
	expect(firstClient.get('.status').text()).toBe('Offline');
	expect(firstClient.get('h2').text()).toBe('No corpus');
	expect(firstClient.get('.banner').text()).toBe('No banner');
	await firstClient.get('button').trigger('click');
	expect(retry).toHaveBeenCalledOnce();
	expect(second.contextLoader.retry).not.toHaveBeenCalled();
	expect(secondClient.html()).toBe(otherContents);

	snapshot.value = Loadable.Loaded(loaded('beta', 'Replacement banner'));
	await nextTick();
	expect(firstClient.get('.status').text()).toBe('Loaded beta');
	expect(firstClient.get('h2').text()).toBe('beta');
	expect(firstClient.get('.banner').text()).toBe('Replacement banner');
	expect(secondClient.html()).toBe(otherContents);
	await secondClient.get('button').trigger('click');
	expect(second.contextLoader.retry).toHaveBeenCalledOnce();
	expect(retry).toHaveBeenCalledOnce();
});
