// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { customCssChangedEvent } from '@/interop/page-customization';

import Navbar from '@/components/Navbar.vue';

const mock = vi.hoisted(() => ({
	config: { value: { bannerMessage: '', displayName: '', navbarLinks: [] } },
	corpus: { value: undefined },
	corpusId: { value: undefined },
	removeAfterEach: vi.fn(),
}));

vi.mock('vue-router', () => ({
	useRouter: () => ({
		afterEach: () => mock.removeAfterEach,
		options: { history: { base: '/' } },
	}),
}));
vi.mock('@/app/state/useCorpusContext', () => ({ useCfPageConfig: () => mock.config, useCorpus: () => mock.corpus }));
vi.mock('@/navigation/page-context', () => ({ useCorpusId: () => mock.corpusId }));
vi.mock('@/shared/utils/localstore', () => ({ localStorageSynced: () => ({ value: '' }) }));
vi.mock('@/shared/auth/LoginButton.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/shared/i18n/LocaleSelector.vue', () => ({ default: { template: '<span />' } }));

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

beforeEach(() => {
	ControlledImage.instances = [];
	mock.removeAfterEach.mockReset();
	vi.stubGlobal('Image', ControlledImage);
});

afterEach(() => {
	document.body.className = '';
	document.body.style.removeProperty('--navbar-logo-body-offset');
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

test('suppresses resolved logo writes after reconfiguration and unmount', async () => {
	let logoUrl = 'first.png';
	const nativeGetComputedStyle = window.getComputedStyle;
	vi.spyOn(window, 'getComputedStyle').mockImplementation(element =>
		(element as HTMLElement).classList.contains('navbar-logo')
			? ({ backgroundImage: `url("${logoUrl}")`, backgroundSize: 'contain', height: 'auto', width: 'auto' } as CSSStyleDeclaration)
			: nativeGetComputedStyle.call(window, element),
	);
	const wrapper = mount(Navbar, {
		attachTo: document.body,
		global: { mocks: { $route: { name: 'corpora' } }, stubs: { RouterLink: { template: '<a><slot /></a>' } } },
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
