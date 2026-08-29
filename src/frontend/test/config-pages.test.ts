// @vitest-environment jsdom

import { flushPromises, mount, RouterLinkStub, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, ref, type Ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import type { NormalizedIndex, NormalizedIndexBase } from '@/types/apptypes';

import { CancelableRequest } from '@/shared/api/lib/api-types';

import CorpusConfig from '@/pages/config/CorpusConfig.vue';
import CorpusPicker from '@/pages/config/CorpusPicker.vue';
import Interface from '@/pages/config/Interface.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

const mock = vi.hoisted(() => ({
	corpus: undefined as unknown as Ref<NormalizedIndex>,
	getCorpora: vi.fn(),
	getCorpus: vi.fn(),
}));

vi.mock('@/app/state/useCorpusContext', () => ({ useCorpus: () => mock.corpus }));
vi.mock('@/shared/api/index.ts', () => ({ useBlackLabApi: () => ({ getCorpora: mock.getCorpora, getCorpus: mock.getCorpus }) }));

function createDeferredRequest<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const cancel = vi.fn();
	return {
		request: new CancelableRequest(
			new Promise<T>((resolvePromise, rejectPromise) => {
				resolve = resolvePromise;
				reject = rejectPromise;
			}),
			cancel,
		),
		resolve,
		reject,
		cancel,
	};
}

function mountCorpusPicker() {
	return mount(CorpusPicker, {
		global: { mocks: { $t: (key: string) => key }, stubs: { RouterLink: RouterLinkStub } },
	});
}

beforeEach(() => {
	mock.getCorpora.mockReset();
	mock.getCorpus.mockReset();
	mock.corpus = ref({ id: 'multi' } as NormalizedIndex);
});

describe('CorpusPicker', () => {
	test('retries after an error and preserves API order in corpus links', async () => {
		const first = createDeferredRequest<NormalizedIndexBase[]>();
		const second = createDeferredRequest<NormalizedIndexBase[]>();
		mock.getCorpora.mockReturnValueOnce(first.request).mockReturnValueOnce(second.request);
		const wrapper = mountCorpusPicker();

		expect(wrapper.text()).toContain('remoteIndex.loadingCorpora');
		first.reject(new Error('Could not load corpora'));

		await flushPromises();
		expect(wrapper.text()).toContain('Could not load corpora');

		await wrapper.get('button').trigger('click');
		expect(wrapper.text()).toContain('remoteIndex.loadingCorpora');
		second.resolve([{ id: 'zeta' }, { id: 'alpha' }] as NormalizedIndexBase[]);
		await flushPromises();
		expect(wrapper.text()).not.toContain('Could not load corpora');
		expect(wrapper.findAllComponents(RouterLinkStub).map(link => link.props('to'))).toEqual([
			{ name: 'tagset builder', params: { corpus: 'zeta' } },
			{ name: 'tagset builder', params: { corpus: 'alpha' } },
		]);
		expect(mock.getCorpora).toHaveBeenCalledTimes(2);
	});

	test('cancels its pending request on unmount', async () => {
		const deferred = createDeferredRequest<NormalizedIndexBase[]>();
		mock.getCorpora.mockReturnValue(deferred.request);
		const wrapper = mountCorpusPicker();

		wrapper.unmount();
		expect(deferred.cancel).toHaveBeenCalledOnce();
		deferred.resolve([{ id: 'late' }] as NormalizedIndexBase[]);
		await flushPromises();
	});
});

describe('CorpusConfig', () => {
	test('uses the injected corpus, derives the active tab from the route, and does not refetch', async () => {
		const Child = defineComponent({
			props: { index: { type: Object, required: true } },
			template: '<div data-testid="child">{{ index.id }}</div>',
		});
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{
					path: '/:corpus/configwizard',
					component: CorpusConfig,
					children: [
						{ path: 'pos', name: 'tagset builder', component: Child },
						{ path: 'interface', name: 'interface', component: Child },
					],
				},
			],
		});
		await router.push('/multi/configwizard/interface');
		await router.isReady();
		const wrapper = mount(defineComponent({ template: '<router-view />' }), { global: { plugins: [router] } });

		expect(wrapper.get('[data-testid="child"]').text()).toBe('multi');
		expect(
			wrapper
				.findAll('li')
				.find(tab => tab.classes().includes('active'))
				?.text(),
		).toBe('interface');
		expect(wrapper.findAll('a').map(link => link.attributes('href'))).toEqual(['/multi/configwizard/pos', '/multi/configwizard/interface']);
		expect(mock.getCorpus).not.toHaveBeenCalled();
	});
});

describe('Interface', () => {
	test('offers forward-index annotations from every annotated field and switches tabs', async () => {
		const index = {
			id: 'multi',
			annotatedFields: {
				contents: {
					annotations: {
						word: { id: 'word', defaultDisplayName: 'Word', hasForwardIndex: true },
					},
				},
				translation: {
					annotations: {
						lemma: { id: 'lemma', defaultDisplayName: 'Lemma', hasForwardIndex: false },
					},
				},
			},
		} as unknown as NormalizedIndex;
		const wrapper = shallowMount(Interface, { props: { index } });

		expect(wrapper.getComponent(SelectPicker).props('options')).toMatchObject([
			{ value: 'lemma', disabled: true },
			{ value: 'word', disabled: false },
		]);
		expect(wrapper.get('.tab-pane').classes()).toContain('active');

		await wrapper.findAll('li')[1].trigger('click');
		expect(wrapper.findAll('li')[1].classes()).toContain('active');
		expect(wrapper.get('.tab-pane').classes()).not.toContain('active');
	});
});
