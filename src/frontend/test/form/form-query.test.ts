// @vitest-environment jsdom

import { createMockTranslate } from '@test/mocks/i18n';
import { describe, expect, test } from 'vitest';

import {
	annotationTextController,
	filterDateController,
	filterTextController,
	parallelController,
	type Emit,
	type FieldController,
	type FieldControllerProps,
	type FormEmission,
	type FormRuntimeContext,
} from '@/features/form';
import { createFormFieldNode, expertQueryController } from '@/features/form';
import { combineCqlPatterns, compileCql, compileFilter } from '@/features/form/model/compile/query-artifact';
import type { AnnotationTextFieldConfig } from '@/features/form/model/controllers/annotation-controller';
import {
	annotation,
	booleanNode,
	containing,
	filter,
	filterRange,
	rangePredicate,
	rawCql,
	textPredicate,
	within,
	type CqlPatternNode,
	type LuceneNode,
} from '@/features/form/model/types/form-query-ir';

import RawCqlField from '@/features/form/fields/RawCqlField.vue';

const context: FormRuntimeContext = {
	corpus: { indexId: '', textDirection: 'ltr' },
	translate: createMockTranslate(),
};

function collect<State, Extra>(controller: FieldController<string, State, Extra>, config: FieldControllerProps<Extra>, state: State): FormEmission[] {
	const emissions: FormEmission[] = [];
	controller.collect(config, context, state, ((name, value) => emissions.push({ name, value } as FormEmission)) as Emit);
	return emissions;
}

function patt<State, Extra>(controller: FieldController<string, State, Extra>, config: FieldControllerProps<Extra>, state: State): CqlPatternNode | null {
	return (collect(controller, config, state).find(emission => emission.name === 'patt')?.value as CqlPatternNode | undefined) ?? null;
}

function lucene<State, Extra>(controller: FieldController<string, State, Extra>, config: FieldControllerProps<Extra>, state: State): LuceneNode | null {
	return (collect(controller, config, state).find(emission => emission.name === 'filter')?.value as LuceneNode | undefined) ?? null;
}

