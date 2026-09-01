import { describe, expect, test, vi } from 'vitest';

import {
	COLLOCATION_OUTPUTS,
	createCollocationTarget,
	createSearchTarget,
	docsSearchTarget,
	hitsSearchTarget,
	isCollocationParams,
	isValidEmission,
	rawCql,
	searchTarget,
	type FieldController,
	type FormEmission,
	type FormIssue,
	type FormOutputName,
	type SearchOutputName,
	within,
} from '@/features/form';
import { filter } from '@/features/form/model/types/form-query-ir';

import { TestTextField, createTestBuilder, createTestRuntime, testTextController, type TestTextFieldConfig, type TestTextFieldState } from './helpers';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

type TestController = FieldController<string, TestTextFieldState, TestTextFieldConfig>;

function createController(outputs: readonly FormOutputName[], collect: TestController['collect']): TestController {
	return { ...testTextController, kind: `target-test-${outputs.join('-')}`, outputs, collect };
}

function createRuntime(...controllers: TestController[]) {
	const builder = createTestBuilder();
	const form = builder.newForm('search.form', ContainerRenderer, {});
	controllers.forEach((controller, index) => {
		form.addChildren(
			builder.newField(`search.field.${index}`, controller, TestTextField, {
				annotationId: `annotation-${index}`,
				displayName: `Field ${index}`,
			}),
		);
	});
	return createTestRuntime(builder);
}

function emission<Name extends FormOutputName>(name: Name, value: FormEmission<Name>['value']): FormEmission<Name> {
	return { name, value } as FormEmission<Name>;
}

