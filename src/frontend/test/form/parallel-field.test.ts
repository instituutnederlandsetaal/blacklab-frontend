// @vitest-environment jsdom

import { createMockTranslate } from '@test/mocks/i18n';
import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { nextTick, ref } from 'vue';

import {
	FormSystem,
	createFormFieldNode,
	expertQueryController,
	parallelController,
	restoreFieldState,
	type FieldController,
	type FieldControllerProps,
	type FormEmission,
	type FormRuntimeContext,
} from '@/features/form';
import { compileCql } from '@/features/form/model/compile/query-artifact';
import { type CqlPatternNode } from '@/features/form/model/types/form-query-ir';

import { createTestBuilder, createTestContext, createTestRuntime } from './helpers';

import ParallelField from '@/features/form/fields/ParallelField.vue';
import RawCqlField from '@/features/form/fields/RawCqlField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

describe('parallel query emissions', () => {
	const context: FormRuntimeContext = {
		corpus: { indexId: '', textDirection: 'ltr' },
		translate: createMockTranslate(),
	};

	function collect<State, Extra>(controller: FieldController<string, State, Extra>, config: FieldControllerProps<Extra>, state: State): FormEmission[] {
		const emissions: FormEmission[] = [];
		controller.collect(config, context, state, (name, value) => emissions.push({ name, value } as FormEmission));
		return emissions;
	}

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

describe('parallel field persistence', () => {
	const context = createTestContext();

	const parallelConfig = {
		kind: 'field' as const,
		id: 'parallel',
		childFieldTemplate: createFormFieldNode('parallel.query', expertQueryController, RawCqlField, {}),
		fieldOptions: [{ id: 'contents__en' }, { id: 'contents__nl' }, { id: 'contents__de' }],
		alignByOptions: ['word-alignment'],
	};

	const encode = <Kind extends string, State, Extra>(controller: FieldController<Kind, State, Extra>, state: State, config: FieldControllerProps<Extra>) =>
		controller.persistence.codec.encode(state, { config, runtime: context });

	const restore = <Kind extends string, State, Extra>(controller: FieldController<Kind, State, Extra>, payload: string | string[], config: FieldControllerProps<Extra>): State =>
		restoreFieldState({ ...config, controller }, payload, context) as State;

	test('parallel persistence round-trips active child payloads and omits inactive fields', () => {
		const state = {
			source: 'contents__en',
			targets: ['contents__nl'],
			alignBy: 'word-alignment',
			childStates: { contents__en: '[lemma="test"]', contents__nl: '[lemma="proef"]', contents__de: '[lemma="ignored"]' },
		};
		const encoded = encode(parallelController, state, parallelConfig);

		expect(encoded).toContain('s=contents__en');
		expect(encoded).toContain('q=');
		expect(restore(parallelController, encoded!, parallelConfig)).toEqual({
			...state,
			childStates: { contents__en: '[lemma="test"]', contents__nl: '[lemma="proef"]' },
		});
	});

	test('parallel persistence rejects unavailable targets', () => {
		expect(() => restore(parallelController, 't={contents__fr}', parallelConfig)).toThrow("Cannot restore parallel field 'contents__fr' because it is not present in the current field options.");
	});

	test('parallel persistence rejects unavailable alignment relations', () => {
		expect(() => restore(parallelController, 'a=removed', parallelConfig)).toThrow("Cannot restore parallel alignment 'removed' because it is not available in the current form.");
	});

	test('preserves selected parallel targets with default child state', () => {
		const config = { ...parallelConfig, defaultSource: 'contents__en' };
		const state = { source: 'contents__en', targets: ['contents__nl'], alignBy: 'word-alignment', childStates: { contents__en: '', contents__nl: '' } };
		const encoded = encode(parallelController, state, config);
		expect(encoded).toBe('t={contents__nl}');
		expect(restore(parallelController, encoded!, config)).toEqual(state);
	});
});

describe('parallel form system', () => {
	test('parallel source and target controls keep their queries and translated summaries together', async () => {
		const locale = ref('en');
		const builder = createTestBuilder();
		const form = builder.newForm('search', ContainerRenderer, {});
		const parallel = builder.newField('parallel', parallelController, ParallelField, {
			alignByOptions: ['sentence', { value: 'paragraph', label: () => `${locale.value}:Paragraph` }],
			childFieldTemplate: createFormFieldNode('parallel.query', expertQueryController, RawCqlField, {}),
			defaultSource: 'contents__de',
			fieldOptions: [
				{ id: 'contents__de', defaultDisplayName: 'German' },
				{ id: 'contents__en', defaultDisplayName: 'English' },
				{ id: 'contents__nl', label: () => `${locale.value}:Dutch` },
			],
		});
		form.addChildren(parallel);
		const runtime = createTestRuntime(builder);
		const wrapper = mount(FormSystem, { props: { runtime } });
		const source = wrapper.get('.combobox');
		await source.get('.menu-button').trigger('click');
		await source.get('[data-value="contents__en"]').trigger('click');
		await wrapper.get('textarea').setValue('[lemma="house"]');
		const targets = wrapper.get('.multi-value-picker');
		await targets.get('.menu-button').trigger('click');
		await targets.get('[data-value="contents__nl"]').trigger('click');
		await wrapper.findAll('textarea')[1].setValue('[lemma="huis"]');
		await wrapper.get('button[value="paragraph"]').trigger('click');
		expect(runtime.state.state.value[parallel.id]).toEqual({
			source: 'contents__en',
			targets: ['contents__nl'],
			alignBy: 'paragraph',
			childStates: { contents__de: '', contents__en: '[lemma="house"]', contents__nl: '[lemma="huis"]' },
		});
		const summary = () => runtime.compileSummary(form.id).summaries.map(entry => entry.value);
		expect(summary()).toEqual(['English', 'en:Dutch', 'en:Paragraph', '[lemma="house"]', '[lemma="huis"]']);
		locale.value = 'nl';
		await nextTick();
		expect(targets.get('.selected').text()).toContain('nl:Dutch');
		expect(wrapper.get('button[value="paragraph"]').text()).toBe('nl:Paragraph');
		expect(summary()).toEqual(['English', 'nl:Dutch', 'nl:Paragraph', '[lemma="house"]', '[lemma="huis"]']);
	});
});
