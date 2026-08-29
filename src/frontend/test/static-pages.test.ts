// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';
import type { LoadableFromStream } from '@/shared/utils/loadable/loadable-stream';

import AboutPage from '@/pages/about/AboutPage.vue';
import HelpPage from '@/pages/help/HelpPage.vue';
import HtmlRenderer from '@/shared/ui/HtmlRenderer.vue';

const mock = vi.hoisted(() => ({
	getAbout: vi.fn(),
	getHelp: vi.fn(),
	markSettled: vi.fn(),
}));

vi.mock('@/navigation/page-bootstrap', () => ({ usePageBootstrap: () => ({ markSettled: mock.markSettled }) }));
vi.mock('@/navigation/page-context', () => ({ useCorpusId: () => ({ value: 'test-corpus' }) }));
vi.mock('@/shared/api', () => ({ useFrontendApi: () => ({ getAbout: mock.getAbout, getHelp: mock.getHelp }) }));

function deferredRequest() {
	let resolve!: (value: string) => void;
	let reject!: (error: ApiError) => void;
	const cancel = vi.fn();
	const request = new CancelableRequest(
		new Promise<string>((resolvePromise, rejectPromise) => {
			resolve = resolvePromise;
			reject = rejectPromise;
		}),
		cancel,
	);
	return { cancel, reject, request, resolve };
}

beforeEach(() => {
	mock.getAbout.mockReset();
	mock.getHelp.mockReset();
	mock.markSettled.mockReset();
});

describe.each([
	['about', AboutPage, 'getAbout'],
	['help', HelpPage, 'getHelp'],
] as const)('%s page', (_name, Page, endpoint) => {
	test('keeps one loadable identity through loading and success', async () => {
		const pending = deferredRequest();
		mock[endpoint].mockReturnValue(pending.request);
		const wrapper = mount(Page);
		const content = wrapper.getComponent(HtmlRenderer).props('content') as LoadableFromStream<string>;

		expect(mock[endpoint]).toHaveBeenCalledWith('test-corpus');
		expect(content.isLoading()).toBe(true);
		expect(wrapper.find('.cf-spinner').exists()).toBe(true);
		expect(mock.markSettled).not.toHaveBeenCalled();

		pending.resolve('<p class="page-copy">Ready</p>');
		await flushPromises();

		expect(wrapper.getComponent(HtmlRenderer).props('content')).toBe(content);
		expect(content.isLoaded()).toBe(true);
		expect(wrapper.get('.page-copy').text()).toBe('Ready');
		expect(mock.markSettled).toHaveBeenCalledOnce();
		wrapper.unmount();
	});

	test('renders errors and settles', async () => {
		const pending = deferredRequest();
		mock[endpoint].mockReturnValue(pending.request);
		const wrapper = mount(Page);

		pending.reject(new ApiError('Failure', 'Could not load page.', 'Server Error', 500));
		await flushPromises();

		expect(wrapper.get('.text-danger').text()).toBe('Could not load page.');
		expect(mock.markSettled).toHaveBeenCalledOnce();
		wrapper.unmount();
	});

	test('cancels a pending request on unmount', () => {
		const pending = deferredRequest();
		mock[endpoint].mockReturnValue(pending.request);
		const wrapper = mount(Page);

		wrapper.unmount();

		expect(pending.cancel).toHaveBeenCalledOnce();
	});
});
