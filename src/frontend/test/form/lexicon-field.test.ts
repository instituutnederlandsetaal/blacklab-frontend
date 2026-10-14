// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import Axios from 'axios';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';

import { createLexiconLookup, type LexiconLookupResult } from '@/features/form/fields/generic/lexicon-field';

import LexiconField from '@/features/form/fields/generic/LexiconField.vue';

enableAutoUnmount(afterEach);

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const baseProps = {
	id: 'field',
	htmlId: 'field_1',
	displayName: 'Field',
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, reject, resolve };
}

describe('lexicon field', () => {
	const result = (word: string): LexiconLookupResult => ({
		posOptions: { noun: true },
		wordList: [{ lemma: word, pos: ['noun'], count: 1, word, selected: false }],
	});

	test('debounces lookup, filters parts of speech, and maintains selected words', async () => {
		vi.useFakeTimers();
		const lookup = vi.fn(async () => ({
			posOptions: { noun: true, verb: true },
			wordList: [
				{ lemma: 'water', pos: ['noun'], count: 3, word: 'water', selected: false },
				{ lemma: 'water', pos: ['noun'], count: 0, word: 'water fall', selected: false },
				{ lemma: 'water', pos: ['verb'], count: 2, word: 'water|?', selected: false },
			],
		}));
		const wrapper = mount(LexiconField, {
			props: { ...baseProps, modelValue: { value: '', caseSensitive: false }, lookup, description: 'Lexicon words' },
		});

		await wrapper.get('input[type="text"]').setValue('water');
		await wrapper.setProps({ modelValue: { value: 'water', caseSensitive: false } });
		expect(wrapper.find('.lexicon-spinner').exists()).toBe(true);
		await vi.advanceTimersByTimeAsync(1500);
		await nextTick();
		expect(lookup).toHaveBeenCalledWith('water');
		expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(5);

		await wrapper.findAll('button')[0].trigger('click');
		await nextTick();
		expect(wrapper.emitted('update:modelValue')).toContainEqual([{ value: 'water|water\\|\\?', caseSensitive: false }]);
		await wrapper.findAll('button')[1].trigger('click');
		await nextTick();
		expect(wrapper.emitted('update:modelValue')).toContainEqual([{ value: '', caseSensitive: false }]);

		const posInputs = wrapper.findAll('input[type="checkbox"]').slice(-2);
		await posInputs[1].setValue(false);
		await nextTick();
		expect(wrapper.findAll('label[title]').map(label => label.attributes('title'))).not.toContain('water|? (2)');
	});

	test('clears invalid and empty lookups and recovers from rejected requests', async () => {
		vi.useFakeTimers();
		const lookup = vi.fn(() => Promise.reject(new Error('offline')));
		const wrapper = mount(LexiconField, {
			props: { ...baseProps, modelValue: { value: '', caseSensitive: false }, lookup, showLabel: false },
		});

		await wrapper.setProps({ modelValue: { value: 'two words', caseSensitive: false } });
		await wrapper.setProps({ modelValue: { value: 'word', caseSensitive: false } });
		await vi.advanceTimersByTimeAsync(1500);
		await nextTick();
		expect(wrapper.find('.lexicon-spinner').exists()).toBe(false);
		await wrapper.setProps({ modelValue: { value: '', caseSensitive: false } });
		expect(wrapper.findAll('label[title]')).toHaveLength(0);
	});

	test('ignores stale resolutions and rejections while applying the latest result', async () => {
		vi.useFakeTimers();
		const first = deferred<LexiconLookupResult>();
		const second = deferred<LexiconLookupResult>();
		const latest = deferred<LexiconLookupResult>();
		const lookup = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(latest.promise);
		const wrapper = mount(LexiconField, {
			props: { ...baseProps, modelValue: { value: '', caseSensitive: false }, lookup },
		});

		await wrapper.setProps({ modelValue: { value: 'first', caseSensitive: false } });
		await vi.advanceTimersByTimeAsync(1500);
		await wrapper.setProps({ modelValue: { value: 'second', caseSensitive: false } });
		await vi.advanceTimersByTimeAsync(1500);
		first.resolve(result('stale-success'));
		await flushPromises();
		expect(wrapper.find('.lexicon-spinner').exists()).toBe(true);

		await wrapper.setProps({ modelValue: { value: 'latest', caseSensitive: false } });
		await vi.advanceTimersByTimeAsync(1500);
		second.reject(new Error('stale failure'));
		await flushPromises();
		expect(wrapper.find('.lexicon-spinner').exists()).toBe(true);

		latest.resolve(result('current'));
		await flushPromises();
		expect(wrapper.get('label[title]').attributes('title')).toBe('current (1)');
		expect(lookup.mock.calls.map(([term]) => term)).toEqual(['first', 'second', 'latest']);
	});

	test('suppresses a matching selection echo only', async () => {
		vi.useFakeTimers();
		const lookup = vi.fn(async () => result('water'));
		const wrapper = mount(LexiconField, {
			props: { ...baseProps, modelValue: { value: '', caseSensitive: false }, lookup },
		});

		await wrapper.setProps({ modelValue: { value: 'wat', caseSensitive: false } });
		await vi.advanceTimersByTimeAsync(1500);
		await wrapper.get('input[type="checkbox"]').setValue(true);
		const generated = wrapper.emitted('update:modelValue')!.at(-1)![0] as { value: string; caseSensitive: boolean };
		expect(generated.value).toBe('water');
		await wrapper.setProps({ modelValue: generated });
		await vi.advanceTimersByTimeAsync(1500);
		expect(lookup).toHaveBeenCalledOnce();
	});

	test('looks up new text after an identical single-word selection', async () => {
		vi.useFakeTimers();
		const lookup = vi.fn(async (term: string) => result(term));
		const wrapper = mount(LexiconField, {
			props: { ...baseProps, modelValue: { value: '', caseSensitive: false }, lookup },
		});

		await wrapper.setProps({ modelValue: { value: 'water', caseSensitive: false } });
		await vi.advanceTimersByTimeAsync(1500);
		await wrapper.get('input[type="checkbox"]').setValue(true);
		expect((wrapper.emitted('update:modelValue')!.at(-1)![0] as { value: string }).value).toBe('water');

		await wrapper.setProps({ modelValue: { value: 'fire', caseSensitive: false } });
		await vi.advanceTimersByTimeAsync(1500);
		expect(lookup.mock.calls.map(([term]) => term)).toEqual(['water', 'fire']);
	});

	test('clones lookup data before selections can mutate it', async () => {
		vi.useFakeTimers();
		const source = result('water');
		const wrapper = mount(LexiconField, {
			props: { ...baseProps, modelValue: { value: '', caseSensitive: false }, lookup: async () => source },
		});

		await wrapper.setProps({ modelValue: { value: 'water', caseSensitive: false } });
		await vi.advanceTimersByTimeAsync(1500);
		const checkboxes = wrapper.findAll('input[type="checkbox"]');
		source.posOptions.noun = false;
		source.wordList[0].selected = true;
		source.wordList[0].pos[0] = 'verb';
		expect((checkboxes[0].element as HTMLInputElement).checked).toBe(false);
		expect((checkboxes[1].element as HTMLInputElement).checked).toBe(true);
		await checkboxes[1].setValue(false);
		await checkboxes[1].setValue(true);
		expect(wrapper.get('label[title]').attributes('title')).toBe('water (1)');
	});

	test('clears delayed work and ignores pending results on unmount', async () => {
		vi.useFakeTimers();
		const lookup = vi.fn(async () => result('late'));
		const scheduled = mount(LexiconField, {
			props: { ...baseProps, modelValue: { value: '', caseSensitive: false }, lookup },
		});
		await scheduled.setProps({ modelValue: { value: 'scheduled', caseSensitive: false } });
		scheduled.unmount();
		await vi.advanceTimersByTimeAsync(1500);
		expect(lookup).not.toHaveBeenCalled();

		const pending = deferred<LexiconLookupResult>();
		const readPosOptions = vi.fn(() => ({ noun: true }));
		const lateResult = {
			get posOptions() {
				return readPosOptions();
			},
			wordList: [],
		} satisfies LexiconLookupResult;
		const started = mount(LexiconField, {
			props: { ...baseProps, modelValue: { value: '', caseSensitive: false }, lookup: () => pending.promise },
		});
		await started.setProps({ modelValue: { value: 'started', caseSensitive: false } });
		await vi.advanceTimersByTimeAsync(1500);
		started.unmount();
		pending.resolve(lateResult);
		await flushPromises();
		expect(readPosOptions).not.toHaveBeenCalled();
	});

	test('builds lookup results from service lemmata, wordforms, and frequencies', async () => {
		const get = vi.spyOn(Axios, 'get');
		get
			.mockResolvedValueOnce({ data: { message: 'OK', lemmata_list: [{ found_lemmata: [{ lemma: 'cat', lemma_id: '1', pos: 'noun' }] }] } })
			.mockResolvedValueOnce({
				data: {
					message: 'OK',
					lemmata_list: [{ found_lemmata: [{ lemma: 'cat', lemma_id: '1', pos: 'noun' }] }, { found_lemmata: [{ lemma: 'run', lemma_id: '2', pos: '' }] }],
				},
			})
			.mockResolvedValueOnce({ data: { message: 'OK', wordforms_list: [{ found_wordforms: ['cat', 'cats'] }] } })
			.mockResolvedValueOnce({ data: { message: 'ERROR', wordforms_list: [{ found_wordforms: ['ignored'] }] } });
		const getTermFrequencies = vi.fn(async () => ({ cat: 5, cats: 4, run: 2 }));
		const lookup = createLexiconLookup({
			database: 'test',
			getTermFrequencies,
			service: {
				getLemmaIdFromWordform: '/wordform',
				getLemmaIdFromLemma: '/lemma',
				getWordformsFromLemmaId: '/forms',
				caseSensitive: true,
			},
		});

		const result = await lookup('cats');
		expect(getTermFrequencies).toHaveBeenCalledWith(expect.arrayContaining(['cat', 'cats']));
		expect(result.posOptions).toEqual({ 'cat (noun)': true, 'run (unknown)': true });
		expect(result.wordList.map(word => word.word)).toEqual(expect.arrayContaining(['cat', 'cats']));
	});

	test('falls back to a direct corpus term and returns an empty result when absent', async () => {
		const get = vi.spyOn(Axios, 'get');
		get.mockResolvedValue({ data: { message: 'OK', lemmata_list: [{ found_lemmata: [] }] } });
		const present = createLexiconLookup({ database: 'test', getTermFrequencies: async () => ({ water: 7 }) });
		const absent = createLexiconLookup({ database: 'test', getTermFrequencies: async () => ({}) });

		expect(await present('water')).toEqual({
			posOptions: { water: true },
			wordList: [{ lemma: 'water', pos: ['water'], count: 7, word: 'water', selected: false }],
		});
		expect(await absent('missing')).toEqual({ posOptions: {}, wordList: [] });
	});
});
