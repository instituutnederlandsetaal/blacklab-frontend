import { createMockApi } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { describe, expect, test } from 'vitest';

import type { Corpus } from '@/app/state/useCorpusContext';
import {
	AnnotationPosField,
	CheckboxField,
	DateField,
	LexiconField,
	ParallelField,
	QueryBuilderField,
	RadioField,
	RangeField,
	RawCqlField,
	SelectField,
	TextField,
	TokenSequenceField,
	WithinField,
	getFieldPersistKey,
	getFieldQueryContribution,
	type FormFieldNode,
	type FormRuntimeContext,
} from '@/features/form';
import { compileQueryIR } from '@/features/form/model/compile/query-artifact';
import type { SearchFormConfiguration } from '@/features/search/model/search-form-configuration';
import { createSearchFormNodeConstructors, type SearchFormNodeConstructors, type SearchFormNodeOptions } from '@/features/search/model/search-form-node-factory';
import type { NormalizedAnnotation, NormalizedMetadataField, Tagset } from '@/types/apptypes';

const translate = createMockTranslate();

function annotation(id: string, overrides: Partial<NormalizedAnnotation> = {}): NormalizedAnnotation {
	return {
		annotatedFieldId: 'contents',
		caseSensitive: false,
		defaultDescription: `${id} description`,
		defaultDisplayName: id,
		hasForwardIndex: true,
		id,
		isInternal: false,
		isMainAnnotation: id === 'word',
		offsetsAlternative: '',
		uiType: 'text',
		...overrides,
	};
}

function metadata(id: string, overrides: Partial<NormalizedMetadataField> = {}): NormalizedMetadataField {
	return {
		defaultDescription: `${id} description`,
		defaultDisplayName: id,
		id,
		uiType: 'text',
		...overrides,
	};
}

const annotations = {
	autoSelect: annotation('autoSelect', { uiType: 'select', values: [{ value: 'NOU', label: 'Noun', title: null }] }),
	autoText: annotation('autoText'),
	lemma: annotation('lemma'),
	lexicon: annotation('lexicon', { uiType: 'lexicon' }),
	pos: annotation('pos', { subAnnotations: ['number'], uiType: 'pos' }),
	number: annotation('number', { parentAnnotationId: 'pos' }),
	word: annotation('word'),
};

const metadataFields = {
	autocomplete: metadata('autocomplete', { uiType: 'combobox' }),
	checkbox: metadata('checkbox', { uiType: 'checkbox', values: [{ value: 'one', label: 'One', title: null }] }),
	date: metadata('date', { uiType: 'date' }),
	radio: metadata('radio', { uiType: 'radio', values: [{ value: 'one', label: 'One', title: null }] }),
	range: metadata('range', { uiType: 'range' }),
	select: metadata('select', { uiType: 'select', values: [{ value: 'one', label: 'One', title: null }] }),
	text: metadata('text'),
};

const tagset: Tagset = {
	subAnnotations: {
		number: { displayName: 'Number', id: 'number', values: [{ displayName: 'Singular', value: 'sg' }] },
	},
	values: {
		NOU: { displayName: 'Noun', subAnnotationIds: ['number'], value: 'NOU' },
	},
};

const corpus = {
	allAnnotatedFieldsMap: { contents: { annotations } },
	allAnnotationsMap: annotations,
	allMetadataFieldsMap: metadataFields,
	annotatedFields: { contents: { annotations } },
	annotationGroups: [{ annotatedFieldId: 'contents', entries: ['word', 'lemma', 'pos'], id: 'Annotations', isRemainderGroup: false }],
	id: 'test-corpus',
	isParallelCorpus: false,
	mainAnnotatedField: 'contents',
	parallelAnnotatedFields: [],
	relations: { relations: {}, spans: { speech: { attributes: { role: {} }, count: 1 } } },
	textDirection: 'ltr',
} as unknown as Corpus;

const configuration = {
	alignBy: { defaultValue: '', elements: [], enabled: false },
	customization: { within: {}, withinAttributes: [] },
	lexiconDatabase: 'lexicon',
	queryBuilder: { annotationIds: ['word', 'lemma', 'pos'], defaultAnnotationId: 'word', enabled: true },
	within: { elements: [], enabled: true },
} as unknown as SearchFormConfiguration;

