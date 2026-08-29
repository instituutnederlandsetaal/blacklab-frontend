// @vitest-environment jsdom

import { flushPromises, mount, RouterLinkStub, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, ref, type Ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import type { NormalizedIndex, NormalizedIndexBase } from '@/types/apptypes';

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

beforeEach(() => {
	mock.getCorpora.mockReset();
	mock.getCorpus.mockReset();
	mock.corpus = ref({ id: 'multi' } as NormalizedIndex);
});

describe('CorpusPicker', () => {
	test('retries after an error and links to the selected corpus tagset builder', async () => {
		mock.getCorpora.mockRejectedValueOnce(new Error('Could not load corpora')).mockResolvedValueOnce([{ id: 'multi' } satisfies Partial<NormalizedIndexBase>]);
		const wrapper = mount(CorpusPicker, { global: { stubs: { RouterLink: RouterLinkStub } } });

		await flushPromises();
		expect(wrapper.text()).toContain('Could not load corpora');

		await wrapper.get('button').trigger('click');
		await flushPromises();
		expect(wrapper.text()).not.toContain('Could not load corpora');
		expect(wrapper.getComponent(RouterLinkStub).props('to')).toEqual({ name: 'tagset builder', params: { corpus: 'multi' } });
		expect(mock.getCorpora).toHaveBeenCalledTimes(2);
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
