// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { map } from 'rxjs';
import { describe, expect, test } from 'vitest';
import { defineComponent, nextTick } from 'vue';

import { Loadable } from '@/_new/shared/utils/loadable/loadable';
import { InteractiveLoadable } from '@/_new/shared/utils/loadable/loadable-streams';

describe('InteractiveLoadable Vue template interop', () => {
	test('renders .value from a component template', async () => {
		const loadable = new InteractiveLoadable<number, string>(input$ => input$.pipe(map(value => Loadable.Loaded(`value:${value}`))), { debounce: 0 });

		const wrapper = mount(
			defineComponent({
				data: () => ({ loadable }),
				template: '<div>{{ loadable.value }}</div>',
			}),
		);

		loadable.next(5);
		await nextTick();

		expect(wrapper.text()).toContain('value:5');

		loadable.next(6);
		await nextTick();

		expect(wrapper.text()).toContain('value:6');

		wrapper.unmount();
		loadable.dispose();
	});
});
