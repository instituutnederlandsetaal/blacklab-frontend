// @vitest-environment jsdom

import { createMockI18n } from '@test/mocks/i18n';
import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { defineComponent, h } from 'vue';

import { useI18n, useI18nManager } from '@/shared/i18n';

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