describe('form output acceptance', () => {
	test('validates collocation discriminators and safe context shapes at the form boundary', () => {
		expect(isValidEmission({ name: 'collpatt', value: rawCql('[lemma="ship"]') })).toBe(true);
		expect(isValidEmission({ name: 'colltype', value: 'proximity' })).toBe(true);
		expect(isValidEmission({ name: 'context', value: 0 })).toBe(true);
		expect(isValidEmission({ name: 'context', value: [3, 4] })).toBe(true);
		expect(isValidEmission({ name: 'sensitive', value: false })).toBe(true);
		for (const name of ['within', 'reltype', 'annotation', 'scorertype'] as const) {
			expect(isValidEmission({ name, value: 'value' })).toBe(true);
			expect(isValidEmission({ name, value: 1 })).toBe(false);
		}
		expect(isValidEmission({ name: 'collpatt', value: '[lemma="ship"]' })).toBe(false);
		expect(isValidEmission({ name: 'colltype', value: 'unknown' })).toBe(false);
		expect(isValidEmission({ name: 'context', value: -1 })).toBe(false);
		expect(isValidEmission({ name: 'context', value: [3] })).toBe(false);
		expect(isValidEmission({ name: 'context', value: [3, Number.MAX_SAFE_INTEGER + 1] })).toBe(false);
		expect(isValidEmission({ name: 'sensitive', value: 'false' })).toBe(false);
	});

	test('reports unknown, undeclared, malformed, and unsupported values while retaining unrelated valid outputs', () => {
		const controller = createController(['patt', 'collpatt', 'filter', 'searchfield'], (_config, _runtime, _state, emit) => {
			const rawEmit = emit as unknown as (name: string, value: unknown) => void;
			rawEmit('unknown', 'value');
			rawEmit('group', [' field:author ']);
			emit('collpatt', rawCql('[lemma="novel"]'));
			rawEmit('filter', { type: 'lucene-field' });
			emit('patt', rawCql(' [word="water"] '));
			emit('searchfield', ' contents ');
		});
		const compiled = createRuntime(controller).compile('search.form');

		expect(compiled.params).toEqual({ group: 'field:author', patt: '[word="water"]', searchfield: 'contents' });
		expect(compiled.issues).toEqual([
			{ severity: 'warning', message: "Controller for 'search.field.0' emitted unknown output 'unknown'; ignoring it." },
			{ severity: 'warning', message: "Controller for 'search.field.0' emitted undeclared output 'group'." },
			{ severity: 'warning', message: "Controller for 'search.field.0' emitted malformed output 'filter'; ignoring it." },
			{ severity: 'warning', message: "The form target does not accept output 'collpatt'; ignoring it." },
		]);
	});

	test('ignores supported undefined values without an issue', () => {
		const controller = createController(['patt'], (_config, _runtime, _state, emit) => {
			(emit as unknown as (name: string, value: unknown) => void)('patt', undefined);
		});

		expect(createRuntime(controller).compile('search.form')).toMatchObject({ params: {}, issues: [] });
	});

	test('does not preflight declarations that never emit', () => {
		const controller = createController(['collpatt'], () => {});
		const compiled = createRuntime(controller).compile('search.form');

		expect(compiled).toMatchObject({ params: {}, issues: [] });
	});

	test('catches controller failures and continues with following fields', () => {
		const first = createController(['patt'], (_config, _runtime, _state, emit) => {
			emit('patt', rawCql('[word="water"]'));
			throw new Error('broken controller');
		});
		const second = createController(['filter'], (_config, _runtime, _state, emit) => emit('filter', filter('author', 'literal', 'Austen')!));
		const compiled = createRuntime(first, second).compile('search.form');

		expect(compiled.params).toEqual({ patt: '[word="water"]', filter: 'author:(Austen)' });
		expect(compiled.issues).toContainEqual({ severity: 'error', message: "Controller for 'search.field.0' failed: broken controller" });
	});

	test('isolates every controller channel and continues with later fields', () => {
		const summarize = vi.fn((_config, _runtime, _state, emit) => {
			emit({ label: 'Partial', value: 'summary' });
			throw new Error('broken summary');
		});
		const first = {
			...createController(['patt'], (_config, _runtime, _state, emit) => {
				emit('patt', rawCql('[word="water"]'));
				throw new Error('broken collection');
			}),
			summarize,
			persistence: {
				...testTextController.persistence,
				codec: testTextController.persistence.codec.refine(() => {
					throw new Error('broken persistence');
				}),
			},
			getResultPreset: () => {
				throw new Error('broken preset');
			},
		} satisfies TestController;
		const second = {
			...createController(['filter'], (_config, _runtime, _state, emit) => emit('filter', filter('author', 'literal', 'Austen')!)),
			getResultPreset: () => 'tokens' as const,
		} satisfies TestController;

		const compiled = createRuntime(first, second).compile('search.form');

		expect(compiled.params).toEqual({ patt: '[word="water"]', filter: 'author:(Austen)' });
		expect(compiled.resultPreset).toBe('tokens');
		expect(compiled.summaries).toContainEqual({ label: 'Partial', value: 'summary', summaryType: ['patt'] });
		expect(compiled.issues.filter(issue => issue.severity === 'error').map(issue => issue.message)).toEqual([
			"Controller for 'search.field.0' failed: broken collection",
			"Controller for 'search.field.0' failed: broken summary",
			"Could not persist 'annotation-0' for controller 'search.field.0': broken persistence",
			"Controller for 'search.field.0' failed: broken preset",
		]);
	});

	test('rejects malformed recursive CQL instead of throwing during target compilation', () => {
		const controller = createController(['patt'], (_config, _runtime, _state, emit) => {
			(emit as unknown as (name: string, value: unknown) => void)('patt', { type: 'cql-raw', cql: null });
		});
		const compiled = createRuntime(controller).compile('search.form');

		expect(compiled.params).toEqual({});
		expect(compiled.issues).toContainEqual({ severity: 'warning', message: "Controller for 'search.field.0' emitted malformed output 'patt'; ignoring it." });
	});
});

