// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { flushPromises, mount } from '@vue/test-utils';
import { expect, test, vi } from 'vitest';
import { watch } from 'vue';
import { RouterView } from 'vue-router';

import { createPageBootstrapContext } from '@/app/router/page-bootstrap';
import { createBlfRouter } from '@/app/router/router';

import { CancelableRequest } from '@/shared/api/lib/api-types';

import InfoPage from '@/pages/info/InfoPage.vue';
import HtmlRenderer from '@/shared/ui/HtmlRenderer.vue';
import Spinner from '@/shared/ui/Spinner.vue';

function deferredRequest() {
	const { promise, resolve, reject } = Promise.withResolvers<string>();
	const cancel = vi.fn();
	return { request: new CancelableRequest(promise, cancel), resolve, reject, cancel };
}

test.for(['content', 'error'] as const)('renders %s before allowing page scripts to run', async (outcome, { onTestFinished }) => {
	const pending = deferredRequest();
	const api = createMockApi({ frontend: { getHelp: () => pending.request } });
	const bootstrap = createPageBootstrapContext();
	const wrapper = mount(InfoPage, { props: { endpoint: 'getHelp' }, global: { plugins: [api, bootstrap] } });
	onTestFinished(() => wrapper.unmount());

	const contentWhenReady: string[] = [];
	onTestFinished(watch(bootstrap.scriptsReady, () => contentWhenReady.push(wrapper.text()), { flush: 'sync' }));
	expect(wrapper.getComponent(HtmlRenderer).props()).toMatchObject({ executeScripts: true, parseStringAsHtml: true });
	expect(wrapper.findComponent(Spinner).exists()).toBe(true);
	expect(bootstrap.scriptsReady.value).toBe(false);

	if (outcome === 'content') pending.resolve('<p class="page-copy">Ready</p>');
	else pending.reject(new Error('Could not load page.'));
	await flushPromises();

	const rendered = outcome === 'content' ? wrapper.get('.page-copy') : wrapper.get('.text-danger');
	expect(rendered.text()).toBe(outcome === 'content' ? 'Ready' : 'Could not load page.');
	expect(contentWhenReady).toEqual([rendered.text()]);
});

test('follows Help and About navigation and discards obsolete responses', async ({ onTestFinished }) => {
	const globalHelp = deferredRequest();
	const api = createMockApi({ frontend: { getAbout: '<p>About</p>', getHelp: '<p>Help</p>' } });
	api.frontendApi.getHelp.mockReturnValueOnce(globalHelp.request);
	const bootstrap = createPageBootstrapContext();
	vi.stubGlobal('CONTEXT_URL', '/');
	onTestFinished(() => {
		vi.unstubAllGlobals();
	});
	const { router } = createBlfRouter(bootstrap);
	onTestFinished(() => router.options.history.destroy());

	await router.push('/help');
	const wrapper = mount(RouterView, { global: { plugins: [router, api, bootstrap], stubs: { CorpusRouteLayout: { template: '<router-view />' } } } });
	onTestFinished(() => wrapper.unmount());
	expect(api.frontendApi.getHelp).toHaveBeenCalledWith(undefined);

	await router.push('/about');
	await flushPromises();
	expect(api.frontendApi.getAbout).toHaveBeenCalledWith(undefined);
	expect(globalHelp.cancel).toHaveBeenCalledOnce();
	globalHelp.resolve('<p>Obsolete Help</p>');
	await flushPromises();
	expect(wrapper.text()).toBe('About');

	await router.push('/alpha/about');
	await flushPromises();
	expect(api.frontendApi.getAbout).toHaveBeenLastCalledWith('alpha');
	await router.push('/alpha/help');
	await flushPromises();
	expect(api.frontendApi.getHelp).toHaveBeenLastCalledWith('alpha');
	expect(wrapper.text()).toBe('Help');

	await router.push('/beta/help');
	await flushPromises();
	expect(api.frontendApi.getHelp).toHaveBeenLastCalledWith('beta');
});

test('unmount cancels a pending request and its late response cannot enable scripts', async () => {
	const pending = deferredRequest();
	const api = createMockApi({ frontend: { getAbout: () => pending.request } });
	const bootstrap = createPageBootstrapContext();
	const wrapper = mount(InfoPage, { props: { endpoint: 'getAbout', corpusId: 'alpha' }, global: { plugins: [api, bootstrap] } });

	wrapper.unmount();
	pending.resolve('<p>Obsolete</p>');
	await flushPromises();

	expect(pending.cancel).toHaveBeenCalledOnce();
	expect(bootstrap.scriptsReady.value).toBe(false);
});
