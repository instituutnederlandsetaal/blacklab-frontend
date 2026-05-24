// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { describe, expect, test } from 'vitest';

import { useI18n, useI18nManager } from '@/shared/i18n';

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

describe('mock i18n installation', () => {
	test('installs a translate facade for useI18n', () => {
		const wrapper = mount(TranslateProbe);
		expect(wrapper.get('[data-testid="translate-probe"]').text()).toBe('Cancel');
	});

	test('does not install an i18n manager', () => {
		expect(() => mount(ManagerProbe)).toThrow(/i18nManager not provided/i);
	});
});