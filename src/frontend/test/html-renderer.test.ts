// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';

import { Loadable } from '@/shared/utils/loadable/loadable-core';

import HtmlRenderer from '@/shared/ui/HtmlRenderer.vue';

async function settleContentRender() {
	await nextTick();
	await nextTick();
}

describe('HtmlRenderer', () => {
	test('renders loaded strings as text by default', async () => {
		const wrapper = mount(HtmlRenderer, {
			props: { content: Loadable.Loaded('<p class="probe">Rendered content</p>') },
		});

		await settleContentRender();

		expect(wrapper.find('.probe').exists()).toBe(false);
		expect(wrapper.text()).toContain('<p class="probe">Rendered content</p>');
	});

	test('parses loaded strings as HTML when enabled', async () => {
		const wrapper = mount(HtmlRenderer, {
			props: { content: Loadable.Loaded('<p class="probe">Rendered content</p>'), parseStringAsHtml: true },
		});

		await settleContentRender();

		expect(wrapper.find('.probe').text()).toBe('Rendered content');
	});

	test('renders bare HTML elements', async () => {
		const element = document.createElement('section');
		element.className = 'probe';
		element.textContent = 'Rendered element';

		const wrapper = mount(HtmlRenderer, {
			props: { content: element },
		});

		await settleContentRender();

		expect(wrapper.find('.probe').text()).toBe('Rendered element');
	});

	test('renders bare null and undefined as empty content', async () => {
		const wrapper = mount(HtmlRenderer, {
			props: { content: null },
		});

		await settleContentRender();
		expect(wrapper.text()).toBe('');

		await wrapper.setProps({ content: undefined });
		await settleContentRender();
		expect(wrapper.text()).toBe('');
	});

	test('does not activate script elements by default', async () => {
		const createElement = vi.spyOn(document, 'createElement');

		mount(HtmlRenderer, {
			props: {
				content: Loadable.Loaded('<p>Before</p><script>window.__serverRenderedContentProbe = true;</script>'),
				parseStringAsHtml: true,
			},
		});

		await settleContentRender();

		expect(createElement.mock.calls.filter(([tagName]) => tagName === 'script')).toHaveLength(0);

		createElement.mockRestore();
	});

	test('activates script elements when explicitly enabled', async () => {
		const createElement = vi.spyOn(document, 'createElement');

		mount(HtmlRenderer, {
			props: {
				content: Loadable.Loaded('<p>Before</p><script data-probe="yes">window.__serverRenderedContentProbe = true;</script>'),
				executeScripts: true,
				parseStringAsHtml: true,
			},
		});

		await settleContentRender();

		const scriptCalls = createElement.mock.calls.filter(([tagName]) => tagName === 'script');
		expect(scriptCalls).toHaveLength(1);

		createElement.mockRestore();
	});
});
