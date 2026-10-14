// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import * as UIStore from '@/app/state/ui-state';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import { searchFormIds as ids } from '@/customization-api/shared/form/ids';
import type { CqlQueryBuilderData } from '@/features/cql-query-builder/model';
import { RangeField, SelectField, TextField } from '@/features/form';
import { createSearchFormSystem } from '@/features/search/model/new-form/search-form-system';

import { createCorpus, createSearchFormFixture, type SearchFormFixture } from './search-form-fixture';

import { optionLabel, optionValues, type Options, type OptionText } from '@/shared/utils/options';

let fixture: SearchFormFixture;

beforeEach(() => {
	fixture = createSearchFormFixture();
});

afterEach(() => {
	fixture.scope.stop();
	vi.restoreAllMocks();
});

function createCustomizedWithinRuntime() {
	const corpus = createCorpus();
	const registry = createCustomizationRegistry(corpus);
	registry.registerForm(form => {
		form.addSpanFilter({ elementName: 'speech', attributeName: 'person', control: 'text', groupId: 'Bibliographic', insertBefore: 'author', defaultDisplayName: 'Speaker' });
		form.addSpanFilter({ elementName: 'speech', attributeName: 'role', control: 'select', options: [{ value: 'host', label: 'Host' }], groupId: 'Span filters', defaultDisplayName: 'Role' });
		form.addSpanFilter({ elementName: 'p', attributeName: 'n', control: 'range', groupId: 'Span filters', defaultDisplayName: 'Paragraph' });
	});
	const runtime = fixture.scope.run(
		() =>
			createSearchFormSystem({
				blacklabApi: createMockApi().blacklabApi,
				corpus,
				customizations: createCustomizations(registry, corpus, UIStore.getState, UIStore.actions.results.shared.concordanceAnnotationId),
				translate: createMockTranslate(),
			}).runtime.value!,
	)!;
	return { personFieldId: ids.withinFilter('speech', 'person'), runtime };
}

