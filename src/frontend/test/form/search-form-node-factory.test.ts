import { createMockApi } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { describe, expect, test } from 'vitest';

import { searchFormAnnotationControlKey } from '@/customization-api/shared/form/ids';
import { createSearchFormNodeConstructors } from '@/customization-api/shared/form/node-constructors';
import {
	AnnotationPosField,
	CheckboxField,
	DateField,
	LexiconField,
	RadioField,
	RangeField,
	SelectField,
	TextField,
	getFieldPersistKey,
	getFieldQueryContribution,
	type FormFieldNode,
	type FormRuntimeContext,
} from '@/features/form';
import { compileQueryIR } from '@/features/form/model/compile/query-artifact';
import type { Corpus } from '@/types/apptypes';
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

const annotationControls: Record<string, 'text' | 'autocomplete' | 'select' | 'lexicon' | 'pos'> = {};
const customizations = {
	searchFormAnnotationControl: (annotationId: string, annotatedFieldId?: string) => annotationControls[searchFormAnnotationControlKey(annotationId, annotatedFieldId)] ?? null,
	searchFormLexiconDatabase: () => 'lexicon',
};

const runtimeContext: FormRuntimeContext = {
	corpus: { indexId: corpus.id, isParallelCorpus: false, textDirection: corpus.textDirection },
	translate,
};

function createFactory(withTagset: Tagset | null = tagset) {
	return createSearchFormNodeConstructors({
		blacklabApi: createMockApi().blacklabApi,
		corpus,
		customizations,
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
	test('exposes only reusable public node constructors', () => {
		const factory = createFactory();

		expect(factory).toHaveProperty('annotation');
		expect(factory).toHaveProperty('metadataMultiFieldRange');
		expect(factory).not.toHaveProperty('queryBuilder');
		expect(factory).not.toHaveProperty('within');
	});

	test('maps explicit annotation constructors to their components, controllers, and persistence', () => {
		const factory = createFactory();
		const choices = [{ value: 'NOU', label: 'Noun' }];
		const fields = {
			autocomplete: factory.annotationAutocomplete('lemma', { id: 'annotation.autocomplete' }),
			lexicon: factory.annotationLexicon('lemma', { id: 'annotation.lexicon' }),
			pos: factory.annotationPos('pos', { groupId: 'Grammar', id: 'annotation.pos' }),
			select: factory.annotationSelect('pos', { id: 'annotation.select', options: choices }),
			text: factory.annotationText('word', { id: 'annotation.text' }),
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

		expect(factory.annotation('autoText', { id: 'auto.text' }).component).toBe(TextField);
		expect(factory.annotation('autoSelect', { id: 'auto.select' }).component).toBe(SelectField);
		expect(factory.annotation({ annotatedFieldId: 'contents', id: 'pos' }, { id: 'auto.pos' }).component).toBe(AnnotationPosField);
		expect(factory.annotation('lexicon', { id: 'auto.lexicon' }).component).toBe(LexiconField);

		const fallback = createFactory(null).annotation('pos', { id: 'auto.pos-fallback' }) as FormFieldNode & { autocomplete?: unknown };
		expect(fallback.component).toBe(TextField);
		expect(fallback.autocomplete).toBeTypeOf('function');
	});

	test('uses configured annotation controls before the corpus ui type', () => {
		const key = searchFormAnnotationControlKey('word');
		annotationControls[key] = 'autocomplete';
		try {
			const overridden = createFactory().annotation('word', { id: 'configured.word' }) as FormFieldNode & { autocomplete?: unknown };
			expect(overridden.component).toBe(TextField);
			expect(overridden.autocomplete).toBeTypeOf('function');
		} finally {
			delete annotationControls[key];
		}
	});

	test('constructs dedicated metadata controls with stable backing-field persistence', () => {
		const factory = createFactory();
		const semanticField = metadata('publication');
		const choices = [{ value: 'book', label: 'Book' }];
		const fields = {
			autocomplete: factory.metadataAutocomplete(semanticField, { id: 'metadata.autocomplete', metadataFieldId: 'title' }),
			checkbox: factory.metadataCheckbox(semanticField, { id: 'metadata.checkbox', metadataFieldId: 'type', options: choices }),
			date: factory.metadataDate(semanticField, { id: 'metadata.date', metadataFieldId: 'date' }),
			multiDate: factory.metadataMultiFieldDate(semanticField, { fromField: 'date-start', id: 'metadata.multi-date', toField: 'date-end' }),
			multiRange: factory.metadataMultiFieldRange(semanticField, { fromField: 'year-start', id: 'metadata.multi-range', toField: 'year-end' }),
			radio: factory.metadataRadio(semanticField, { id: 'metadata.radio', metadataFieldId: 'type', options: choices }),
			range: factory.metadataRange(semanticField, { id: 'metadata.range', metadataFieldId: 'year' }),
			select: factory.metadataSelect(semanticField, { id: 'metadata.select', metadataFieldId: 'type', options: choices }),
			text: factory.metadataText(semanticField, { id: 'metadata.text', metadataFieldId: 'title' }),
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
			const node = factory.metadata(fieldId, { id: `auto.metadata.${fieldId}` });
			expect(fieldShape(node)).toEqual({ component, controller, persistKey: fieldId });
		}
	});

	test('maps dedicated within-attribute constructors to their components, controllers, and persistence', () => {
		const factory = createFactory();
		const attribute = {
			attributeName: 'role',
			defaultDisplayName: 'Role',
			elementName: 'speech',
			id: 'speech-role',
		};
		const options = [{ value: 'host', label: 'Host' }];
		const text = factory.withinText(attribute, { groupId: 'Spans', id: 'within.text' });
		const select = factory.withinSelect(attribute, { groupId: 'Spans', id: 'within.select', options });
		const range = factory.withinRange(attribute, { groupId: 'Spans', id: 'within.range' });

		expect([fieldShape(text), fieldShape(select), fieldShape(range)]).toEqual([
			{ component: TextField, controller: 'within-attribute-text', persistKey: 'within:speech:role' },
			{ component: SelectField, controller: 'within-attribute-select', persistKey: 'within:speech:role' },
			{ component: RangeField, controller: 'within-attribute-range', persistKey: 'within:speech:role' },
		]);
	});

	test('within-attribute select compiles its semantic target and summary', () => {
		const attribute = {
			attributeName: 'role',
			defaultDisplayName: 'Role',
			elementName: 'speech',
			id: 'speech-role',
		};
		const select = createFactory().withinSelect(attribute, {
			groupId: 'Spans',
			id: 'within.select',
			options: [{ value: 'host', label: 'Host' }],
		});

		const contribution = getFieldQueryContribution(select, runtimeContext, ['host']);
		expect(compileQueryIR(contribution).patt).toBe('<speech role="host"/>');
		expect(contribution.summaries).toEqual([{ group: 'Spans', label: 'Role', summaryType: ['filter'], value: 'Host' }]);
	});

	test('forwards both backing fields and date-mode configuration to multi-field date nodes', () => {
		const field = createFactory().metadataMultiFieldDate(metadata('publication'), {
			fromField: 'startYear',
			id: 'publication-period',
			mode: 'strict',
			range: false,
			toField: 'endYear',
		});

		expect(field).toMatchObject({ fromField: 'startYear', mode: 'strict', range: false, toField: 'endYear' });
	});
});