const runtimeContext: FormRuntimeContext = {
	corpus: { indexId: corpus.id, isParallelCorpus: false, textDirection: corpus.textDirection },
	translate,
};

function createFactory(withTagset: Tagset | null = tagset) {
	return createSearchFormNodeConstructors({
		blacklabApi: createMockApi().blacklabApi,
		configuration,
		corpus,
		tagset: withTagset ?? undefined,
		translate,
	});
}

function fieldShape(field: FormFieldNode) {
	return {
		component: field.component,
		controller: field.controller.kind,
		persistKey: getFieldPersistKey(field, runtimeContext),
	};
}

describe('search form semantic node factory', () => {
	test('keeps reusable node constructors separate from built-in blueprint construction', () => {
		const factory = createFactory();
		const hasNoPrivateNodeOption: Extract<keyof SearchFormNodeOptions, 'inheritedVariant'> extends never ? true : false = true;
		const hasNoBlueprintConstructor: Extract<keyof SearchFormNodeConstructors, 'queryBuilder' | 'within' | 'ngramTokens'> extends never ? true : false = true;

		expect(hasNoPrivateNodeOption).toBe(true);
		expect(hasNoBlueprintConstructor).toBe(true);
		expect(factory.nodes).toHaveProperty('annotation');
		expect(factory.nodes).toHaveProperty('metadataMultiFieldRange');
		expect(factory.nodes).not.toHaveProperty('queryBuilder');
		expect(factory.nodes).not.toHaveProperty('within');
		expect(factory.blueprint).toHaveProperty('queryBuilder');
		expect(factory.blueprint).toHaveProperty('within');
	});

	test('constructs each dedicated annotation control without choosing a parent', () => {
		const factory = createFactory();
		const choices = [{ value: 'NOU', label: 'Noun' }];
		const fields = {
			autocomplete: factory.nodes.annotationAutocomplete('lemma', { id: 'annotation.autocomplete' }),
			lexicon: factory.nodes.annotationLexicon('lemma', { id: 'annotation.lexicon' }),
			pos: factory.nodes.annotationPos('pos', { groupId: 'Grammar', id: 'annotation.pos' }),
			select: factory.nodes.annotationSelect('pos', { id: 'annotation.select', options: choices }),
			text: factory.nodes.annotationText('word', { id: 'annotation.text' }),
		};

		expect(Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, fieldShape(field)]))).toEqual({
			autocomplete: { component: TextField, controller: 'annotation-text', persistKey: 'lemma' },
			lexicon: { component: LexiconField, controller: 'annotation-text', persistKey: 'lemma' },
			pos: { component: AnnotationPosField, controller: 'annotation-pos', persistKey: 'pos' },
			select: { component: SelectField, controller: 'annotation-select', persistKey: 'pos' },
			text: { component: TextField, controller: 'annotation-text', persistKey: 'word' },
		});
		expect((fields.text as FormFieldNode & { autocomplete?: unknown }).autocomplete).toBeUndefined();
		expect((fields.autocomplete as FormFieldNode & { autocomplete?: unknown }).autocomplete).toBeTypeOf('function');
		expect((fields.pos as FormFieldNode & { groupId?: string }).groupId).toBe('Grammar');
	});

	test('uses the automatic annotation constructor only for corpus widget selection', () => {
		const factory = createFactory();

		expect(factory.nodes.annotation('autoText', { id: 'auto.text' }).component).toBe(TextField);
		expect(factory.nodes.annotation('autoSelect', { id: 'auto.select' }).component).toBe(SelectField);
		expect(factory.nodes.annotation({ annotatedFieldId: 'contents', id: 'pos' }, { id: 'auto.pos' }).component).toBe(AnnotationPosField);
		expect(factory.nodes.annotation('lexicon', { id: 'auto.lexicon' }).component).toBe(LexiconField);

		const fallback = createFactory(null).nodes.annotation('pos', { id: 'auto.pos-fallback' }) as FormFieldNode & { autocomplete?: unknown };
		expect(fallback.component).toBe(TextField);
		expect(fallback.autocomplete).toBeTypeOf('function');
	});

	test('constructs dedicated metadata controls with stable backing-field persistence', () => {
		const factory = createFactory();
		const semanticField = metadata('publication');
		const choices = [{ value: 'book', label: 'Book' }];
		const fields = {
			autocomplete: factory.nodes.metadataAutocomplete(semanticField, { id: 'metadata.autocomplete', metadataFieldId: 'title' }),
			checkbox: factory.nodes.metadataCheckbox(semanticField, { id: 'metadata.checkbox', metadataFieldId: 'type', options: choices }),
			date: factory.nodes.metadataDate(semanticField, { id: 'metadata.date', metadataFieldId: 'date' }),
			multiDate: factory.nodes.metadataMultiFieldDate(semanticField, { fromField: 'date-start', id: 'metadata.multi-date', toField: 'date-end' }),
			multiRange: factory.nodes.metadataMultiFieldRange(semanticField, { fromField: 'year-start', id: 'metadata.multi-range', toField: 'year-end' }),
			radio: factory.nodes.metadataRadio(semanticField, { id: 'metadata.radio', metadataFieldId: 'type', options: choices }),
			range: factory.nodes.metadataRange(semanticField, { id: 'metadata.range', metadataFieldId: 'year' }),
			select: factory.nodes.metadataSelect(semanticField, { id: 'metadata.select', metadataFieldId: 'type', options: choices }),
			text: factory.nodes.metadataText(semanticField, { id: 'metadata.text', metadataFieldId: 'title' }),
		};

		expect(Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, fieldShape(field)]))).toEqual({
			autocomplete: { component: TextField, controller: 'metadata-filter-text', persistKey: 'title' },
			checkbox: { component: CheckboxField, controller: 'metadata-filter-checkbox', persistKey: 'type' },
			date: { component: DateField, controller: 'metadata-filter-date', persistKey: 'date' },
			multiDate: { component: DateField, controller: 'metadata-filter-date', persistKey: 'date-start-date-end' },
			multiRange: { component: RangeField, controller: 'metadata-filter-range', persistKey: 'year-start-year-end' },
			radio: { component: RadioField, controller: 'metadata-filter-radio', persistKey: 'type' },
			range: { component: RangeField, controller: 'metadata-filter-range', persistKey: 'year' },
			select: { component: SelectField, controller: 'metadata-filter-select', persistKey: 'type' },
			text: { component: TextField, controller: 'metadata-filter-text', persistKey: 'title' },
		});
		expect((fields.multiRange as FormFieldNode & { showMode?: boolean }).showMode).toBe(true);
	});

	test('maps automatic metadata fields to the same dedicated constructors', () => {
		const factory = createFactory();
		const cases: Array<[string, unknown, string]> = [
			['text', TextField, 'metadata-filter-text'],
			['autocomplete', TextField, 'metadata-filter-text'],
			['select', SelectField, 'metadata-filter-select'],
			['checkbox', CheckboxField, 'metadata-filter-checkbox'],
			['radio', RadioField, 'metadata-filter-radio'],
			['range', RangeField, 'metadata-filter-range'],
			['date', DateField, 'metadata-filter-date'],
		];

		for (const [fieldId, component, controller] of cases) {
			const node = factory.nodes.metadata(fieldId, { id: `auto.metadata.${fieldId}` });
			expect(fieldShape(node)).toEqual({ component, controller, persistKey: fieldId });
		}
	});

	test('constructs dedicated within-attribute controls and keeps their filter summaries static', () => {
		const factory = createFactory();
		const attribute = {
			attributeName: 'role',
			defaultDisplayName: 'Role',
			elementName: 'speech',
			id: 'speech-role',
		};
		const options = [{ value: 'host', label: 'Host' }];
		const text = factory.nodes.withinText(attribute, { groupId: 'Spans', id: 'within.text' });
		const select = factory.nodes.withinSelect(attribute, { groupId: 'Spans', id: 'within.select', options });
		const range = factory.nodes.withinRange(attribute, { groupId: 'Spans', id: 'within.range' });

		expect([fieldShape(text), fieldShape(select), fieldShape(range)]).toEqual([
			{ component: TextField, controller: 'within-attribute-text', persistKey: 'within:speech:role' },
			{ component: SelectField, controller: 'within-attribute-select', persistKey: 'within:speech:role' },
			{ component: RangeField, controller: 'within-attribute-range', persistKey: 'within:speech:role' },
		]);

		const contribution = getFieldQueryContribution(select, runtimeContext, ['host']);
		expect(compileQueryIR(contribution).patt).toBe('<speech role="host"/>');
		expect(contribution.summaries).toEqual([{ group: 'Spans', label: 'Role', summaryType: ['filter'], value: 'Host' }]);
	});

	test('multi-field date controls target both backing fields in the selected mode', () => {
		const field = createFactory().nodes.metadataMultiFieldDate(metadata('publication'), {
			fromField: 'startYear',
			groupId: 'Dates',
			id: 'publication-period',
			toField: 'endYear',
		});
		const contribution = getFieldQueryContribution(field, runtimeContext, {
			endDate: { d: '', m: '', y: '2021' },
			mode: 'permissive',
			startDate: { d: '', m: '', y: '2020' },
		});

		expect(compileQueryIR(contribution).filter).toBe('(startYear:[20200101 TO 20211231] OR endYear:[20200101 TO 20211231])');
		expect(contribution.summaries).toEqual([{ group: 'Dates', label: 'publication', summaryType: ['filter'], value: '2020-00-00 - 2021-00-00' }]);
	});

	test('constructs standard query fields with their established components, persistence, and defaults', () => {
		const factory = createFactory();
		const choices = [{ value: 'word', label: 'Word' }];
		const labels = { word: 'Word' };
		const expert = factory.blueprint.expertQuery({ id: 'query.expert' });
		const within = factory.blueprint.within({ id: 'query.within' });
		if (!within) throw new Error('Expected configured within field.');
		const fields = {
			corporaDisplayMode: factory.blueprint.exploreCorporaGroupDisplayMode({ id: 'explore.corpora-display' }),
			corporaGroupBy: factory.blueprint.exploreCorporaGroupBy({ defaultValue: 'field:author', id: 'explore.corpora-group', options: [{ value: 'field:author', label: 'Author' }] }),
			expert,
			frequency: factory.blueprint.frequencyAnnotation({ annotationLabels: labels, defaultAnnotationId: 'word', id: 'explore.frequency', options: choices }),
			ngramGroup: factory.blueprint.ngramGroupAnnotation({ annotationLabels: labels, defaultAnnotationId: 'word', id: 'explore.ngram-group', options: choices }),
			ngramTokens: factory.blueprint.ngramTokens({ defaultFieldId: 'word', defaultLength: 2, id: 'explore.ngram-tokens', maxLength: 5, minLength: 1, selectorOptions: choices }),
			parallel: factory.blueprint.parallelQuery({ childFieldTemplate: expert, id: 'query.parallel' }),
			queryBuilder: factory.blueprint.queryBuilder({ id: 'query.advanced' }),
			within,
		};

		expect(Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, fieldShape(field)]))).toEqual({
			corporaDisplayMode: { component: SelectField, controller: 'result-group-display-mode', persistKey: 'explore-corpora-group-display-mode' },
			corporaGroupBy: { component: SelectField, controller: 'result-group-by', persistKey: 'explore-corpora-group-by' },
			expert: { component: RawCqlField, controller: 'raw-cql-query', persistKey: 'query' },
			frequency: { component: SelectField, controller: 'explore-frequency-annotation', persistKey: 'explore-frequency-annotation' },
			ngramGroup: { component: SelectField, controller: 'explore-ngram-group-annotation', persistKey: 'explore-ngram-group-by' },
			ngramTokens: { component: TokenSequenceField, controller: 'token-sequence', persistKey: 'explore-ngram-tokens' },
			parallel: { component: ParallelField, controller: 'parallel', persistKey: 'parallel' },
			queryBuilder: { component: QueryBuilderField, controller: 'cql-query-builder', persistKey: 'query' },
			within: { component: WithinField, controller: 'within', persistKey: 'within' },
		});

		expect(Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, field.controller.createDefaultState(field, runtimeContext)]))).toMatchObject({
			corporaDisplayMode: 'table',
			corporaGroupBy: 'field:author',
			expert: '',
			frequency: 'word',
			ngramGroup: 'word',
			ngramTokens: [
				{ fieldId: 'word', fieldState: { caseSensitive: false, value: '' } },
				{ fieldId: 'word', fieldState: { caseSensitive: false, value: '' } },
			],
			parallel: { alignBy: null, childStates: {}, source: null, targets: [] },
			queryBuilder: { tokens: expect.any(Array) },
			within: { attributes: {}, element: null },
		});
	});
});