describe('Search form customization', () => {
	test('applies metadata visibility customization and falls back from a hidden configured default', () => {
		vi.spyOn(fixture.registry.legacyApi.value!.search.metadata, 'showField').mockImplementation(id => id !== 'author');
		const runtime = fixture.createRuntime();
		const field = runtime.definition.getField(ids.exploreCorporaGroupBy()) as unknown as { options: Options };

		expect(runtime.definition.getField(ids.metadataFilter('author'))).toBeNull();
		expect(optionValues(field.options)).toEqual(['field:genre']);
		expect(runtime.state.state.value[ids.exploreCorporaGroupBy()]).toBe('field:genre');
	});

	test('places customized within attributes and maps their generic controls', () => {
		const { personFieldId, runtime } = createCustomizedWithinRuntime();
		expect(runtime.definition.getContainer(ids.filterTab('Bibliographic'))?.children.map(node => node.id)).toEqual([personFieldId, ids.metadataFilter('author')]);
		expect(runtime.definition.getField(personFieldId)?.component).toBe(TextField);
		expect(runtime.definition.getField(ids.withinFilter('speech', 'role'))?.component).toBe(SelectField);
		expect(runtime.definition.getField(ids.withinFilter('p', 'n'))?.component).toBe(RangeField);
	});

	test('customized within attributes request span results only when populated', () => {
		const { personFieldId, runtime } = createCustomizedWithinRuntime();
		const rangeFieldId = ids.withinFilter('p', 'n');
		runtime.state.state.value[ids.queryField('expert')] = '[lemma="water"]';
		expect(runtime.compile(ids.searchForm('expert')).params.withspans).toBeUndefined();
		runtime.state.state.value[rangeFieldId] = { low: '  ', high: '\t', mode: 'strict' };
		expect(runtime.compile(ids.searchForm('expert')).params.withspans).toBeUndefined();
		runtime.state.state.value[rangeFieldId] = { low: ' 1 ', high: '', mode: 'strict' };
		expect(runtime.compile(ids.searchForm('expert'))).toMatchObject({
			params: { patt: '([lemma="water"]) within <p n=in[1,9999]/>', withspans: true },
		});
		runtime.state.state.value[rangeFieldId] = { low: '', high: '', mode: 'strict' };
		runtime.state.state.value[personFieldId] = { value: 'Alice*', caseSensitive: false };
		expect(runtime.compile(ids.searchForm('expert')).params).toMatchObject({ withspans: true });
	});

	test('compiles, persists, and summarizes a customized within attribute', () => {
		const { personFieldId, runtime } = createCustomizedWithinRuntime();
		runtime.state.state.value[ids.queryField('expert')] = '[lemma="water"]';
		runtime.state.state.value[personFieldId] = { value: 'Alice*', caseSensitive: false };
		runtime.state.state.value[ids.withinFilter('speech', 'role')] = ['host'];
		const compiled = runtime.compile(ids.searchForm('expert'));

		expect(compiled).toMatchObject({
			params: { patt: '([lemma="water"]) within <speech person="Alice.*" role="host"/>' },
			encoded: {
				'f.within:speech:person': 'Alice*',
			},
		});
		expect(compiled.summaries).toContainEqual({ label: 'Speaker', value: 'Alice*', group: 'Bibliographic', summaryType: ['filter'] });
		expect(compiled.summaries).toContainEqual({ label: 'Role', value: 'Host', group: 'Span filters', summaryType: ['filter'] });
	});

	test('adapts old span-filter definitions through the internal customization API', () => {
		const corpus = createCorpus();
		const registry = createCustomizationRegistry(corpus);
		registry.legacyApi.value!.search.metadata._customTabs.push({
			name: 'Span filters',
			fields: [
				{
					id: 'span:speech:role',
					componentName: 'filter-select',
					behaviourName: 'span-select',
					defaultDisplayName: 'Role',
					metadata: { options: ['host', 'guest'] },
				},
			],
		});
		const customizations = createCustomizations(registry, corpus, UIStore.getState, UIStore.actions.results.shared.concordanceAnnotationId);

		expect(customizations.searchFormSpanFilters()).toMatchObject([
			{
				id: 'span:speech:role',
				elementName: 'speech',
				attributeName: 'role',
				control: { type: 'select', options: [{ value: 'host' }, { value: 'guest' }] },
			},
		]);
	});

	test('runs modern graph customization after applying legacy configuration', () => {
		UIStore.getState().search.simple.searchAnnotationId = 'lemma';
		const observedAnnotations: string[] = [];
		const customFormId = 'custom/search-form';
		const customContainerId = 'custom/search-form/fields';
		const customFieldId = 'custom/search-form/lemma';
		let registered = true;
		const unregister = fixture.registry.registerForm({
			customize(form) {
				const id = form.ids.queryField('simple');
				expect(form.corpus.runtimeVersion).toBe('5.0.0');
				expect(form.corpus.indexerVersion).toBe('4.4.0');
				observedAnnotations.push(`${form.corpus.id}:${(form.graph.getField(id) as unknown as { annotationId: string }).annotationId}`);
				expect(form).not.toHaveProperty('setAnnotationUiType');
				form.graph.replaceNode(id, form.annotationSelect('lemma', { id, options: [{ value: 'run' }] }));
				const fields = form.newContainer(customContainerId, { layout: 'list' }).addChildren(form.annotationText('lemma', { id: customFieldId }));
				const customForm = form.newForm(customFormId, { title: () => form.translate.$t('search.simple.heading') }).addChildren(fields);
				form.graph.getContainer(form.ids.searchFormsContainer())!.addChildren(customForm);
			},
		});

		try {
			const system = fixture.createSystem();
			const customizedRuntime = system.runtime.value!;
			expect(observedAnnotations).toEqual(['test-corpus:lemma']);
			expect(customizedRuntime.definition.getField(ids.queryField('simple'))?.component).toBe(SelectField);
			expect(customizedRuntime.definition.getForm(customFormId)).not.toBeNull();
			expect(customizedRuntime.definition.getContainer(customContainerId)?.children.map(node => node.id)).toEqual([customFieldId]);

			unregister();
			registered = false;
			expect(system.runtime.value!.definition.getField(ids.queryField('simple'))?.component).toBe(TextField);
			expect(system.runtime.value!.definition.getForm(customFormId)).toBeNull();
		} finally {
			if (registered) unregister();
		}
	});

	test('treats callback shorthand as semantic configuration', () => {
		const unregister = fixture.registry.registerForm(form => form.setSimpleAnnotation('lemma'));

		try {
			const definition = fixture.createSystem().runtime.value!.definition;
			expect((definition.getField(ids.queryField('simple')) as unknown as { annotationId: string }).annotationId).toBe('lemma');
		} finally {
			unregister();
		}
	});

	test('continues each customization phase after a callback error', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		let graphCustomizations = 0;
		const unregisterFailing = fixture.registry.registerForm({
			configure() {
				throw new Error('configuration failed');
			},
			customize() {
				throw new Error('graph customization failed');
			},
		});
		const unregisterFollowing = fixture.registry.registerForm({
			configure(form) {
				form.setSimpleAnnotation('lemma');
			},
			customize() {
				graphCustomizations += 1;
			},
		});

		try {
			const definition = fixture.createSystem().runtime.value!.definition;
			expect((definition.getField(ids.queryField('simple')) as unknown as { annotationId: string }).annotationId).toBe('lemma');
			expect(graphCustomizations).toBe(1);
			expect(error).toHaveBeenCalledTimes(2);
			expect(error.mock.calls.map(([message]) => message)).toEqual(['Error in search form configuration callback:', 'Error in search form graph customization callback:']);
		} finally {
			unregisterFailing();
			unregisterFollowing();
		}
	});

	test('uses returned span-filter IDs for ordering and replaces filters in place', () => {
		const unregister = fixture.registry.registerForm(form => {
			const roleId = form.addSpanFilter({ elementName: 'speech', attributeName: 'role', control: 'text', groupId: 'Classification' });
			form.addSpanFilter({ elementName: 'speech', attributeName: 'speaker', control: 'text', groupId: 'Classification', insertBefore: roleId });
			form.addSpanFilter({ elementName: 'speech', attributeName: 'role', control: 'range', groupId: 'Classification' });
		});

		try {
			const definition = fixture.createSystem().runtime.value!.definition;
			expect(definition.getContainer(ids.filterTab('Classification'))?.children.map(node => node.id)).toEqual([
				ids.metadataFilter('genre'),
				ids.withinFilter('speech', 'speaker'),
				ids.withinFilter('speech', 'role'),
			]);
			expect(definition.getField(ids.withinFilter('speech', 'role'))?.component).toBe(RangeField);
		} finally {
			unregister();
		}
	});

	test('applies modern metadata visibility and restores legacy visibility after unregistering', () => {
		vi.spyOn(fixture.registry.legacyApi.value!.search.metadata, 'showField').mockImplementation(id => id !== 'genre');
		const unregister = fixture.registry.registerForm(form => {
			form.filterMetadataFields(field => field.id !== 'author');
		});

		try {
			const system = fixture.createSystem();
			const exploreGroupBy = system.runtime.value!.definition.getField(ids.exploreCorporaGroupBy()) as unknown as { options: Options };
			expect(system.runtime.value!.definition.getField(ids.metadataFilter('author'))).toBeNull();
			expect(system.runtime.value!.definition.getField(ids.metadataFilter('genre'))).not.toBeNull();
			expect(optionValues(exploreGroupBy.options)).toEqual(['field:genre']);

			unregister();
			const rebuilt = system.runtime.value!.definition;
			expect(rebuilt.getField(ids.metadataFilter('author'))).not.toBeNull();
			expect(rebuilt.getField(ids.metadataFilter('genre'))).toBeNull();
			expect(optionValues((rebuilt.getField(ids.exploreCorporaGroupBy()) as unknown as { options: Options }).options)).toEqual(['field:author']);
		} finally {
			unregister();
		}
	});

	test('applies modern semantic configuration before constructing built-in and custom fields', () => {
		const corpus = createCorpus();
		corpus.allAnnotationsMap.lemma.hasForwardIndex = false;
		corpus.relations.spans = {
			speech: {
				count: 2,
				attributes: {
					role: { valueListComplete: true, values: { guest: 1, host: 1 } },
				},
			},
		};
		let spanFilterNodeId = '';
		const unregister = fixture.registry.registerForm({
			configure(form) {
				form.setSimpleAnnotation('lemma');
				form.setExtendedAnnotations(['pos']);
				form.setAnnotationControl('lemma', 'autocomplete');
				form.configureAdvanced({ annotationIds: ['lemma'], defaultAnnotationId: 'lemma' });
				form.filterMetadataFields(field => field.id !== 'author');
				form.setMetadataFilters(['author', 'genre']);
				form.configureWithin({ enabled: false });
				form.configureExplore({
					searchAnnotationIds: ['lemma'],
					defaultSearchAnnotationId: 'lemma',
					groupAnnotationIds: ['lemma', 'pos'],
					defaultGroupAnnotationId: 'lemma',
					corpora: { groupMetadataIds: ['author', 'genre'], defaultGroupMetadataId: 'genre' },
				});
				spanFilterNodeId = form.addSpanFilter({ elementName: 'speech', attributeName: 'role', groupId: 'Classification' });
			},
			customize(form) {
				const range = form.metadataMultiFieldRange({ id: 'year-range', defaultDisplayName: 'Year' }, { id: 'year-range', fromField: 'year_from', toField: 'year_to', inputType: 'number' });
				form.graph.getContainer(form.ids.filterTab('Classification'))!.insertBefore(range, form.ids.metadataFilter('genre'));
			},
		});

		try {
			const system = fixture.createSystem({
				blacklabApi: createMockApi().blacklabApi,
				corpus,
				translate: createMockTranslate(),
			});
			const runtime = system.runtime.value!;
			const definition = runtime.definition;
			const queryBuilderState = runtime.state.state.value[ids.queryField('advanced')] as CqlQueryBuilderData;
			const queryBuilderAttribute = queryBuilderState.tokens[0].rootAttributeGroup.entries[0];

			expect((definition.getField(ids.queryField('simple')) as unknown as { annotationId: string }).annotationId).toBe('lemma');
			expect((definition.getField(ids.queryField('simple')) as unknown as { autocomplete?: unknown }).autocomplete).toBeTypeOf('function');
			expect(definition.getField(ids.annotationField('extended', 'contents', 'word'))).toBeNull();
			expect(definition.getField(ids.annotationField('extended', 'contents', 'pos'))).not.toBeNull();
			expect('annotationId' in queryBuilderAttribute ? queryBuilderAttribute.annotationId : null).toBe('lemma');
			expect(definition.getField(ids.metadataFilter('author'))).toBeNull();
			expect(definition.getField(ids.metadataFilter('genre'))).not.toBeNull();
			expect(definition.getField(ids.withinField())).toBeNull();
			expect(definition.getField(ids.withinFilter('speech', 'role'))?.component).toBe(SelectField);
			expect(spanFilterNodeId).toBe(ids.withinFilter('speech', 'role'));
			expect(definition.getField('year-range')?.component).toBe(RangeField);
			expect(definition.getContainer(ids.filterTab('Classification'))?.children.map(node => node.id)).toEqual(['year-range', ids.metadataFilter('genre'), ids.withinFilter('speech', 'role')]);
			expect((definition.getField(ids.exploreNgramTokens()) as unknown as { defaultFieldId: string }).defaultFieldId).toBe('lemma');
			expect((definition.getField(ids.exploreNgramGroupBy()) as unknown as { defaultAnnotationId: string }).defaultAnnotationId).toBe('pos');
			expect((definition.getField(ids.exploreCorporaGroupBy()) as unknown as { defaultValue: string }).defaultValue).toBe('field:genre');
		} finally {
			unregister();
		}
	});

	test('normalizes legacy annotation widget overrides before building the form', () => {
		const corpus = createCorpus();
		corpus.allAnnotationsMap.lemma.values = [{ value: 'run', label: 'Run', title: null }];
		vi.spyOn(fixture.registry.legacyApi.value!.search.pattern, 'uiType').mockImplementation((_field, annotationId) => (annotationId === 'lemma' ? ('dropdown' as 'select') : null));

		UIStore.init({ index: corpus } as CorpusContext);

		expect(corpus.allAnnotationsMap.lemma.uiType).toBe('text');
		expect(fixture.createRuntime(corpus).definition.getField(ids.annotationField('extended', 'contents', 'lemma'))?.component).toBe(SelectField);
		expect(corpus.allAnnotationsMap.lemma.uiType).toBe('select');
	});

	test('normalizes legacy within visibility hooks through the customization adapter', () => {
		const corpus = createCorpus();
		corpus.relations = {
			relations: {},
			spans: {
				p: { count: 1 },
				s: {
					count: 1,
					attributes: {
						role: { valueListComplete: true, values: { narrator: 1 } },
						speaker: { valueListComplete: true, values: { Alice: 1 } },
					},
				},
			},
		};
		UIStore.getState().search.shared.within.enabled = true;
		vi.spyOn(fixture.registry.legacyApi.value!.search.within, 'includeSpan').mockImplementation(element => (element === 'p' ? false : null));
		vi.spyOn(fixture.registry.legacyApi.value!.search.within, 'includeAttribute').mockImplementation((_element, attribute) => (attribute === 'speaker' ? true : null));

		const within = fixture.createRuntime(corpus).definition.getField(ids.withinField()) as unknown as {
			options: Array<{ value: string; attributes: Array<{ value: string; label?: OptionText }> }>;
		};

		expect(within.options.map(option => option.value)).toEqual(['', 's']);
		expect(within.options[1].attributes.map(option => option.value)).toEqual(['speaker']);
		expect(within.options[1].attributes.map(optionLabel)).toEqual(['s speaker']);
	});
});
