// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ref, watch, type Ref } from 'vue';

import { createPageBootstrapContext } from '@/navigation/page-bootstrap';
import { provideCorpusId } from '@/navigation/page-context';

import { CancelableRequest } from '@/shared/api/lib/api-types';

import AboutPage from '@/pages/about/AboutPage.vue';
import HelpPage from '@/pages/help/HelpPage.vue';
import HtmlRenderer from '@/shared/ui/HtmlRenderer.vue';
import Spinner from '@/shared/ui/Spinner.vue';

let api: ReturnType<typeof createMockApi>;
let corpusId: Ref<string | undefined>;
let pageBootstrap: ReturnType<typeof createPageBootstrapContext>;

function mountPage(Page: typeof AboutPage) {
	return mount(Page, { global: { plugins: [api, pageBootstrap, app => provideCorpusId(app, corpusId)] } });
}

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
	corpusId = ref('test-corpus');
	api = createMockApi();
	pageBootstrap = createPageBootstrapContext();
});

describe.each([
	['about', AboutPage, 'getAbout'],
	['help', HelpPage, 'getHelp'],
] as const)('%s page', (_name, Page, endpoint) => {
	test('renders loading and content before settling the page', async ({ onTestFinished }) => {
		const pending = deferredRequest();
		api.frontendApi[endpoint].mockReturnValue(pending.request);
		const wrapper = mountPage(Page);
		const contentWhenReady: string[] = [];
		onTestFinished(watch(pageBootstrap.scriptsReady, () => contentWhenReady.push(wrapper.text()), { flush: 'sync' }));

		expect(api.frontendApi[endpoint]).toHaveBeenCalledWith('test-corpus');
		expect(wrapper.getComponent(HtmlRenderer).props()).toMatchObject({ executeScripts: true, parseStringAsHtml: true });
		expect(wrapper.findComponent(Spinner).exists()).toBe(true);
		expect(pageBootstrap.scriptsReady.value).toBe(false);

		pending.resolve('<p class="page-copy">Ready</p>');
		await flushPromises();

		expect(wrapper.get('.page-copy').text()).toBe('Ready');
		expect(contentWhenReady).toEqual(['Ready']);
		expect(pageBootstrap.scriptsReady.value).toBe(true);
		wrapper.unmount();
	});

	test('renders errors and settles', async ({ onTestFinished }) => {
		const pending = deferredRequest();
		api.frontendApi[endpoint].mockReturnValue(pending.request);
		const wrapper = mountPage(Page);
		const contentWhenReady: string[] = [];
		onTestFinished(watch(pageBootstrap.scriptsReady, () => contentWhenReady.push(wrapper.text()), { flush: 'sync' }));

		pending.reject(new Error('Could not load page.'));
		await flushPromises();

		expect(wrapper.get('.text-danger').text()).toBe('Could not load page.');
		expect(contentWhenReady).toEqual(['Could not load page.']);
		expect(pageBootstrap.scriptsReady.value).toBe(true);
		wrapper.unmount();
	});

	test('cancels a pending request on unmount', () => {
		const pending = deferredRequest();
		api.frontendApi[endpoint].mockReturnValue(pending.request);
		const wrapper = mountPage(Page);

		wrapper.unmount();

		expect(pending.cancel).toHaveBeenCalledOnce();
	});

	test('does not run queued settlement after a route instance is unmounted', async () => {
		const obsoleteRequest = deferredRequest();
		const currentRequest = deferredRequest();
		api.frontendApi[endpoint].mockReturnValueOnce(obsoleteRequest.request).mockReturnValueOnce(currentRequest.request);
		const obsolete = mountPage(Page);

		obsoleteRequest.resolve('<p class="obsolete">Obsolete</p>');
		await Promise.resolve();
		obsolete.unmount();
		corpusId.value = 'current-corpus';
		const current = mountPage(Page);
		await flushPromises();

		expect(pageBootstrap.scriptsReady.value).toBe(false);
		expect(api.frontendApi[endpoint]).toHaveBeenLastCalledWith('current-corpus');
		current.unmount();
	});
});

test('snapshots the corpus and keeps the two endpoint lifecycles independent', () => {
	const aboutRequest = deferredRequest();
	const helpRequest = deferredRequest();
	api.frontendApi.getAbout.mockReturnValue(aboutRequest.request);
	api.frontendApi.getHelp.mockReturnValue(helpRequest.request);

	corpusId.value = 'first-corpus';
	const about = mountPage(AboutPage);
	corpusId.value = 'second-corpus';
	const help = mountPage(HelpPage);

	expect(api.frontendApi.getAbout).toHaveBeenCalledWith('first-corpus');
	expect(api.frontendApi.getHelp).toHaveBeenCalledWith('second-corpus');
	about.unmount();
	expect(aboutRequest.cancel).toHaveBeenCalledOnce();
	expect(helpRequest.cancel).not.toHaveBeenCalled();
	help.unmount();
	expect(helpRequest.cancel).toHaveBeenCalledOnce();
});