describe('search target compilation', () => {
	test('normalizes values, concatenates group and sort, and keeps first valid scalar values', () => {
		const target = createSearchTarget();
		const issues: FormIssue[] = [];
		const params = target.compile(
			[
				emission('searchfield', '   '),
				emission('searchfield', ' contents '),
				emission('searchfield', 'ignored'),
				emission('patt', rawCql('   ')),
				emission('patt', rawCql(' [word="water"] ')),
				emission('patt', rawCql('[lemma="water"]')),
				emission('filter', filter('author', 'literal', 'Austen')!),
				emission('group', null),
				emission('group', [' field:author ', '', 'hit:lemma']),
				emission('sort', []),
				emission('sort', [' field:title ', '-hit:word']),
				emission('withspans', true),
			] as FormEmission<(typeof target.acceptedOutputs)[number]>[],
			issues,
		);

		expect(params).toEqual({
			patt: '[word="water"]',
			filter: 'author:(Austen)',
			searchfield: 'contents',
			group: 'field:author,hit:lemma',
			sort: 'field:title,-hit:word',
			withspans: true,
		});
		expect(issues).toEqual([
			{ severity: 'warning', message: "Ignoring repeated non-empty output 'searchfield'." },
			{ severity: 'warning', message: "Ignoring repeated non-empty output 'patt'." },
		]);
	});

	test('writes null only for present empty group and sort outputs', () => {
		const target = createSearchTarget();
		const issues: FormIssue[] = [];

		expect(target.compile([emission('group', null), emission('sort', ['  '])] as FormEmission<SearchOutputName>[], issues)).toEqual({ group: null, sort: null });
		expect(issues).toEqual([]);
	});

	test('treats repeated withspans as the same idempotent request', () => {
		const target = createSearchTarget();
		const issues: FormIssue[] = [];

		expect(target.compile([emission('withspans', true), emission('withspans', true)] as FormEmission<SearchOutputName>[], issues)).toEqual({ withspans: true });
		expect(issues).toEqual([]);
	});

	test('applies defaults, reports required normalized outputs, and still publishes a partial bag', () => {
		const target = createSearchTarget({ defaultSearchfield: ' contents ', requiredOutputs: ['patt', 'filter', 'searchfield'] });
		const issues: FormIssue[] = [];
		const params = target.compile([emission('filter', filter('author', 'literal', 'Austen')!)] as FormEmission<SearchOutputName>[], issues);

		expect(params).toEqual({ filter: 'author:(Austen)', searchfield: 'contents' });
		expect(issues).toEqual([{ severity: 'error', message: "Required output 'patt' is missing." }]);
	});

	test('returns an empty parameter bag and one issue per missing required output', () => {
		const target = createSearchTarget({ requiredOutputs: ['patt', 'searchfield'] });
		const issues: FormIssue[] = [];

		expect(target.compile([], issues)).toEqual({});
		expect(issues).toEqual([
			{ severity: 'error', message: "Required output 'patt' is missing." },
			{ severity: 'error', message: "Required output 'searchfield' is missing." },
		]);
	});

	test('normalizes restored canonical values before applying defaults and requiredness', () => {
		const target = createSearchTarget({ defaultSearchfield: 'contents', requiredOutputs: ['patt'] });
		const issues: FormIssue[] = [];
		const params = target.compile([emission('patt', rawCql('[word="draft"]')), emission('filter', filter('author', 'literal', 'draft')!)] as FormEmission<SearchOutputName>[], issues, {
			patt: '   ',
			filter: ' author:Austen ',
			searchfield: '   ',
		});

		expect(params).toEqual({ filter: 'author:Austen', searchfield: 'contents' });
		expect(issues).toEqual([
			{ severity: 'warning', message: "Restored override 'patt' is empty after normalization; ignoring it." },
			{ severity: 'warning', message: "Restored override 'searchfield' is empty after normalization; ignoring it." },
			{ severity: 'error', message: "Required output 'patt' is missing." },
		]);
	});

	test('reconciles only target-owned runtime overrides during target compilation', () => {
		const controller = createController(['patt'], (_config, _runtime, _state, emit) => emit('patt', rawCql('[word="draft"]')));
		const runtime = createRuntime(controller);
		runtime.state.rawOverrides.value.patt = '[word="restored"]';
		runtime.state.rawOverrides.value.collpatt = '[lemma="ignored"]';

		const compiled = runtime.compile('search.form');

		expect(compiled.params).toEqual({ patt: '[word="restored"]' });
	});

	test('declares endpoint families for generic and explicit-view targets', () => {
		expect(searchTarget.supportedEndpoints).toEqual(['hits', 'docs', 'hits-grouped', 'docs-grouped']);
		expect(hitsSearchTarget).toMatchObject({ targetView: 'hits', supportedEndpoints: ['hits', 'hits-grouped'] });
		expect(docsSearchTarget).toMatchObject({ targetView: 'docs', supportedEndpoints: ['docs', 'docs-grouped'] });
	});
});

