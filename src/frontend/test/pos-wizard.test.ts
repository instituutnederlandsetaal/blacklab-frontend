// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { flushPromises, mount, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { serializeExclusionClause } from '@/pages/config/pos-exclusions';
import type { NormalizedAnnotation, NormalizedIndex } from '@/types/apptypes';
import type { BLTermOccurances } from '@/types/blacklabtypes';

import { CancelableRequest } from '@/shared/api/lib/api-types';

import POS from '@/pages/config/POS.vue';
import POSStep3 from '@/pages/config/POS_3.vue';

type StepState = InstanceType<typeof POSStep3>['$props']['modelValue'];

let api: ReturnType<typeof createMockApi>;

const index = {
	id: 'owner:corpus',
	annotatedFields: {
		contents: {
			annotations: {
				pos: { id: 'pos' },
			},
		},
	},
} as unknown as NormalizedIndex;

beforeEach(() => {
	api = createMockApi();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

test('discards corrupt persisted wizard state and restores the current corpus', () => {
	const key = `cf/config/${index.id}/stepstate`;
	const storage = { getItem: vi.fn(() => '{broken'), removeItem: vi.fn(), setItem: vi.fn() };
	vi.stubGlobal('localStorage', storage);

	const wrapper = shallowMount(POS, { props: { index }, global: { plugins: [api] } });

	expect(storage.removeItem).toHaveBeenCalledWith(key);
	expect(wrapper.vm.stepstate).toMatchObject({ version: 2, index, annotations: [{ id: 'pos' }] });
});

test('escapes literal exclusion values without escaping list separators', () => {
	expect(serializeExclusionClause([{ annotationId: 'tag', values: ['a|b', 'c"d', 'e\\f'] }], ' & ')).toBe(String.raw` & tag!="a\|b|c\"d|e\\f"`);
});

function deferredRequest<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const cancel = vi.fn();
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { cancel, reject, request: new CancelableRequest(promise, cancel), resolve };
}

function wizardState(): StepState {
	const main = { id: 'pos' } as NormalizedAnnotation;
	const sub = { id: 'number', parentAnnotationId: 'pos' } as NormalizedAnnotation;
	return {
		version: 2,
		annotations: [main, sub],
		index,
		mainPosAnnotationId: main.id,
		subAnnotations: [sub],
		exclusions: [],
		step3: {},
		step4: {},
	};
}

test('cancels the current sequential value request and suppresses its late result after unmount', async () => {
	const mainValues = deferredRequest<BLTermOccurances>();
	const subValues = deferredRequest<BLTermOccurances>();
	api.blacklabApi.getTermFrequencies.mockReturnValueOnce(mainValues.request).mockReturnValueOnce(subValues.request);
	const state = wizardState();
	const update = vi.fn();
	const wrapper = mount(POSStep3, { props: { modelValue: state, 'onUpdate:modelValue': update }, global: { plugins: [api] } });

	mainValues.resolve({ termFreq: { N: 1 } } as BLTermOccurances);
	await flushPromises();
	expect(api.blacklabApi.getTermFrequencies).toHaveBeenCalledTimes(2);
	const updatesBeforeUnmount = update.mock.calls.length;

	wrapper.unmount();
	expect(mainValues.cancel).not.toHaveBeenCalled();
	expect(subValues.cancel).toHaveBeenCalledOnce();
	subValues.resolve({ termFreq: { singular: 1 } } as BLTermOccurances);
	await flushPromises();

	expect(state.step3.main?.N.subs).toEqual({});
	expect(update).toHaveBeenCalledTimes(updatesBeforeUnmount);
});

test('settles loading state when a combination request fails', async () => {
	const mainValues = deferredRequest<BLTermOccurances>();
	const subValues = deferredRequest<BLTermOccurances>();
	const combination = deferredRequest<never>();
	api.blacklabApi.getTermFrequencies.mockReturnValueOnce(mainValues.request).mockReturnValueOnce(subValues.request);
	api.blacklabApi.getHits.mockReturnValueOnce(combination.request);
	vi.spyOn(console, 'error').mockImplementation(() => {});
	const state = wizardState();
	const wrapper = mount(POSStep3, { props: { modelValue: state }, global: { plugins: [api] } });

	mainValues.resolve({ termFreq: { N: 1 } } as BLTermOccurances);
	await flushPromises();
	subValues.resolve({ termFreq: { singular: 1 } } as BLTermOccurances);
	await flushPromises();
	expect(api.blacklabApi.getHits).toHaveBeenCalledOnce();

	combination.reject(new Error('request failed'));
	await flushPromises();

	expect(
		wrapper
			.findAll('button')
			.find(button => button.text() === 'Reset')!
			.attributes('disabled'),
	).toBeUndefined();
	expect(state.step3.main?.N.subs.number.singular.loading).toBe(false);
	expect(wrapper.text()).toContain('Failed to generate tagset.');
	expect(() => POSStep3.defaultAction(state)).toThrow('Step 3 not completed');
	wrapper.unmount();
});
