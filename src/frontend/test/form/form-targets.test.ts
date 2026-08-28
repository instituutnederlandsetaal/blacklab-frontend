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