describe('collocation target compilation', () => {
	test('declares its exact grouped endpoint contract and applies explicit defaults', () => {
		const target = createCollocationTarget(' lemma ');
		const issues: FormIssue[] = [];
		const params = target.compile([emission('patt', rawCql(' [word="ship"] '))] as FormEmission<(typeof COLLOCATION_OUTPUTS)[number]>[], issues);

		expect(target).toMatchObject({
			acceptedOutputs: COLLOCATION_OUTPUTS,
			targetView: 'hits',
			supportedEndpoints: ['collocations'],
		});
		expect(COLLOCATION_OUTPUTS).not.toContain('group');
		expect(params).toEqual({
			patt: '[word="ship"]',
			colltype: 'proximity',
			context: 5,
			annotation: 'lemma',
			sensitive: false,
			scorertype: 'coll-dice',
		});
		expect(isCollocationParams(params)).toBe(true);
		expect(issues).toEqual([]);
	});

	test('compiles both patterns, filters, endpoint within, context pairs, and sort', () => {
		const target = createCollocationTarget('word');
		const issues: FormIssue[] = [];
		const params = target.compile(
			[
				emission('patt', rawCql(' [word="ship"] ')),
				emission('collpatt', rawCql(' [lemma="boat"] ')),
				emission('filter', filter('author', 'literal', 'Austen')!),
				emission('searchfield', ' contents__en '),
				emission('context', [3, 4]),
				emission('within', ' s '),
				emission('annotation', ' lemma '),
				emission('sensitive', true),
				emission('scorertype', ' coll-salience '),
				emission('sort', [' -size ', 'identity']),
			] as FormEmission<(typeof COLLOCATION_OUTPUTS)[number]>[],
			issues,
		);

		expect(params).toEqual({
			patt: '[word="ship"]',
			collpatt: '[lemma="boat"]',
			filter: 'author:(Austen)',
			searchfield: 'contents__en',
			colltype: 'proximity',
			context: '3:4',
			within: 's',
			annotation: 'lemma',
			sensitive: true,
			scorertype: 'coll-salience',
			sort: '-size,identity',
		});
		expect(issues).toEqual([]);
	});

	test('retains zero and false scalar values before later conflicts', () => {
		const target = createCollocationTarget('word');
		const issues: FormIssue[] = [];
		const params = target.compile(
			[emission('patt', rawCql('[word="ship"]')), emission('context', 0), emission('context', 2), emission('sensitive', false), emission('sensitive', true)] as FormEmission<
				(typeof COLLOCATION_OUTPUTS)[number]
			>[],
			issues,
		);

		expect(params).toMatchObject({ context: 0, sensitive: false });
		expect(issues).toEqual([
			{ severity: 'warning', message: "Ignoring repeated non-empty output 'context'." },
			{ severity: 'warning', message: "Ignoring repeated non-empty output 'sensitive'." },
		]);
	});

	test('keeps endpoint within separate from a CQL within wrapper', () => {
		const target = createCollocationTarget('word');
		const issues: FormIssue[] = [];
		const params = target.compile(
			[emission('patt', { type: 'and', children: [rawCql('[word="ship"]'), within('article')] }), emission('within', 's')] as FormEmission<(typeof COLLOCATION_OUTPUTS)[number]>[],
			issues,
		);

		expect(params.patt).toContain('within <article/>');
		expect(params.within).toBe('s');
		expect(issues).toEqual([]);
	});

	test('reports a missing keyword pattern while retaining safe defaults', () => {
		const target = createCollocationTarget('word');
		const issues: FormIssue[] = [];

		expect(target.compile([], issues)).toEqual({ colltype: 'proximity', context: 5, annotation: 'word', sensitive: false, scorertype: 'coll-dice' });
		expect(issues).toEqual([{ severity: 'error', message: "Required output 'patt' is missing." }]);
	});

	test('rejects proximity relation parameters without disabling an otherwise valid proximity query', () => {
		const target = createCollocationTarget('word');
		const issues: FormIssue[] = [];
		const params = target.compile([emission('patt', rawCql('[word="ship"]')), emission('reltype', 'aligns')] as FormEmission<(typeof COLLOCATION_OUTPUTS)[number]>[], issues);

		expect(params).toMatchObject({ patt: '[word="ship"]', colltype: 'proximity', context: 5 });
		expect(params).not.toHaveProperty('reltype');
		expect(issues).toEqual([{ severity: 'error', message: "Output 'reltype' is not valid for proximity collocations; ignoring it." }]);
	});

	test.each(['relsources', 'reltargets'] as const)('gates unsupported %s requests and removes executable pattern and proximity-only values', colltype => {
		const target = createCollocationTarget('word');
		const issues: FormIssue[] = [];
		const params = target.compile(
			[emission('patt', rawCql('[word="ship"]')), emission('colltype', colltype), emission('context', 3), emission('within', 's'), emission('reltype', 'aligns')] as FormEmission<
				(typeof COLLOCATION_OUTPUTS)[number]
			>[],
			issues,
		);

		expect(params).toEqual({ colltype, reltype: 'aligns', annotation: 'word', sensitive: false, scorertype: 'coll-dice' });
		expect(issues).toEqual([
			{ severity: 'error', message: `Collocation type '${colltype}' is not supported yet.` },
			{ severity: 'error', message: "Output 'context' is not valid for relation collocations; ignoring it." },
			{ severity: 'error', message: "Output 'within' is not valid for relation collocations; ignoring it." },
		]);
	});

	test('applies the release gate after restoring a relation discriminator', () => {
		const target = createCollocationTarget('word');
		const issues: FormIssue[] = [];
		const params = target.compile([emission('patt', rawCql('[word="ship"]'))] as FormEmission<(typeof COLLOCATION_OUTPUTS)[number]>[], issues, { colltype: 'reltargets' });

		expect(params).toEqual({ colltype: 'reltargets', annotation: 'word', sensitive: false, scorertype: 'coll-dice' });
		expect(issues).toEqual([{ severity: 'error', message: "Collocation type 'reltargets' is not supported yet." }]);
	});

	test('rejects an invalid restored context without substituting the proximity default', () => {
		const target = createCollocationTarget('word');
		const issues: FormIssue[] = [];
		const params = target.compile([emission('patt', rawCql('[word="ship"]'))] as FormEmission<(typeof COLLOCATION_OUTPUTS)[number]>[], issues, { context: null });

		expect(params).toEqual({ colltype: 'proximity', annotation: 'word', sensitive: false, scorertype: 'coll-dice' });
		expect(issues).toEqual([{ severity: 'error', message: "Restored override 'context' must be a safe non-negative integer or before:after pair." }]);
	});
});
