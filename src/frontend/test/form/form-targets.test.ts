import { describe, expect, test, vi } from 'vitest';

import {
	createSearchTarget,
	docsSearchTarget,
	hitsSearchTarget,
	rawCql,
	searchTarget,
	type FieldController,
	type FormEmission,
	type FormIssue,
	type FormOutputName,
	type SearchOutputName,
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
	test('reports unknown, undeclared, and malformed values while retaining unrelated valid outputs', () => {
		const controller = createController(['patt', 'filter', 'searchfield'], (_config, _runtime, _state, emit) => {
			const rawEmit = emit as unknown as (name: string, value: unknown) => void;
			rawEmit('unknown', 'value');
			rawEmit('group', [' field:author ']);
			rawEmit('collpatt', undefined);
			rawEmit('filter', { type: 'lucene-field' });
			emit('patt', rawCql(' [word="water"] '));
			emit('searchfield', ' contents ');
		});
		const compiled = createRuntime(controller).compile('search.form');

		expect(compiled.params).toEqual({ group: 'field:author', patt: '[word="water"]', searchfield: 'contents' });
		expect(compiled.issues).toEqual([
			expect.objectContaining({ stage: 'collect', code: 'unknown-output', nodeId: 'search.field.0', output: 'unknown' }),
			expect.objectContaining({ stage: 'collect', code: 'undeclared-output', nodeId: 'search.field.0', output: 'group' }),
			expect.objectContaining({ stage: 'collect', code: 'malformed-output', output: 'filter' }),
		]);
	});

	test('ignores supported undefined values without an issue', () => {
		const controller = createController(['patt'], (_config, _runtime, _state, emit) => {
			(emit as unknown as (name: string, value: unknown) => void)('patt', undefined);
		});

		expect(createRuntime(controller).compile('search.form')).toMatchObject({ params: {}, issues: [] });
	});

	test('reports controller outputs that the reachable form target does not support before they are emitted', () => {
		const controller = createController(['collpatt'], () => {});
		const compiled = createRuntime(controller).compile('search.form');

		expect(compiled.params).toEqual({});
		expect(compiled.issues).toEqual([expect.objectContaining({ stage: 'accept', code: 'unsupported-output', nodeId: 'search.field.0', output: 'collpatt' })]);
	});

	test('catches controller failures and continues with following fields', () => {
		const first = createController(['patt'], (_config, _runtime, _state, emit) => {
			emit('patt', rawCql('[word="water"]'));
			throw new Error('broken controller');
		});
		const second = createController(['filter'], (_config, _runtime, _state, emit) => emit('filter', filter('author', 'literal', 'Austen')!));
		const compiled = createRuntime(first, second).compile('search.form');

		expect(compiled.params).toEqual({ patt: '[word="water"]', filter: 'author:(Austen)' });
		expect(compiled.issues).toContainEqual(expect.objectContaining({ stage: 'collect', code: 'controller-error', nodeId: 'search.field.0', message: 'broken controller' }));
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
		expect(compiled.issues.filter(issue => issue.code === 'controller-error').map(issue => issue.message)).toEqual(['broken collection', 'broken summary', 'broken persistence', 'broken preset']);
	});

	test('rejects malformed recursive CQL instead of throwing during target compilation', () => {
		const controller = createController(['patt'], (_config, _runtime, _state, emit) => {
			(emit as unknown as (name: string, value: unknown) => void)('patt', { type: 'cql-raw', cql: null });
		});
		const compiled = createRuntime(controller).compile('search.form');

		expect(compiled.params).toEqual({});
		expect(compiled.issues).toContainEqual(expect.objectContaining({ stage: 'collect', code: 'malformed-output', output: 'patt' }));
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
			expect.objectContaining({ stage: 'target', code: 'conflicting-output', output: 'searchfield' }),
			expect.objectContaining({ stage: 'target', code: 'conflicting-output', output: 'patt' }),
		]);
	});

	test('writes null only for present empty group and sort outputs', () => {
		const target = createSearchTarget();
		const issues: FormIssue[] = [];

		expect(target.compile([emission('group', null), emission('sort', ['  '])] as FormEmission<SearchOutputName>[], issues)).toEqual({ group: null, sort: null });
		expect(issues).toEqual([]);
	});

	test('applies defaults, reports required normalized outputs, and still publishes a partial bag', () => {
		const target = createSearchTarget({ defaultSearchfield: ' contents ', requiredOutputs: ['patt', 'filter', 'searchfield'] });
		const issues: FormIssue[] = [];
		const params = target.compile([emission('filter', filter('author', 'literal', 'Austen')!)] as FormEmission<SearchOutputName>[], issues);

		expect(params).toEqual({ filter: 'author:(Austen)', searchfield: 'contents' });
		expect(issues).toEqual([expect.objectContaining({ stage: 'target', code: 'missing-output', output: 'patt' })]);
	});

	test('returns an empty parameter bag and one issue per missing required output', () => {
		const target = createSearchTarget({ requiredOutputs: ['patt', 'searchfield'] });
		const issues: FormIssue[] = [];

		expect(target.compile([], issues)).toEqual({});
		expect(issues.map(issue => [issue.stage, issue.code, issue.output])).toEqual([
			['target', 'missing-output', 'patt'],
			['target', 'missing-output', 'searchfield'],
		]);
	});

	test('reconciles accepted runtime overrides after target compilation', () => {
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
