// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import * as UIStore from '@/app/state/ui-state';
import { searchFormIds as ids } from '@/customization-api/shared/form/ids';
import { FormSystem, type TokenSequenceFieldState } from '@/features/form';

import { createCorpus, createParallelCorpus, createSearchFormFixture, readSearchFormState, selectRenderedForm, type SearchFormFixture } from './search-form-fixture';

import TokenSequenceField from '@/features/form/fields/TokenSequenceField.vue';

let fixture: SearchFormFixture;

beforeEach(() => {
	fixture = createSearchFormFixture();
});

afterEach(() => {
	fixture.scope.stop();
	vi.restoreAllMocks();
});

describe('Explore forms', () => {
	test('builds Documents as a form with configuration-backed defaults, shared filters, and a result preset', () => {
		const runtime = fixture.createRuntime();
		const groupByFieldId = ids.exploreCorporaGroupBy();
		const groupDisplayModeFieldId = ids.exploreCorporaGroupDisplayMode();

		expect(runtime.state.state.value[groupByFieldId]).toBe('field:author');
		expect(runtime.state.state.value[groupDisplayModeFieldId]).toBe('table');

		runtime.state.state.value[groupDisplayModeFieldId] = 'tokens';
		runtime.state.state.value[ids.metadataFilter('genre')] = ['fiction'];
		expect(runtime.compile(ids.exploreForm('corpora'))).toMatchObject({
			encoded: {
				'f.form': ids.exploreForm('corpora'),
				'f.explore-corpora-group-display-mode': 'tokens',
			},
			params: { filter: 'genre:(fiction)', group: 'field:author' },
			resultPreset: 'tokens',
			targetView: 'docs',
		});
	});

	test('restores a scoped Documents URL through the shared form restore path', () => {
		const runtime = fixture.createRuntime();
		const restored = readSearchFormState(runtime, {
			'f.form': ids.exploreForm('corpora'),
			'f.explore-corpora-group-by': 'field:genre',
			'f.explore-corpora-group-display-mode': 'docs',
			filter: 'author:Austen',
		});
		runtime.state.replaceState(restored);

		expect(runtime.state.state.value[ids.exploreCorporaGroupBy()]).toBe('field:genre');
		expect(runtime.state.state.value[ids.exploreCorporaGroupDisplayMode()]).toBe('docs');
		expect(restored.rawOverrides).toEqual({ filter: 'author:Austen' });
		expect(runtime.compile(ids.exploreForm('corpora'))).toMatchObject({
			params: { filter: 'author:Austen', group: 'field:genre' },
			resultPreset: 'docs',
			targetView: 'docs',
		});
	});

	test('builds Frequency with configured annotations, shared filters, and a hits result preset', () => {
		const runtime = fixture.createRuntime();
		const annotationFieldId = ids.exploreFrequencyAnnotation();

		expect(runtime.state.state.value[annotationFieldId]).toBe('word');

		runtime.state.state.value[annotationFieldId] = 'lemma';
		runtime.state.state.value[ids.metadataFilter('genre')] = ['fiction'];
		expect(runtime.compile(ids.exploreForm('frequency'))).toMatchObject({
			encoded: {
				'f.form': ids.exploreForm('frequency'),
				'f.explore-frequency-annotation': 'lemma',
			},
			params: { filter: 'genre:(fiction)', group: 'hit:lemma', patt: '[]' },
			targetView: 'hits',
		});
	});

	test('falls back to the first configured Explore annotation when stored defaults are unavailable', () => {
		const state = UIStore.getState();
		state.explore.searchAnnotationIds = ['lemma'];
		state.explore.defaultSearchAnnotationId = 'removed';
		state.results.shared.groupAnnotationIds = ['pos'];
		state.explore.defaultGroupAnnotationId = 'removed';
		const runtime = fixture.createRuntime();

		expect(runtime.state.state.value[ids.exploreFrequencyAnnotation()]).toBe('pos');
		expect(runtime.state.state.value[ids.exploreNgramGroupBy()]).toBe('pos');
		expect(runtime.state.state.value[ids.exploreNgramTokens()]).toEqual(Array.from({ length: 5 }, () => ({ fieldId: 'lemma', fieldState: { value: '', caseSensitive: false } })));
	});

	test('builds a bounded N-gram sequence with independently selected token and grouping annotations', () => {
		const runtime = fixture.createRuntime();
		const tokensFieldId = ids.exploreNgramTokens();
		const groupByFieldId = ids.exploreNgramGroupBy();

		expect(runtime.state.state.value[tokensFieldId] as TokenSequenceFieldState).toHaveLength(5);

		runtime.state.state.value[tokensFieldId] = [
			{ fieldId: 'word', fieldState: { value: 'wat*', caseSensitive: false } },
			{ fieldId: 'pos', fieldState: ['NOU', 'VRB'] },
			{ fieldId: 'lemma', fieldState: { value: '', caseSensitive: false } },
		] satisfies TokenSequenceFieldState;
		runtime.state.state.value[groupByFieldId] = 'lemma';
		runtime.state.state.value[ids.metadataFilter('author')] = { value: 'Austen', caseSensitive: false };

		expect(runtime.compile(ids.exploreForm('ngram'))).toMatchObject({
			encoded: {
				'f.form': ids.exploreForm('ngram'),
				'f.explore-ngram-group-by': 'lemma',
			},
			params: { filter: 'author:(Austen)', group: 'hit:lemma', patt: '[word="wat.*"] [pos="NOU|VRB"] []' },
			targetView: 'hits',
		});
		expect(runtime.compile(ids.exploreForm('ngram')).summaries).toEqual(
			expect.arrayContaining([expect.objectContaining({ summaryType: ['patt'], value: 'lemma' }), expect.objectContaining({ summaryType: ['patt'], value: '3' })]),
		);
	});

	test('drops a restored N-gram grouping annotation that is no longer configured', () => {
		const runtime = fixture.createRuntime();
		const restored = readSearchFormState(runtime, {
			'f.form': ids.exploreForm('ngram'),
			'f.explore-ngram-group-by': 'removed',
		});

		expect(restored.state[ids.exploreNgramGroupBy()]).toBe('word');
		expect(restored.issues).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'error', message: expect.stringContaining(ids.exploreNgramGroupBy()) })]));
	});

	test('renders the configured N-gram sequence', () => {
		const runtime = fixture.createRuntime();
		selectRenderedForm(runtime, ids.exploreForm('ngram'));
		const wrapper = mount(FormSystem, {
			props: { runtime },
			global: { stubs: { TokenSequenceField: true } },
		});
		expect(wrapper.getComponent(TokenSequenceField).props('modelValue')).toHaveLength(5);
	});

	test('uses the regular missing-tagset fallback when a POS annotation is rendered in an N-gram', () => {
		const corpus = createCorpus();
		corpus.allAnnotationsMap.pos.uiType = 'pos';
		const runtime = fixture.createRuntime(corpus);
		runtime.state.state.value[ids.exploreNgramTokens()] = [{ fieldId: 'pos', fieldState: { value: 'NOU|VRB?', caseSensitive: false } }] satisfies TokenSequenceFieldState;

		expect(runtime.compile(ids.exploreForm('ngram')).params.patt).toBe('[pos="NOU|VRB."]');
	});

	test.each(['ngram', 'frequency'] as const)('adds a source-only searchfield selector to parallel Explore %s', mode => {
		const runtime = fixture.createRuntime(createParallelCorpus());
		const sourceFieldId = ids.exploreParallelSource(mode);
		const sourceField = runtime.definition.getField(sourceFieldId);

		expect(runtime.state.state.value[sourceFieldId]).toBe('contents__en');
		expect(sourceField?.layout).toBe(mode === 'ngram' ? 'horizontal' : 'vertical');
		runtime.state.state.value[sourceFieldId] = 'contents__nl';

		const compiled = runtime.compile(ids.exploreForm(mode));
		expect(compiled.params.searchfield).toBe('contents__nl');
		expect(compiled.params.patt).not.toContain('=>');
	});

	test('restores a scoped N-gram URL including active anonymous token state', () => {
		const runtime = fixture.createRuntime();
		runtime.state.state.value[ids.exploreNgramTokens()] = [
			{ fieldId: 'lemma', fieldState: { value: 'run?', caseSensitive: false } },
			{ fieldId: 'word', fieldState: { value: '', caseSensitive: false } },
		] satisfies TokenSequenceFieldState;
		runtime.state.state.value[ids.exploreNgramGroupBy()] = 'pos';
		const submitted = runtime.compile(ids.exploreForm('ngram'));
		const restored = readSearchFormState(runtime, submitted.encoded);
		runtime.state.replaceState(restored);

		expect(runtime.state.state.value[ids.exploreNgramTokens()]).toEqual([
			{ fieldId: 'lemma', fieldState: { value: 'run?', caseSensitive: false } },
			{ fieldId: 'word', fieldState: { value: '', caseSensitive: false } },
		]);
		expect(runtime.compile(ids.exploreForm('ngram'))).toMatchObject({
			params: { group: 'hit:pos', patt: '[lemma="run."] []' },
			targetView: 'hits',
		});
	});
});
