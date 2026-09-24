// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, test } from 'vitest';
import { defineComponent, h, ref, shallowRef } from 'vue';

import { isInitialPageReady } from '@/app/entrypoint/initial-readiness';
import { createInitialLoading } from '@/navigation/initial-loading';

import { ApiError } from '@/shared/api/lib/api-types';
import { Loadable, type Loadable as LoadableType } from '@/shared/utils/loadable/loadable-core';

const Page = defineComponent({
	setup: () => () => h('div', 'Page'),
});
const searchRoute = { name: 'search', matched: [{}], params: { corpus: 'OFR' } };

afterEach(() => {
	document.body.replaceChildren();
	document.body.classList.remove('startup-pending');
});

test('keeps search inert until the context, page, and initial URL restoration are ready', async () => {
	document.body.innerHTML = '<div id="startup-status"></div><div id="vue-root" inert><div id="app"></div></div>';
	document.body.classList.add('startup-pending');
	const context = shallowRef<LoadableType<{ index?: object }>>(Loadable.Loading());
	const contentReady = ref(false);
	const searchReadSettled = ref(false);
	const wrapper = mount(Page, {
		attachTo: '#app',
		global: { plugins: [createInitialLoading(() => isInitialPageReady(searchRoute, context.value, contentReady.value, searchReadSettled.value))] },
	});

	await flushPromises();
	expect(document.getElementById('startup-status')).not.toBeNull();
	expect(document.getElementById('vue-root')?.hasAttribute('inert')).toBe(true);
	expect(document.body.classList.contains('startup-pending')).toBe(true);

	contentReady.value = true;
	await flushPromises();
	expect(document.getElementById('startup-status')).not.toBeNull();

	context.value = Loadable.Loaded({ index: {} });
	await flushPromises();
	expect(document.getElementById('startup-status')).not.toBeNull();
	expect(document.getElementById('vue-root')?.hasAttribute('inert')).toBe(true);

	searchReadSettled.value = true;
	await flushPromises();
	expect(document.getElementById('startup-status')).toBeNull();
	expect(document.getElementById('vue-root')?.hasAttribute('inert')).toBe(false);
	expect(document.body.classList.contains('startup-pending')).toBe(false);
	wrapper.unmount();
});

test('corpus error and missing-index views can appear while a global page still waits for content', () => {
	const context = Loadable.LoadingError<{ index?: object }>(new ApiError('CANNOT_OPEN_INDEX', 'Missing', 'Not Found', 404));
	const globalRoute = { name: 'corpora', matched: [{}], params: {} };

	expect(isInitialPageReady(searchRoute, context, false, false)).toBe(true);
	expect(isInitialPageReady(globalRoute, context, false, true)).toBe(false);
	expect(isInitialPageReady(globalRoute, context, true, true)).toBe(true);
	expect(isInitialPageReady(searchRoute, Loadable.Loaded({ index: undefined }), false, false)).toBe(true);
});

test('clears the initial screen after mount when the page is already ready', async () => {
	document.body.innerHTML = '<div id="startup-status"></div><div id="vue-root" inert><div id="app"></div></div>';
	const wrapper = mount(Page, {
		attachTo: '#app',
		global: { plugins: [createInitialLoading(true)] },
	});
	await flushPromises();
	expect(document.getElementById('startup-status')).toBeNull();
	wrapper.unmount();
});
