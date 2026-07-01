// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { defineComponent } from 'vue';

import { createDebugSystem } from '@/shared/debug/debug';

import Debug from '@/shared/debug/Debug.vue';

function mountDebug(template: string, enabled = true, setup?: () => Record<string, unknown>) {
	const debugSystem = createDebugSystem({ enabledByDefault: enabled, visible: true });
	if (enabled) debugSystem.enable();
	else debugSystem.disable();

	return mount(
		defineComponent({
			components: { Debug },
			setup,
			template,
		}),
		{
			global: {
				plugins: [debugSystem],
				stubs: {
					Debug: false,
					debug: false,
				},
			},
		},
	);
}

describe('Debug', () => {
	test('renders the slot without a wrapper when no is prop is provided', () => {
		const wrapper = mountDebug('<div data-testid="host"><Debug>alpha<span>beta</span></Debug></div>');

		const host = wrapper.get('[data-testid="host"]').element;
		expect(host.innerHTML).toBe('alpha<span>beta</span>');
	});

	test('renders the slot inside the requested dynamic component', () => {
		const wrapper = mountDebug('<div><Debug :is="\'section\'" class="debug-wrapper" data-testid="debug">content</Debug></div>');

		const debug = wrapper.get('[data-testid="debug"]');
		expect(debug.element.tagName).toBe('SECTION');
		expect(debug.classes()).toContain('debug-wrapper');
		expect(debug.text()).toBe('content');
	});

	test('passes attrs through to a custom dynamic component', () => {
		const Probe = defineComponent({
			props: {
				label: {
					type: String,
					required: true,
				},
			},
			template: '<aside data-testid="probe">{{ label }}:<slot /></aside>',
		});

		const wrapper = mountDebug('<div><Debug :is="Probe" label="wrapped">content</Debug></div>', true, () => ({ Probe }));

		expect(wrapper.get('[data-testid="probe"]').text()).toBe('wrapped:content');
	});

	test('passes an explicit null is prop through to Vue dynamic component rendering', () => {
		const wrapper = mountDebug('<div data-testid="host"><Debug :is="null">content</Debug></div>');

		const host = wrapper.get('[data-testid="host"]');
		expect(host.element.childElementCount).toBe(0);
		expect(host.text()).toBe('');
	});

	test('does not render the dynamic component or slot while debug is disabled', () => {
		const wrapper = mountDebug('<div data-testid="host"><Debug :is="\'section\'">content</Debug></div>', false);

		const host = wrapper.get('[data-testid="host"]');
		expect(host.element.childElementCount).toBe(0);
		expect(host.text()).toBe('');
	});
});
