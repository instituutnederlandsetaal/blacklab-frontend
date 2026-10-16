// @vitest-environment jsdom

import { createMockI18n } from '@test/mocks/i18n';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, effectScope, h, nextTick } from 'vue';

import { createI18n, useI18n, useI18nManager } from '@/shared/i18n';
import { I18nManager } from '@/shared/i18n/i18n-manager';

const RAW_STATIC_EN_US_BUNDLE = `{
	// Static installs accept the same commented JSON shape as runtime locale files.
	"common": {
		"cancel": "Cancel from static bundle"
	}
}`;

const TranslateProbe = defineComponent({
	setup() {
		const i18n = useI18n();
		return () => h('div', { 'data-testid': 'translate-probe' }, i18n.$td('common.cancel', 'Cancel'));
	},
});

const ManagerProbe = defineComponent({
	setup() {
		useI18nManager();
		return () => h('div');
	},
});

const TemplateProbe = defineComponent({
	template: `
		<div>
			<span data-testid="template-t">{{ $t('common.cancel') }}</span>
			<span data-testid="template-te">{{ $te('common.cancel') ? 'known' : 'missing' }}</span>
			<i18n-t data-testid="i18n-t" keypath="common.cancel" tag="span" scope="global" />
		</div>
	`,
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

test('refreshes active and fallback translations when the corpus changes without changing locale', async () => {
	vi.useFakeTimers();
	vi.stubGlobal('CONTEXT_URL', '/blacklab-frontend');
	vi.stubGlobal('i18n', undefined);
	vi.stubGlobal('fetch', async (url: string) => {
		const corpus = url.includes('/first/') ? 'First' : 'Second';
		const messages = url.endsWith('/nl-nl.json') ? { current: `${corpus} active` } : { fallback: `${corpus} fallback` };
		return new Response(JSON.stringify({ test: messages }));
	});
	const scope = effectScope();
	const i18n = scope.run(() => createI18n('first'))!;
	const Probe = defineComponent({
		setup() {
			const { $t } = useI18n();
			return () => h('div', `${$t('test.current')} / ${$t('test.fallback')}`);
		},
	});
	const wrapper = mount(Probe, { global: { plugins: [i18n] } });
	try {
		await i18n.setLocale('nl-nl');
		await i18n.setFallbackLocale('en-us');
		await nextTick();
		expect(wrapper.text()).toBe('First active / First fallback');

		await i18n.setIndexId('second');
		await nextTick();
		expect(wrapper.text()).toBe('Second active / Second fallback');
	} finally {
		wrapper.unmount();
		scope.stop();
	}
});

test('sets the fallback locale without replacing the active locale', async () => {
	vi.useFakeTimers();
	vi.spyOn(I18nManager as any, 'loadLocaleMessages').mockResolvedValue({ common: {} });
	const manager = new I18nManager();
	manager.registerLocale('en-us', 'English');

	await manager.setFallbackLocale('en-us');

	expect(manager.getFallbackLocale()).toBe('en-us');
	expect(manager.getLocale()).toBe('');
});

describe('mock i18n plugin', () => {
	test('provides a translate facade for useI18n', () => {
		const wrapper = mount(TranslateProbe);
		expect(wrapper.get('[data-testid="translate-probe"]').text()).toBe('Cancel');
	});

	test('installs vue-i18n globals and components for templates', () => {
		const wrapper = mount(TemplateProbe);

		expect(wrapper.get('[data-testid="template-t"]').text()).toBe('common.cancel');
		expect(wrapper.get('[data-testid="template-te"]').text()).toBe('missing');
		expect(wrapper.get('[data-testid="i18n-t"]').text()).toBe('common.cancel');
	});

	test('does not install an i18n manager', () => {
		expect(() => mount(ManagerProbe)).throws();
	});
});

describe('mock i18n plugin with bundles', () => {
	const createBundledMockI18n = () =>
		createMockI18n({
			locale: 'en-us',
			fallbackLocale: 'en-us',
			bundles: {
				'en-us': RAW_STATIC_EN_US_BUNDLE,
			},
		});

	test('provides a translate facade from raw locale bundles', () => {
		const wrapper = mount(TranslateProbe, {
			global: {
				plugins: [createBundledMockI18n()],
			},
		});

		expect(wrapper.get('[data-testid="translate-probe"]').text()).toBe('Cancel from static bundle');
	});

	test('installs vue-i18n globals and components for templates', () => {
		const wrapper = mount(TemplateProbe, {
			global: {
				plugins: [createBundledMockI18n()],
			},
		});

		expect(wrapper.get('[data-testid="template-t"]').text()).toBe('Cancel from static bundle');
		expect(wrapper.get('[data-testid="template-te"]').text()).toBe('known');
		expect(wrapper.get('[data-testid="i18n-t"]').text()).toBe('Cancel from static bundle');
	});
});
