import { createMockTranslate } from '@test/mocks/i18n';
import { describe, expect, test } from 'vitest';

import { compileCql, compileFilter } from '@/features/form/model/compile/query-artifact';
import { resultSortController } from '@/features/form/model/controllers';
import { annotationTextController, type AnnotationTextFieldConfig } from '@/features/form/model/controllers/annotation-controller';
import { filterDateController, filterRangeController, filterTextController } from '@/features/form/model/controllers/metadata-filter-controller';
import { resultGroupByController } from '@/features/form/model/controllers/result-controllers';
import { withinAttributeRangeController } from '@/features/form/model/controllers/within-attribute-controller';
import type { FieldController, FieldControllerProps, FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { FormEmission } from '@/features/form/model/types/form-output';
import { booleanNode, filterRange, type CqlPatternNode, type LuceneNode } from '@/features/form/model/types/form-query-ir';
import { type FormFieldNode } from '@/features/form/model/types/form-shape';

import { createTestContext } from './helpers';

import SelectField from '@/features/form/fields/generic/SelectField.vue';

describe('field query emissions', () => {
	const context: FormRuntimeContext = {
		corpus: { indexId: '', textDirection: 'ltr' },
		translate: createMockTranslate(),
	};

	function collect<State, Extra>(controller: FieldController<string, State, Extra>, config: FieldControllerProps<Extra>, state: State): FormEmission[] {
		const emissions: FormEmission[] = [];
		controller.collect(config, context, state, (name, value) => emissions.push({ name, value } as FormEmission));
		return emissions;
	}

	function patt<State, Extra>(controller: FieldController<string, State, Extra>, config: FieldControllerProps<Extra>, state: State): CqlPatternNode | null {
		return (collect(controller, config, state).find(emission => emission.name === 'patt')?.value as CqlPatternNode | undefined) ?? null;
	}

	function lucene<State, Extra>(controller: FieldController<string, State, Extra>, config: FieldControllerProps<Extra>, state: State): LuceneNode | null {
		return (collect(controller, config, state).find(emission => emission.name === 'filter')?.value as LuceneNode | undefined) ?? null;
	}

	function annotationConfig(annotationId: string): FieldControllerProps<AnnotationTextFieldConfig> {
		return { annotationId, displayName: annotationId, id: annotationId, kind: 'field' };
	}

	test('text fields tokenize input and preserve wildcard intent', () => {
		const pattern = patt(annotationTextController, annotationConfig('lemma'), {
			caseSensitive: false,
			value: '"this is" a?|example sentence* ',
		});
		expect(pattern && compileCql(pattern)).toBe('[lemma="this is"] [lemma="a.|example"] [lemma="sentence.*"]');
	});

	test('metadata text fields distinguish quoted literals from wildcards', () => {
		const node = lucene(filterTextController, { kind: 'field', id: 'author', displayName: 'Author', metadataFieldId: 'author' }, { value: 'Alice* "Bob?"', caseSensitive: false });
		expect(node && compileFilter(node)).toBe(String.raw`author:(/Alice.*|Bob\?/)`);
	});

	test('date fields compose bifield ranges', () => {
		const node = lucene(
			filterDateController,
			{ kind: 'field', id: 'period', displayName: 'Period', fromField: 'start', toField: 'end', range: true },
			{
				startDate: { y: '2020', m: '', d: '' },
				endDate: { y: '2021', m: '', d: '' },
				mode: 'permissive',
			},
		);
		expect(node).toEqual(booleanNode('or', [filterRange('start', '20200101', '20211231')!, filterRange('end', '20200101', '20211231')!]));
		expect(node && compileFilter(node)).toBe('(start:[20200101 TO 20211231] OR end:[20200101 TO 20211231])');
	});

	test.each([
		['empty', ' ', '\t', null, null],
		['low only', ' 7 ', '', ['0007', '9999'], 'year:[0007 TO 9999]'],
		['high only', '', ' 9 ', ['0', '0009'], 'year:[0 TO 0009]'],
		['both', '12', '345', ['0012', '0345'], 'year:[0012 TO 0345]'],
		['already padded and longer', '0007', '12345', ['0007', '12345'], 'year:[0007 TO 12345]'],
		['signed and decimal', '-2', '3.5', ['-2', '3.5'], 'year:[-2 TO 3.5]'],
		['text', 'N/A', 'unknown', ['N/A', 'unknown'], 'year:[N/A TO unknown]'],
	] as const)('normalizes %s metadata range bounds', (_name, low, high, expected, compiled) => {
		const node = lucene(filterRangeController, { kind: 'field', id: 'year', displayName: 'Year', metadataFieldId: 'year' }, { low, high, mode: 'strict' });
		expect(node).toEqual(expected ? { type: 'lucene-field', field: 'year', valueType: 'range', low: expected[0], high: expected[1] } : null);
		expect(node ? compileFilter(node) : null).toBe(compiled);
	});

	test.each([
		['strict', 'and', '(start:[0007 TO 0012] AND end:[0007 TO 0012])'],
		['permissive', 'or', '(start:[0007 TO 0012] OR end:[0007 TO 0012])'],
	] as const)('uses %s mode only to combine identical bifield range bounds', (mode, operator, compiled) => {
		const node = lucene(filterRangeController, { kind: 'field', id: 'period', displayName: 'Period', fromField: 'start', toField: 'end' }, { low: ' 7 ', high: '12', mode });
		expect(node).toEqual({
			type: operator,
			children: [
				{ type: 'lucene-field', field: 'start', valueType: 'range', low: '0007', high: '0012' },
				{ type: 'lucene-field', field: 'end', valueType: 'range', low: '0007', high: '0012' },
			],
		});
		expect(compileFilter(node!)).toBe(compiled);
	});

	test.each([
		['low', { low: ' 3 ', high: '', mode: 'strict' as const }, { low: '3', high: '9999' }, '<p n=in[3,9999]/>'],
		['high', { low: '', high: ' 5 ', mode: 'strict' as const }, { low: '0', high: '5' }, '<p n=in[0,5]/>'],
	] as const)('defaults the missing %s-side within range bound without padding', (_name, state, bounds, expected) => {
		const pattern = patt(withinAttributeRangeController, { kind: 'field', id: 'n', displayName: 'Number', elementName: 'p', attributeName: 'n' }, state);
		expect(pattern).toEqual({
			type: 'cql-within',
			element: 'p',
			attributes: { n: { valueType: 'range', low: bounds.low, high: bounds.high } },
		});
		expect(pattern && compileCql(pattern)).toBe(expected);
	});

	test('text fields preserve escaped wildcards and backslashes', () => {
		const pattern = patt(annotationTextController, annotationConfig('lemma'), {
			caseSensitive: true,
			value: String.raw`a\*b c\?d e\\f`,
		});
		expect(pattern && compileCql(pattern)).toBe(String.raw`[lemma="(?-i)a\*b"] [lemma="(?-i)c\?d"] [lemma="(?-i)e\\\\f"]`);
	});

	test('pre-escaped quotes do not suppress tokenization', () => {
		const pattern = patt(annotationTextController, annotationConfig('word'), {
			caseSensitive: true,
			value: String.raw`sentence with \"pre-escaped quotes\"`,
		});
		expect(pattern && compileCql(pattern)).toBe(String.raw`[word="(?-i)sentence"] [word="(?-i)with"] [word="(?-i)\"pre-escaped"] [word="(?-i)quotes\""]`);
	});
});

describe('result control emissions', () => {
	function collectController(controller: typeof resultGroupByController | typeof resultSortController, state: string): FormEmission[] {
		const field = { kind: 'field', id: 'field', displayName: 'Field', options: [], persistKey: 'field', controller, component: SelectField } as unknown as FormFieldNode;
		const emissions: FormEmission[] = [];
		controller.collect(field as never, createTestContext(), state, (name, value) => emissions.push({ name, value } as FormEmission));
		return emissions;
	}

	test('group-by controller emits a one-item group output', () => {
		expect(collectController(resultGroupByController, 'field:date')).toEqual([{ name: 'group', value: ['field:date'] }]);
	});

	test('sort controller emits a one-item sort output', () => {
		expect(collectController(resultSortController, 'field:title')).toEqual([{ name: 'sort', value: ['field:title'] }]);
	});
});
