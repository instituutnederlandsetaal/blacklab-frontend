// @vitest-environment jsdom

import { createMockApi, resolvedRequest } from '@test/mocks/api';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, ref } from 'vue';

import { useBlackLabApi, useFrontendApi } from '@/shared/api';
import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';

describe('createMockApi', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('rejects unconfigured API methods with useful diagnostics', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const api = createMockApi();
		const request = api.blacklabApi.getCorpora();

		expect(request).toBeInstanceOf(CancelableRequest);
		await expect(request).rejects.toBeInstanceOf(ApiError);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('blacklab.getCorpora'));
		await expect(api.frontendApi.getHelp()).rejects.toBeInstanceOf(ApiError);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('frontend.getHelp'));
	});

	test('returns configured values through CancelableRequest', async () => {
		const api = createMockApi({
			blacklab: {
				getCorpora: [],
			},
			frontend: {
				getHelp: '<p>Help</p>',
				getTagset: undefined,
			},
		});

		await expect(api.blacklabApi.getCorpora()).resolves.toEqual([]);
		await expect(api.frontendApi.getHelp()).resolves.toBe('<p>Help</p>');
		await expect(api.frontendApi.getTagset('test')).resolves.toBeUndefined();
	});

	test('supports call-aware mocks in the configured values map', async () => {
		const getTermAutocomplete = vi.fn((indexId: string, _field: string, _annotation: string, prefix: string) => resolvedRequest([`${indexId}:${prefix}`]));
		const api = createMockApi({
			blacklab: {
				getTermAutocomplete,
			},
		});

		await expect(api.blacklabApi.getTermAutocomplete('corpus', 'contents', 'word', 'wat')).resolves.toEqual(['corpus:wat']);
		expect(getTermAutocomplete).toHaveBeenCalledWith('corpus', 'contents', 'word', 'wat');
	});

	test('keeps stable mocks and separate configurations and call histories for mounted clients', async () => {
		const first = createMockApi({ blacklab: { getTermAutocomplete: ['first'] }, frontend: { getHelp: 'First help' } });
		const second = createMockApi();
		second.blacklabApi.getTermAutocomplete.mockReturnValue(resolvedRequest(['second']));
		second.frontendApi.getHelp.mockReturnValue(resolvedRequest('Second help'));
		expect(first.blacklabApi.getTermAutocomplete).toBe(first.blacklabApi.getTermAutocomplete);
		expect(first.frontendApi.getHelp).toBe(first.frontendApi.getHelp);
		expect(first.blacklabApi.getTermAutocomplete).not.toBe(second.blacklabApi.getTermAutocomplete);
		expect(first.frontendApi.getHelp).not.toBe(second.frontendApi.getHelp);
		const Client = defineComponent({
			setup() {
				const blacklab = useBlackLabApi();
				const frontend = useFrontendApi();
				const result = ref('');
				return {
					result,
					async load() {
						const terms = await blacklab.getTermAutocomplete('corpus', 'contents', 'word', 'a');
						result.value = `${terms.join(',')}: ${await frontend.getHelp()}`;
					},
				};
			},
			template: '<button @click="load">{{ result }}</button>',
		});
		const firstClient = mount(Client, { global: { plugins: [first] } });
		const secondClient = mount(Client, { global: { plugins: [second] } });

		await firstClient.get('button').trigger('click');
		await flushPromises();
		expect(firstClient.text()).toBe('first: First help');
		expect(first.blacklabApi.getTermAutocomplete).toHaveBeenCalledWith('corpus', 'contents', 'word', 'a');
		expect(first.frontendApi.getHelp).toHaveBeenCalledOnce();
		expect(second.blacklabApi.getTermAutocomplete).not.toHaveBeenCalled();
		expect(second.frontendApi.getHelp).not.toHaveBeenCalled();

		await secondClient.get('button').trigger('click');
		await flushPromises();
		expect(secondClient.text()).toBe('second: Second help');
		expect(firstClient.text()).toBe('first: First help');
		expect(first.blacklabApi.getTermAutocomplete).toHaveBeenCalledOnce();
		expect(first.frontendApi.getHelp).toHaveBeenCalledOnce();
		expect(second.blacklabApi.getTermAutocomplete).toHaveBeenCalledWith('corpus', 'contents', 'word', 'a');
		expect(second.frontendApi.getHelp).toHaveBeenCalledOnce();
	});
});
