// @vitest-environment jsdom

import { createTestResultsState } from '@test/mocks/results-state';
import { shallowMount } from '@vue/test-utils';
import { expect, test } from 'vitest';

import { resultsStateKey } from '@/features/search/model/results/results-state';

import { createDebugSystem } from '@/shared/debug/debug';

import QueryFormSettings from '@/pages/search/form/QueryFormSettings.vue';

test('page size accepts integer number input and displays the saved size after a rejected edit', async () => {
	const results = createTestResultsState();
	const wrapper = shallowMount(QueryFormSettings, {
		global: {
			provide: { [resultsStateKey]: results },
			plugins: [createDebugSystem({ enabledByDefault: false, visible: false })],
			stubs: { Modal: { template: '<div><slot /></div>' } },
		},
	});
	try {
		const pageSize = wrapper.get<HTMLInputElement>('#resultsPerPage');
		await pageSize.setValue('1e2');
		expect(results.settings.pageSize).toBe(100);
		await pageSize.setValue('1001');
		expect(pageSize.element.value).toBe('100');
		expect(results.settings.pageSize).toBe(100);
	} finally {
		wrapper.unmount();
	}
});
