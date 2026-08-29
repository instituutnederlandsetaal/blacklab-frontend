// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { CancelableRequest } from '@/shared/api/lib/api-types';
import type { LoadableFromStream } from '@/shared/utils/loadable/loadable-stream';

import AboutPage from '@/pages/about/AboutPage.vue';
import HelpPage from '@/pages/help/HelpPage.vue';
import HtmlRenderer from '@/shared/ui/HtmlRenderer.vue';

const mock = vi.hoisted(() => ({
	corpusId: { value: 'test-corpus' },
	getAbout: vi.fn(),
	getHelp: vi.fn(),
	markSettled: vi.fn(),
}));

vi.mock('@/navigation/page-bootstrap', () => ({ usePageBootstrap: () => ({ markSettled: mock.markSettled }) }));
vi.mock('@/navigation/page-context', () => ({ useCorpusId: () => mock.corpusId }));
vi.mock('@/shared/api', () => ({ useFrontendApi: () => ({ getAbout: mock.getAbout, getHelp: mock.getHelp }) }));

function deferredRequest() {
	let resolve!: (value: string) => void;
	let reject!: (error: unknown) => void;
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
	mock.corpusId.value = 'test-corpus';
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
		expect(wrapper.getComponent(HtmlRenderer).props()).toMatchObject({ executeScripts: true, parseStringAsHtml: true });
		expect(content.isLoading()).toBe(true);
		expect(wrapper.find('.cf-spinner').exists()).toBe(true);
		expect(mock.markSettled).not.toHaveBeenCalled();

		pending.resolve('<p class="page-copy">Ready</p>');
		mock.markSettled.mockImplementationOnce(() => {
			expect(wrapper.get('.page-copy').text()).toBe('Ready');
		});
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

		mock.markSettled.mockImplementationOnce(() => {
			expect(wrapper.get('.text-danger').text()).toBe('Could not load page.');
		});
		pending.reject(new Error('Could not load page.'));
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

	test('does not run queued settlement after a route instance is unmounted', async () => {
		const obsoleteRequest = deferredRequest();
		const currentRequest = deferredRequest();
		mock[endpoint].mockReturnValueOnce(obsoleteRequest.request).mockReturnValueOnce(currentRequest.request);
		const obsolete = mount(Page);

		obsoleteRequest.resolve('<p class="obsolete">Obsolete</p>');
		await Promise.resolve();
		obsolete.unmount();
		mock.corpusId.value = 'current-corpus';
		const current = mount(Page);
		await flushPromises();

		expect(mock.markSettled).not.toHaveBeenCalled();
		expect(mock[endpoint]).toHaveBeenLastCalledWith('current-corpus');
		current.unmount();
	});
});

test('snapshots the corpus and keeps the two endpoint lifecycles independent', () => {
	const aboutRequest = deferredRequest();
	const helpRequest = deferredRequest();
	mock.getAbout.mockReturnValue(aboutRequest.request);
	mock.getHelp.mockReturnValue(helpRequest.request);

	mock.corpusId.value = 'first-corpus';
	const about = mount(AboutPage);
	mock.corpusId.value = 'second-corpus';
	const help = mount(HelpPage);

	expect(mock.getAbout).toHaveBeenCalledWith('first-corpus');
	expect(mock.getHelp).toHaveBeenCalledWith('second-corpus');
	about.unmount();
	expect(aboutRequest.cancel).toHaveBeenCalledOnce();
	expect(helpRequest.cancel).not.toHaveBeenCalled();
	help.unmount();
	expect(helpRequest.cancel).toHaveBeenCalledOnce();
});
