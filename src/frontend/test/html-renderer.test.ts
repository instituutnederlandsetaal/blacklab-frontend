// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';

import { ApiError } from '@/shared/api/lib/api-types';
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
		const events: string[] = [];
		const wrapper = mount(HtmlRenderer, {
			props: {
				content: Loadable.Loading(),
				parseStringAsHtml: true,
				onReady: () => {
					expect(wrapper.get('.probe').text()).toBe('Rendered content');
					events.push('ready');
				},
				onSettled: () => {
					expect(wrapper.get('.probe').text()).toBe('Rendered content');
					events.push('settled');
				},
			},
		});

		expect(events).toEqual([]);
		await wrapper.setProps({ content: Loadable.Loaded('<p class="probe">Rendered content</p>') });
		await settleContentRender();

		expect(wrapper.find('.probe').text()).toBe('Rendered content');
		expect(events).toEqual(['ready', 'settled']);
		expect(wrapper.emitted('ready')).toHaveLength(1);
		expect(wrapper.emitted('settled')).toHaveLength(1);
	});

	test('settles errors after their live DOM is rendered without emitting ready', async () => {
		const ready = vi.fn();
		const settled = vi.fn();
		const wrapper = mount(HtmlRenderer, {
			props: { content: Loadable.Loading(), onReady: ready, onSettled: settled },
		});

		await wrapper.setProps({ content: Loadable.LoadingError(new ApiError('Error', 'Could not render', 'Error', 500)) });
		await settleContentRender();

		expect(wrapper.get('.text-danger').text()).toBe('Could not render');
		expect(ready).not.toHaveBeenCalled();
		expect(settled).toHaveBeenCalledOnce();
		expect(wrapper.emitted('ready')).toBeUndefined();
		expect(wrapper.emitted('settled')).toHaveLength(1);
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
		const wrapper = mount(HtmlRenderer, {
			props: {
				content: Loadable.Loaded('<p>Before</p><script>window.__serverRenderedContentProbe = true;</script>'),
				parseStringAsHtml: true,
			},
		});

		await settleContentRender();

		expect(wrapper.get('script').text()).toContain('__serverRenderedContentProbe');
	});

	test('activates script elements when explicitly enabled', async () => {
		const wrapper = mount(HtmlRenderer, {
			props: {
				content: Loadable.Loaded('<p>Before</p><script data-probe="yes">window.__serverRenderedContentProbe = true;</script>'),
				executeScripts: true,
				parseStringAsHtml: true,
			},
		});

		await settleContentRender();

		const script = wrapper.get('script[data-probe="yes"]');
		expect(script.attributes('data-probe')).toBe('yes');
		expect(script.text()).toContain('__serverRenderedContentProbe');
	});
});
