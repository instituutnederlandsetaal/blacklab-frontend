// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, test, vi } from 'vitest';

import Autocomplete from '@/shared/ui/Autocomplete.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

enableAutoUnmount(afterEach);

function deferred(cancelable = false) {
	let resolve!: (value: string[]) => void;
	let reject!: (reason?: unknown) => void;
	const cancel = vi.fn();
	const request = new Promise<string[]>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	}) as Promise<string[]> & { cancel?: () => void };
	if (cancelable) request.cancel = cancel;
	return { cancel, reject, request, resolve };
}

function input(wrapper: ReturnType<typeof mount>) {
	return wrapper.get<HTMLInputElement>('.menu-input');
}

async function search(wrapper: ReturnType<typeof mount>, value: string, start = value.length, end = start) {
	const element = input(wrapper).element;
	element.value = value;
	element.setSelectionRange(start, end);
	await input(wrapper).trigger('keyup');
}

function options(wrapper: ReturnType<typeof mount>) {
	return wrapper.getComponent(SelectPicker).props('options');
}

function select(wrapper: ReturnType<typeof mount>, value: string) {
	const onBeforeSelect = wrapper.getComponent(SelectPicker).props('onBeforeSelect') as (option: { value: string }) => boolean;
	return onBeforeSelect({ value });
}

test('uses request identity across A1, B, and A2', async () => {
	const a1 = deferred(true);
	const b = deferred(true);
	const a2 = deferred(true);
	const getData = vi.fn().mockReturnValueOnce(a1.request).mockReturnValueOnce(b.request).mockReturnValueOnce(a2.request);
	const wrapper = mount(Autocomplete, { props: { getData } });

	await search(wrapper, 'a');
	await search(wrapper, 'b');
	await search(wrapper, 'a');
	expect(a1.cancel).toHaveBeenCalledOnce();
	expect(b.cancel).toHaveBeenCalledOnce();

	a2.resolve(['A2']);
	await flushPromises();
	expect(options(wrapper)).toEqual(['A2']);
	a1.reject(new Error('stale A1'));
	b.resolve(['B']);
	await flushPromises();
	expect(options(wrapper)).toEqual(['A2']);
});

test('supports plain promises and only cancels supported pending requests', async () => {
	const plain = deferred();
	const cancelable = deferred(true);
	const latest = deferred();
	const getData = vi.fn().mockReturnValueOnce(plain.request).mockReturnValueOnce(cancelable.request).mockReturnValueOnce(latest.request);
	const wrapper = mount(Autocomplete, { props: { getData } });

	await search(wrapper, 'plain');
	await search(wrapper, 'cancelable');
	await search(wrapper, 'latest');
	expect(cancelable.cancel).toHaveBeenCalledOnce();
	latest.resolve(['result']);
	plain.resolve(['stale']);
	await flushPromises();
	expect(options(wrapper)).toEqual(['result']);
});

test('does not cancel a request after it settles', async () => {
	const settled = deferred(true);
	const next = deferred();
	const getData = vi.fn().mockReturnValueOnce(settled.request).mockReturnValueOnce(next.request);
	const wrapper = mount(Autocomplete, { props: { getData } });

	await search(wrapper, 'first');
	settled.resolve(['first']);
	await flushPromises();
	await search(wrapper, 'second');
	expect(settled.cancel).not.toHaveBeenCalled();
});

test('handles rejection and permits a same-term retry', async () => {
	const failed = deferred();
	const retry = deferred();
	const getData = vi.fn().mockReturnValueOnce(failed.request).mockReturnValueOnce(retry.request);
	const wrapper = mount(Autocomplete, { props: { getData } });

	await search(wrapper, 'retry');
	failed.reject(new Error('offline'));
	await flushPromises();
	expect(options(wrapper)).toEqual([]);
	await search(wrapper, 'retry');
	expect(getData).toHaveBeenCalledTimes(2);
	retry.resolve(['recovered']);
	await flushPromises();
	expect(options(wrapper)).toEqual(['recovered']);
});

test('clears suggestions for empty input and after a delimiter', async () => {
	const getData = vi.fn(() => Promise.resolve(['one']));
	const wrapper = mount(Autocomplete, { props: { getData } });

	await search(wrapper, 'one');
	await flushPromises();
	expect(options(wrapper)).toEqual(['one']);
	await search(wrapper, '');
	expect(options(wrapper)).toEqual([]);
	await search(wrapper, 'one');
	await flushPromises();
	await search(wrapper, 'one ');
	expect(options(wrapper)).toEqual([]);
	expect(getData).toHaveBeenCalledTimes(2);
});

test('contains the caret in the correct token at a whitespace boundary', async () => {
	const getData = vi.fn((_term: string) => Promise.resolve([]));
	const wrapper = mount(Autocomplete, { props: { getData } });

	await search(wrapper, 'one two', 3);
	await search(wrapper, 'one two', 4);
	await search(wrapper, 'one two', 5);
	expect(getData.mock.calls.map(([term]) => term)).toEqual(['one', 't']);
});

test('subtracts the opening quote from the autocomplete prefix', async () => {
	const getData = vi.fn((_term: string) => Promise.resolve([]));
	const wrapper = mount(Autocomplete, { props: { getData, useQuoteAsWordBoundary: true } });

	await search(wrapper, '"alpha beta"', 3);
	expect(getData).toHaveBeenCalledWith('al');
});

test.each([
	['"a\\"b c"', 4, 'a"'],
	['"a\\"b c"', 5, 'a"b'],
	['"a\\"b\\"c d"', 7, 'a"b"'],
	['"a\\"b\\"c d"', 8, 'a"b"c'],
])('decodes escaped quotes in the prefix %#', async (value, caret, expected) => {
	const getData = vi.fn((_term: string) => Promise.resolve([]));
	const wrapper = mount(Autocomplete, { props: { getData, useQuoteAsWordBoundary: true } });

	await search(wrapper, value, caret);
	expect(getData).toHaveBeenCalledWith(expected);
});

test('replaces exactly an arbitrary selection', () => {
	const wrapper = mount(Autocomplete, { props: { getData: () => Promise.resolve([]) } });
	const element = input(wrapper).element;
	const inputEvent = vi.fn();
	element.value = 'alpha beta';
	element.setSelectionRange(2, 8);
	element.addEventListener('input', inputEvent);

	expect(select(wrapper, 'X')).toBe(false);
	expect(element.value).toBe('alXta');
	expect([element.selectionStart, element.selectionEnd]).toEqual([3, 3]);
	expect(inputEvent).toHaveBeenCalledOnce();
});

test('quotes a multiword value and leaves the caret after its closing quote', () => {
	const wrapper = mount(Autocomplete, {
		props: { getData: () => Promise.resolve([]), useQuoteAsWordBoundary: true },
	});
	const element = input(wrapper).element;
	element.value = 'alpha beta';
	element.setSelectionRange(2, 2);

	expect(select(wrapper, 'new value')).toBe(false);
	expect(element.value).toBe('"new value" beta');
	expect([element.selectionStart, element.selectionEnd]).toEqual([11, 11]);
});

test.each([false, true])('cancels a supported pending request on unmount: %s', async cancelable => {
	const pending = deferred(cancelable);
	const wrapper = mount(Autocomplete, { props: { getData: () => pending.request } });

	await search(wrapper, 'pending');
	wrapper.unmount();
	expect(pending.cancel).toHaveBeenCalledTimes(cancelable ? 1 : 0);
	pending.resolve(['late']);
});
