// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { DOMWrapper, enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref } from 'vue';

import * as UIStore from '@/app/state/ui-state';
import { searchFormIds as ids } from '@/customization-api/shared/form/ids';
import { FormSystem, createCollocationTarget, type CollocationFieldState } from '@/features/form';
import { createCollocationSimpleFieldNode } from '@/features/form/fields/collocation-field';

import { annotation, createCorpus, createSearchFormFixture, readSearchFormState, type SearchFormFixture } from './search-form-fixture';

let fixture: SearchFormFixture;

beforeEach(() => {
	fixture = createSearchFormFixture();
});

afterEach(() => {
	fixture.scope.stop();
	vi.restoreAllMocks();
});

enableAutoUnmount(afterEach);

describe('Collocation form', () => {
	test.each([
		{ version: '4.4.0', available: false },
		{ version: '5.0.0', available: true },
		{ version: '6.0.0', available: true },
		{ version: 'dev', available: true },
	])('gates Collocations for BlackLab $version runtime with a BlackLab 4 index', ({ version, available }) => {
		const corpus = createCorpus();
		corpus.runtimeVersion = version;
		const definition = fixture.createRuntime(corpus).definition;

		expect(definition.getContainer(ids.collocationsSection()) !== null).toBe(available);
		expect(definition.getForm(ids.collocationsForm()) !== null).toBe(available);
	});

	test('adds Collocations after Search and Explore with its public heading', () => {
		const runtime = fixture.createRuntime();
		const definition = runtime.definition;

		expect(definition.getRoot().children.map(node => node.id)).toEqual([ids.searchSection(), ids.exploreSection(), ids.collocationsSection()]);
		expect(definition.getView(ids.collocationsSectionHeading())).not.toBeNull();
	});

	test('edits and compiles Collocations through the rendered controls while retaining a disabled collocate draft', async () => {
		const runtime = fixture.createRuntime();
		runtime.state.uiState.value[ids.root()] = ids.collocationsSection();
		const wrapper = mount(FormSystem, { attachTo: document.body, props: { runtime } });
		await nextTick();
		const [keyword, collocate, context] = wrapper.findAll('.blf-collocation-section');

		expect(wrapper.findAll('.blf-collocation-section')).toHaveLength(3);
		expect(wrapper.findAll('.blf-collocation-pattern-modes button')).toHaveLength(3);
		await keyword.get('.blf-collocation-simple-control input[type="text"]').setValue('ship');
		const toggle = collocate.get('input[type="checkbox"]');
		expect(toggle.attributes('aria-expanded')).toBe('false');
		await toggle.setValue(true);
		await collocate.get('.blf-collocation-simple-control input[type="text"]').setValue('boat');
		await toggle.setValue(false);
		expect(collocate.find('.blf-collocation-pattern-editor').exists()).toBe(false);
		expect(runtime.compile(ids.collocationsForm()).params).not.toHaveProperty('collpatt');
		await toggle.setValue(true);
		expect(toggle.attributes('aria-expanded')).toBe('true');
		expect((collocate.get('input[type="text"]').element as HTMLInputElement).value).toBe('boat');

		const [before, after] = context.findAll('input[type="number"]');
		expect(before.attributes('min')).toBe('0');
		await before.setValue('3');
		await after.setValue('4');
		const annotationPicker = context.get('.combobox');
		await annotationPicker.get('button').trigger('click');
		await new DOMWrapper(document.body).get(`.combobox-menu[data-menu-id="${annotationPicker.attributes('data-menu-id')}"] [data-value="lemma"]`).trigger('click');
		await context.get('.blf-collocation-calculation input').setValue(true);

		expect(runtime.compile(ids.collocationsForm()).params).toMatchObject({
			patt: '[word="ship"]',
			collpatt: '[word="boat"]',
			context: '3:4',
			annotation: 'lemma',
			sensitive: true,
		});
	});

	test('compiles the collocation field with its shared filter region', () => {
		const runtime = fixture.createRuntime();
		const state = runtime.state.state.value[ids.collocationsField()] as CollocationFieldState;
		runtime.state.state.value[ids.collocationsField()] = {
			...state,
			keyword: { ...state.keyword, mode: 'expert', expert: ' [word="ship"] ' },
			collocate: {
				enabled: true,
				pattern: { ...state.collocate.pattern, mode: 'expert', expert: ' [pos="N.*"] ' },
			},
			before: 3,
			after: 4,
			annotation: 'lemma',
		};
		runtime.state.state.value[ids.metadataFilter('author')] = { value: 'Austen', caseSensitive: false };

		expect(runtime.compile(ids.collocationsForm())).toMatchObject({
			formId: ids.collocationsForm(),
			params: {
				annotation: 'lemma',
				collpatt: '[pos="N.*"]',
				colltype: 'proximity',
				context: '3:4',
				filter: 'author:(Austen)',
				patt: '[word="ship"]',
				scorertype: 'coll-dice',
				sensitive: false,
			},
			resultPreset: 'table',
			targetView: 'hits',
		});
	});

	test('uses deferred labels for usable forward-index annotations from the main field only', () => {
		const corpus = createCorpus();
		const mainField = corpus.allAnnotatedFieldsMap.contents;
		mainField.annotations.internal = annotation('internal', { isInternal: true });
		mainField.annotations.no_forward_index = annotation('no_forward_index', { hasForwardIndex: false });
		const locale = ref('en');
		const translate = createMockTranslate();
		const runtime = fixture.createSystem({
			blacklabApi: createMockApi().blacklabApi,
			corpus,
			translate: {
				...translate,
				$tAnnotDisplayName: value => `${locale.value}:${value.id}`,
			},
		}).runtime.value!;
		const field = runtime.definition.getField(ids.collocationsField()) as unknown as {
			annotationOptions: Array<{ value: string; label: () => string }>;
			createAnnotationField: Parameters<typeof createCollocationSimpleFieldNode>[0]['createAnnotationField'];
			defaultAnnotation: string;
			id: string;
		};
		const simpleValueField = createCollocationSimpleFieldNode(field, 'keyword', 'word');

		expect(field.defaultAnnotation).toBe('word');
		expect(field.annotationOptions.map(option => option.value)).toEqual(['word', 'lemma', 'word_or_lemma', 'pos']);
		expect(simpleValueField).toMatchObject({ showLabel: false, controls: 'simple' });
		expect(field.annotationOptions[0].label()).toBe('en:word');
		locale.value = 'nl';
		expect(field.annotationOptions[0].label()).toBe('nl:word');
	});

	test('omits Collocations instead of falling back when the main annotation has no forward index', () => {
		const corpus = createCorpus();
		corpus.allAnnotatedFieldsMap.contents.annotations.word.hasForwardIndex = false;
		const definition = fixture.createRuntime(corpus).definition;

		expect(definition.getRoot().children.map(node => node.id)).toEqual([ids.searchSection(), ids.exploreSection()]);
		expect(definition.getContainer(ids.collocationsSection())).toBeNull();
		expect(definition.getForm(ids.collocationsForm())).toBeNull();
		expect(definition.getField(ids.collocationsField())).toBeNull();
	});

	test('rejects a customized collocation target on unsupported BlackLab versions', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const customFormId = 'custom/collocations-form';
		const unregister = fixture.registry.registerForm({
			customize(form) {
				(form.newForm as (id: string, config: { target: ReturnType<typeof createCollocationTarget> }) => unknown)(customFormId, {
					target: createCollocationTarget('word'),
				});
			},
		});

		try {
			const corpus = createCorpus();
			corpus.runtimeVersion = '4.4.0';
			const definition = fixture.createRuntime(corpus).definition;

			expect(definition.getForm(customFormId)).toBeNull();
			expect(error).toHaveBeenCalledWith(
				'Error in search form graph customization callback:',
				expect.objectContaining({ message: "Collocation form target 'custom/collocations-form' requires BlackLab 5 or newer, or dev; this server reports '4.4.0'." }),
			);
			expect(fixture.createRuntime().definition.getForm(customFormId)).not.toBeNull();
		} finally {
			unregister();
		}
	});

	test('keeps collocation-owned within semantics when the shared search control is hidden', () => {
		const corpus = createCorpus();
		corpus.relations = {
			relations: {},
			spans: {
				l: { count: 1 },
				p: { count: 1 },
			},
		};
		const state = UIStore.getState();
		state.search.shared.within.enabled = true;
		state.search.shared.within.elements = [
			{ value: '', label: 'Document', title: null },
			{ value: 'l', label: 'Line', title: null },
			{ value: 'p', label: 'Paragraph', title: null },
		];
		state.search.shared.within.sentenceElement = 'p';
		const system = fixture.createSystem({
			blacklabApi: createMockApi().blacklabApi,
			corpus,
			translate: createMockTranslate(),
		});
		const initialRuntime = system.runtime.value!;
		expect(initialRuntime.definition.getField(ids.withinField())).not.toBeNull();

		const unregister = fixture.registry.registerForm(form => form.configureWithin({ enabled: false }));

		try {
			const replacementRuntime = system.runtime.value!;
			const collocations = replacementRuntime.definition.getField(ids.collocationsField()) as unknown as {
				defaultWithin: string;
				withinOptions: Array<{ value: string }>;
			};
			expect(replacementRuntime.definition.getField(ids.withinField())).toBeNull();
			expect(collocations.defaultWithin).toBe('p');
			expect(collocations.withinOptions.map(option => option.value)).toEqual(['', 'l', 'p']);

			const restored = readSearchFormState(replacementRuntime, {
				'f.form': ids.collocationsForm(),
				'f.collocations': 'q={s={word;s=god}}',
				within: 'p',
			});
			expect(restored.rawOverrides).not.toHaveProperty('within');
			expect((restored.state[ids.collocationsField()] as CollocationFieldState).within).toBe('p');
			replacementRuntime.state.replaceState(restored);
			const compiled = replacementRuntime.compile(ids.collocationsForm());
			expect(compiled.params).toMatchObject({ within: 'p' });
			expect(compiled.encoded['f.collocations']).not.toContain(';w=');
		} finally {
			unregister();
		}
	});

	test('rebuilds and restores a customized range filter in the collocation form', () => {
		const system = fixture.createSystem({
			blacklabApi: createMockApi().blacklabApi,
			corpus: createCorpus(),
			translate: createMockTranslate(),
		});
		expect(system.runtime.value!.definition.getField('witnessYear-range')).toBeNull();
		const unregister = fixture.registry.registerForm({
			customize(form) {
				form.graph
					.getContainer(form.ids.sharedFilters())!
					.prependChild(
						form.metadataMultiFieldRange(
							{ id: 'witnessYear-range', defaultDisplayName: 'Witness Year' },
							{ id: 'witnessYear-range', fromField: 'witness_year_from', toField: 'witness_year_to', inputType: 'number' },
						),
					);
			},
		});

		try {
			const replacementRuntime = system.runtime.value!;
			const restored = readSearchFormState(replacementRuntime, {
				'f.form': ids.collocationsForm(),
				'f.collocations': 'q={s={word;s=god}}',
				'f.witness_year_from-witness_year_to': 'l=1300;h=1310',
				filter: '(witness_year_from:[1300 TO 1310] AND witness_year_to:[1300 TO 1310])',
			});
			expect(restored.state['witnessYear-range']).toEqual({ low: '1300', high: '1310', mode: 'strict' });
			expect(restored.rawOverrides).not.toHaveProperty('filter');
			replacementRuntime.state.replaceState(restored);
			expect(replacementRuntime.compile(ids.collocationsForm()).params.filter).toBe('(witness_year_from:[1300 TO 1310] AND witness_year_to:[1300 TO 1310])');
		} finally {
			unregister();
		}
	});
});
