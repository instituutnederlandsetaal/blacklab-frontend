// @vitest-environment jsdom

import { createMockCorpusContext } from '@test/mocks/corpus';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { customCssChangedEvent } from '@/interop/page-customization';
import { provideCorpusId } from '@/navigation/page-context';

import Navbar from '@/components/Navbar.vue';

class ControlledImage extends EventTarget {
	static instances: ControlledImage[] = [];
	naturalWidth = 120;
	naturalHeight = 60;
	src = '';

	constructor() {
		super();
		ControlledImage.instances.push(this);
	}
}

let savedBanner: string | null;
let savedBodyClass: string;
let savedBodyStyle: string | null;

beforeEach(() => {
	ControlledImage.instances = [];
	savedBanner = localStorage.getItem('cf/banner-hidden');
	savedBodyClass = document.body.className;
	savedBodyStyle = document.body.getAttribute('style');
	localStorage.removeItem('cf/banner-hidden');
	vi.stubGlobal('Image', ControlledImage);
});

afterEach(() => {
	if (savedBanner === null) localStorage.removeItem('cf/banner-hidden');
	else localStorage.setItem('cf/banner-hidden', savedBanner);
	document.body.className = savedBodyClass;
	if (savedBodyStyle === null) document.body.removeAttribute('style');
	else document.body.setAttribute('style', savedBodyStyle);
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

test('suppresses resolved logo writes after reconfiguration and unmount', async () => {
	const router = createRouter({ history: createMemoryHistory(), routes: [{ name: 'corpora', path: '/', component: { template: '<div />' } }] });
	await router.push('/');
	await router.isReady();
	let logoUrl = 'first.png';
	const nativeGetComputedStyle = window.getComputedStyle;
	vi.spyOn(window, 'getComputedStyle').mockImplementation(element =>
		(element as HTMLElement).classList.contains('navbar-logo')
			? ({ backgroundImage: `url("${logoUrl}")`, backgroundSize: 'contain', height: 'auto', width: 'auto' } as CSSStyleDeclaration)
			: nativeGetComputedStyle.call(window, element),
	);
	const wrapper = mount(Navbar, {
		attachTo: document.body,
		global: {
			plugins: [router, createMockCorpusContext(), app => provideCorpusId(app, ref(undefined))],
			stubs: { LoginButton: true, LocaleSelector: true },
		},
	});
	const navbar = wrapper.get('.navbar-inverse').element as HTMLElement;
	expect(ControlledImage.instances).toHaveLength(1);

	ControlledImage.instances[0].dispatchEvent(new Event('load'));
	logoUrl = 'second.png';
	window.dispatchEvent(new Event(customCssChangedEvent));
	await flushPromises();
	expect(ControlledImage.instances).toHaveLength(2);
	expect(navbar.classList.contains('navbar-has-logo')).toBe(false);

	ControlledImage.instances[1].dispatchEvent(new Event('load'));
	await flushPromises();
	expect(navbar.classList.contains('navbar-has-logo')).toBe(true);
	expect(navbar.style.getPropertyValue('--navbar-logo-effective-width')).toBe('120px');

	logoUrl = 'third.png';
	window.dispatchEvent(new Event(customCssChangedEvent));
	ControlledImage.instances[2].dispatchEvent(new Event('load'));
	wrapper.unmount();
	await flushPromises();

	expect(navbar.classList.contains('navbar-has-logo')).toBe(false);
	expect(navbar.style.getPropertyValue('--navbar-logo-effective-width')).toBe('');
	expect(document.body.style.getPropertyValue('--navbar-logo-body-offset')).toBe('');
});