describe('semantic query compilation', () => {
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
		expect(node).toEqual(booleanNode('or', filterRange('start', '20200101', '20211231')!, filterRange('end', '20200101', '20211231')!));
	});

	test('and/or composition folds compatible token predicates', () => {
		const word = annotation('word', 'wildcard', 'water')!;
		const lemma = annotation('lemma', 'wildcard', 'water')!;
		expect(compileCql(combineCqlPatterns([word, lemma], 'and')!)).toBe('[word="water" & lemma="water"]');
		expect(compileCql(combineCqlPatterns([word, lemma], 'or')!)).toBe('[word="water" | lemma="water"]');
	});

	test('sequence composition preserves child order', () => {
		const pattern = combineCqlPatterns([annotation('word', 'literal', 'water')!, annotation('lemma', 'literal', 'flow')!], 'sequence')!;
		expect(compileCql(pattern)).toBe('[word=l"water"] [lemma=l"flow"]');
	});

	test('compiles Lucene conjunctions', () => {
		const node = booleanNode('and', filter('author', 'literal', 'Austen')!, filter('year', 'literal', '1813')!)!;
		expect(compileFilter(node)).toBe('(author:(Austen) AND year:(1813))');
	});

	test('normalizes compatible CQL and Lucene alternatives', () => {
		const cql = booleanNode('or', annotation('word', 'literal', 'a*')!, annotation('word', 'wildcard', 'b*')!)!;
		const lucene = booleanNode('or', filter('author', 'literal', 'A*')!, filter('author', 'wildcard', 'B*')!)!;
		expect(compileCql(cql)).toBe(String.raw`[word="a\*|b.*"]`);
		expect(compileFilter(lucene)).toBe(String.raw`author:(/A\*|B.*/)`);
	});

	test('complete-query wrappers are extracted regardless of graph position', () => {
		const pattern = combineCqlPatterns([rawCql('[word="water"]'), booleanNode<CqlPatternNode>('or', within('speech', { person: textPredicate('wildcard', 'Alice*') }), containing('s'))!], 'sequence')!;
		expect(compileCql(pattern)).toBe('(<s/> containing ([word="water"])) within <speech person="Alice.*"/>');
	});

	test('multiple within nodes merge matching elements and overlap distinct elements', () => {
		const pattern = combineCqlPatterns(
			[
				rawCql('[word="water"]'),
				within('speech', { person: textPredicate('wildcard', 'Alice*') }),
				within('speech', { role: textPredicate('literal', 'host') }),
				within('p', { n: rangePredicate('3', '5') }),
			],
			'and',
		)!;
		expect(compileCql(pattern)).toBe('([word="water"]) within <speech person="Alice.*" role="host"/> overlap <p n=in[3,5]/>');
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

	test('combines uneven token sequences per position', () => {
		const word = patt(annotationTextController, annotationConfig('word'), { caseSensitive: true, value: 'a b' })!;
		const lemma = patt(annotationTextController, annotationConfig('lemma'), { caseSensitive: true, value: 'c d e' })!;
		expect(compileCql(combineCqlPatterns([word, lemma], 'and')!)).toBe(String.raw`[word="(?-i)a" & lemma="(?-i)c"] [word="(?-i)b" & lemma="(?-i)d"] [lemma="(?-i)e"]`);
		expect(compileCql(combineCqlPatterns([word, lemma], 'or')!)).toBe(String.raw`[word="(?-i)a" | lemma="(?-i)c"] [word="(?-i)b" | lemma="(?-i)d"] [lemma="(?-i)e"]`);
	});

	test('preserves precedence for mixed token operators', () => {
		const pattern = booleanNode<CqlPatternNode>('or', booleanNode('and', annotation('word', 'wildcard', 'a')!, annotation('word', 'wildcard', 'b')!)!, annotation('lemma', 'wildcard', 'c')!)!;
		expect(compileCql(pattern)).toBe('[(word="a" & word="b") | lemma="c"]');
	});

	test('keeps comparison and sensitivity semantics separate', () => {
		const pattern = booleanNode(
			'or',
			annotation('word', 'literal', 'a', { caseSensitive: true })!,
			annotation('word', 'literal', 'b', { caseSensitive: false })!,
			annotation('word', 'literal', 'c', { caseSensitive: false, operator: '!=' })!,
		)!;
		expect(compileCql(pattern)).toBe('[word=l"(?-i)a" | word=l"(?i)b" | word!=l"(?i)c"]');
	});

	test('merges compatible negative token predicates under and', () => {
		const options = { caseSensitive: true, operator: '!=' as const };
		const pattern = booleanNode('and', annotation('word', 'literal', 'a', options)!, annotation('word', 'wildcard', 'b*', options)!)!;
		expect(compileCql(pattern)).toBe('[word!="(?-i)a|b.*"]');
	});

	test('merges only adjacent compatible Lucene alternatives', () => {
		const node = booleanNode('or', filter('author', 'literal', 'A|B')!, filter('author', 'wildcard', 'C*')!, filter('title', 'literal', 'D')!, filter('author', 'literal', 'E')!)!;
		expect(compileFilter(node)).toBe(String.raw`(author:(/A\|B|C.*/) OR title:(D) OR author:(E))`);
	});

	test('flattens matching CQL and Lucene boolean operators', () => {
		const cql = booleanNode('and', rawCql('[word="a"]'), booleanNode('and', rawCql('[lemma="b"]'), rawCql('[pos="N"]'))!)!;
		const lucene = booleanNode('and', filter('author', 'literal', 'alice')!, booleanNode('and', filter('title', 'literal', 'water')!, filter('year', 'literal', '2020')!)!)!;
		expect(compileCql(cql)).toBe('([word="a"] & [lemma="b"] & [pos="N"])');
		expect(compileFilter(lucene)).toBe('(author:(alice) AND title:(water) AND year:(2020))');
	});

	test('emits escaped wrapper values, open ranges, and empty tags', () => {
		const people = booleanNode('or', textPredicate('wildcard', 'A"B'), textPredicate('wildcard', 'C?'))!;
		const pattern = combineCqlPatterns([within('speech', { person: people }), within('p', { n: rangePredicate(undefined, '5') }), within('div')], 'and')!;
		expect(compileCql(pattern)).toBe(String.raw`<speech person="A\\"B|C."/> overlap <p n=in[0,5]/> overlap <div/>`);
	});

	test('keeps explicit regex wrapper predicates separate from escaped values', () => {
		const values = booleanNode('or', textPredicate('literal', 'A*'), textPredicate('wildcard', 'B*'), textPredicate('wildcard', String.raw`D\*`), textPredicate('regex', 'C/.+'))!;
		expect(compileCql(within('speech', { person: values }))).toBe(String.raw`<speech (person="A\*|B.*|D\*" | person="C/.+")/>`);
	});

	test('parallel controls emit source and relation patterns', () => {
		const field = {
			id: 'parallel',
			kind: 'field' as const,
			fieldOptions: [{ id: 'contents__en' }, { id: 'contents__nl' }],
			alignByOptions: ['word-alignment'],
			childFieldTemplate: createFormFieldNode('parallel.query', expertQueryController, RawCqlField, {}),
		};
		const emissions = collect(parallelController, field, {
			source: 'contents__en',
			targets: ['contents__nl'],
			alignBy: 'word-alignment',
			childStates: { contents__en: '[lemma="test"]', contents__nl: '[lemma="proef"]' },
		});
		expect(emissions.find(emission => emission.name === 'searchfield')?.value).toBe('contents__en');
		const pattern = emissions.find(emission => emission.name === 'patt')?.value as CqlPatternNode;
		expect(compileCql(pattern)).toBe('[lemma="test"] =word-alignment=>nl? [lemma="proef"]');
	});

	test('parallel controls preserve source-only, multi-target, and empty-branch semantics', () => {
		const field = {
			id: 'parallel',
			kind: 'field' as const,
			fieldOptions: [{ id: 'contents__en' }, { id: 'contents__nl' }, { id: 'contents__de' }],
			alignByOptions: ['word-alignment'],
			childFieldTemplate: createFormFieldNode('parallel.query', expertQueryController, RawCqlField, {}),
		};
		const compileState = (state: Parameters<typeof parallelController.collect>[2]) => {
			const pattern = collect(parallelController, field, state).find(emission => emission.name === 'patt')?.value as CqlPatternNode | undefined;
			return pattern ? compileCql(pattern) : null;
		};

		expect(compileState({ source: 'contents__en', targets: [], alignBy: null, childStates: { contents__en: '[lemma="test"]' } })).toBe('[lemma="test"]');
		expect(
			compileState({
				source: 'contents__en',
				targets: ['contents__nl', 'contents__de'],
				alignBy: 'word-alignment',
				childStates: { contents__en: '[lemma="test"]', contents__nl: '[lemma="proef"]', contents__de: '[lemma="Test"]' },
			}),
		).toBe('[lemma="test"] =word-alignment=>nl? [lemma="proef"] ; =word-alignment=>de? [lemma="Test"]');
		expect(compileState({ source: 'contents__en', targets: ['contents__nl'], alignBy: null, childStates: { contents__en: '', contents__nl: '' } })).toBe('_ ==>nl? _');
	});
});
