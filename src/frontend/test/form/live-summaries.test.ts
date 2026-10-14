import { describe, expect, test, vi } from 'vitest';
import { computed, ref } from 'vue';

import { filter } from '@/features/form/model/types/form-query-ir';
import { type ContainerNode } from '@/features/form/model/types/form-shape';

import { TestTextField, createTestBuilder, createTestRuntime, testTextController } from './helpers';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

describe('live summary compilation', () => {
	test('normalizes summary types from the controller output contract', () => {
		const builder = createTestBuilder();
		const explicitController = {
			...testTextController,
			summarize: (_config, _runtime, _state, emit) => {
				emit({ label: 'Explicit', value: 'value', summaryType: ['filter'] });
				emit({ label: 'Explicitly frontend only', value: 'value', summaryType: [] });
			},
		} satisfies typeof testTextController;
		const noOutputController = {
			...testTextController,
			outputs: [],
			collect() {},
			summarize: (_config, _runtime, _state, emit) => emit({ label: 'Frontend only', value: 'value' }),
		} satisfies typeof testTextController;
		const explicit = builder.newField('summary.explicit', explicitController, TestTextField, { annotationId: 'explicit', displayName: 'Explicit' });
		const inherited = builder.newField('summary.inherited', testTextController, TestTextField, { annotationId: 'inherited', displayName: 'Inherited' });
		const frontendOnly = builder.newField('summary.frontend', noOutputController, TestTextField, { annotationId: 'frontend', displayName: 'Frontend only' });
		const form = builder.newForm('summary.form', ContainerRenderer, {}).addChildren(explicit, inherited, frontendOnly);
		const runtime = createTestRuntime(builder);
		runtime.state.state.value[inherited.id] = { value: 'value' };

		expect(runtime.compile(form.id).summaries).toEqual([
			{ label: 'Explicit', value: 'value', summaryType: ['filter'] },
			{ label: 'Explicitly frontend only', value: 'value', summaryType: [] },
			{ label: 'Inherited', value: 'value', summaryType: ['patt'] },
			{ label: 'Frontend only', value: 'value', summaryType: [] },
		]);
	});

	test('summary compilation preserves shared-node contributions without persisting or choosing result presets', () => {
		const collect = vi.fn(testTextController.collect);
		const key = vi.fn(testTextController.persistence.key);
		const getResultPreset = vi.fn(() => 'table' as const);
		const firstProducer = (emit: Parameters<NonNullable<ContainerNode['activeChildOutputProducers']>[string]>[0]) => emit('filter', filter('category', 'literal', 'newspaper')!);
		const secondProducer = (emit: Parameters<NonNullable<ContainerNode['activeChildOutputProducers']>[string]>[0]) => emit('filter', filter('category', 'literal', 'book')!);
		const builder = createTestBuilder();
		const sharedField = builder.newField(
			'shared.word',
			{
				...testTextController,
				collect,
				persistence: { ...testTextController.persistence, key },
				getResultPreset,
			},
			TestTextField,
			{ annotationId: 'word', displayName: 'Word' },
		);
		const first = builder.newContainer('first.tabs', ContainerRenderer, {});
		const second = builder.newContainer('second.tabs', ContainerRenderer, {});
		first.prependChild(sharedField, { outputWhenActive: firstProducer });
		second.prependChild(sharedField, { outputWhenActive: secondProducer });
		const sequence = builder.newContainer('search.sequence', ContainerRenderer, { combine: 'sequence' }).addChildren(first, second);
		const form = builder.newForm('search.form', ContainerRenderer, {}).addChildren(sequence);
		const runtime = createTestRuntime(builder);
		runtime.state.state.value[sharedField.id] = { value: 'water' };

		const summary = runtime.compileSummary(form.id);

		expect(summary).toEqual({
			params: { patt: '[word="water"] [word="water"]', filter: '(category:(newspaper) AND category:(book))' },
			summaries: [{ label: 'Word', value: 'water', summaryType: ['patt'] }],
		});
		expect(collect).toHaveBeenCalledOnce();
		expect(key).not.toHaveBeenCalled();
		expect(getResultPreset).not.toHaveBeenCalled();

		const compiled = runtime.compile(form.id);
		expect(summary).toEqual({ params: compiled.params, summaries: compiled.summaries });

		runtime.state.rawOverrides.value.patt = '[word="override"]';
		expect(runtime.compileSummary(form.id).params.patt).toBe('[word="override"]');
	});

	test('presentation tab changes do not recompile summaries, while query-producing tabs update without recollecting fields', () => {
		const collect = vi.fn(testTextController.collect);
		const builder = createTestBuilder();
		const field = builder.newField('word', { ...testTextController, collect }, TestTextField, { annotationId: 'word', displayName: 'Word' });
		const alternate = builder.newContainer('alternate', ContainerRenderer, {});
		const layout = builder.newContainer('layout', ContainerRenderer, { mode: 'tabs' }).addChildren(field, alternate);
		const queryTabs = builder.newContainer('query', ContainerRenderer, { mode: 'tabs' });
		queryTabs.prependChild(builder.newContainer('other', ContainerRenderer, {}), { outputWhenActive: emit => emit('searchfield', 'other') });
		queryTabs.prependChild(layout, { outputWhenActive: emit => emit('searchfield', 'contents') });
		const form = builder.newForm('form', ContainerRenderer, {}).addChildren(queryTabs);
		const runtime = createTestRuntime(builder);
		const summary = computed(() => runtime.compileSummary(form.id));
		expect(summary.value.params.searchfield).toBe('contents');
		expect(collect).toHaveBeenCalledOnce();

		runtime.state.uiState.value[layout.id] = alternate.id;
		expect(summary.value.params.searchfield).toBe('contents');
		expect(collect).toHaveBeenCalledOnce();

		runtime.state.uiState.value[queryTabs.id] = 'other';
		expect(summary.value.params.searchfield).toBe('other');
		expect(collect).toHaveBeenCalledOnce();
	});

	test('live summaries recollect edited fields and localized labels, but not raw overrides', () => {
		const collect = vi.fn(testTextController.collect);
		const label = ref('Word');
		const builder = createTestBuilder();
		const form = builder.newForm('form', ContainerRenderer, {});
		const controller = { ...testTextController, collect };
		form.addChildren(
			builder.newField('word', controller, TestTextField, { annotationId: 'word', displayName: () => label.value }),
			builder.newField('lemma', controller, TestTextField, { annotationId: 'lemma', displayName: 'Lemma' }),
		);
		const runtime = createTestRuntime(builder);
		runtime.state.state.value.word = { value: 'water' };
		runtime.state.state.value.lemma = { value: 'fire' };
		const summary = computed(() => runtime.compileSummary(form.id));
		expect(summary.value.params.patt).toBe('[word="water" & lemma="fire"]');
		expect(collect).toHaveBeenCalledTimes(2);
		collect.mockClear();

		(runtime.state.state.value.word as { value: string }).value = 'ice';
		expect(summary.value.params.patt).toBe('[word="ice" & lemma="fire"]');
		expect(collect).toHaveBeenCalledOnce();
		collect.mockClear();

		runtime.state.state.value.lemma = { value: 'steam' };
		expect(summary.value.params.patt).toBe('[word="ice" & lemma="steam"]');
		expect(collect).toHaveBeenCalledOnce();
		collect.mockClear();

		label.value = 'Woord';
		expect(summary.value.summaries[0].label).toBe('Woord');
		expect(collect).toHaveBeenCalledOnce();
		collect.mockClear();

		summary.value.summaries[0].label = 'Changed by caller';
		summary.value.summaries[0].summaryType = ['filter'];
		runtime.state.rawOverrides.value.patt = '[word="override"]';
		expect(summary.value.params.patt).toBe('[word="override"]');
		expect(summary.value.summaries[0]).toMatchObject({ label: 'Woord', summaryType: ['patt'] });
		expect(collect).not.toHaveBeenCalled();

		runtime.reset();
		expect(summary.value.summaries).toEqual([]);
		expect(collect).toHaveBeenCalledTimes(2);
	});
});
