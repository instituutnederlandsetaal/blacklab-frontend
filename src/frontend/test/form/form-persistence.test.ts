// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';

import {
	annotationSelectController,
	annotationTextController,
	annotationPosController,
	createFormState,
	encodeScopedFormQuery,
	expertQueryController,
	filterAutocompleteController,
	filterCheckboxController,
	filterDateController,
	filterRadioController,
	filterRangeController,
	filterSelectController,
	filterTextController,
	FormSystem,
	parallelController,
	restoreScopedFormState,
	withinController,
	type FieldController,
} from '@/features/form';
import { queryFragment, rawFilter } from '@/features/form/model/compile/query-artifact';
import { decodePersistObject, decodePersistSelection, encodePersistObject, joinPersistValues } from '@/features/form/model/controllers/persistence-codec';

import { TestTextField, createTestBuilder, createTestContext, testTextController, type TestTextFieldConfig, type TestTextFieldState } from './helpers';

import TextField from '@/features/form/fields/generic/TextField.vue';
import RawCqlField from '@/features/form/fields/RawCqlField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

function createSingleTextForm() {
	const builder = createTestBuilder();
	const form = builder.newForm('search.extended', ContainerRenderer, { title: 'Extended', persistKey: 'extended' });
	const field = builder.newField('search.extended.word', testTextController, TestTextField, {
		annotationId: 'word',
		displayName: 'Word',
	});
	form.addChildren(field);
	return {
		context: createTestContext(),
		definition: builder.build(),
		field,
		form,
	};
}

describe('scoped form persistence', () => {
	test('encodes readable f.* state and ignores unscoped unknown query parameters when restoring', () => {
		const fixture = createSingleTextForm();
		const state = createFormState(fixture.definition, fixture.context);
		state.controllerState[fixture.field.id] = { value: 'water' };

		const encoded = encodeScopedFormQuery(fixture.definition, fixture.context, {
			formId: fixture.form.id,
			state,
			cql: '[word="(?i)water"]',
			filter: null,
			searchField: null,
		});

		expect(encoded).toEqual({
			'f.form': 'extended',
			'f.word': 'water',
		});

		const restored = restoreScopedFormState(
			fixture.definition,
			fixture.context,
			{
				unknown: 'not-form-owned',
				word: 'fire',
				'f.form': 'extended',
				'f.word': 'water',
			},
			{ patt: '[word="(?i)water"]' },
		);

		expect(restored.issues).toEqual([]);
		expect(restored.state.controllerState[fixture.field.id]).toEqual({ value: 'water' });
		expect(restored.state.rawOverrides).toEqual({});
	});

	test('reports dangling scoped parameters and restores fields accepted by the default form for an unknown selector', () => {
		const fixture = createSingleTextForm();
		const restored = restoreScopedFormState(fixture.definition, fixture.context, {
			'f.form': 'removed-form',
			'f.word': 'water',
			'f.v': 'old-version',
			'f.removed': 'stale',
		});

		expect(restored.formId).toBe(fixture.form.id);
		expect(restored.state.controllerState[fixture.field.id]).toEqual({ value: 'water' });
		expect(restored.issues).toEqual([
			{ key: 'form', message: "No current form accepts persisted selector 'removed-form'." },
			{ key: 'v', message: "No current form field accepts persisted key 'v'." },
			{ key: 'removed', message: "No current form field accepts persisted key 'removed'." },
		]);
	});

	test('retains defaults when a known field restore throws', () => {
		const throwingController: FieldController<'throwing-text', TestTextFieldState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'throwing-text',
			restore() {
				throw new Error('Unsupported historical value.');
			},
		};
		const builder = createTestBuilder();
		const form = builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' });
		const field = builder.newField('search.extended.word', throwingController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		form.addChildren(field);

		const restored = restoreScopedFormState(builder.build(), createTestContext(), { 'f.word': 'old' });

		expect(restored.state.controllerState[field.id]).toEqual({ value: '' });
		expect(restored.issues).toEqual([{ key: 'word', nodeId: field.id, message: 'Unsupported historical value.' }]);
	});

	test('activates a raw patt override when restored form output differs from canonical patt and locks affected controls', async () => {
		const fixture = createSingleTextForm();
		const restored = restoreScopedFormState(
			fixture.definition,
			fixture.context,
			{
				'f.form': 'extended',
				'f.word': 'water',
			},
			{ patt: '[word="(?i)fire"]' },
		);

		expect(restored.state.rawOverrides).toEqual({ patt: '[word="(?i)fire"]' });

		const wrapper = mount(FormSystem, {
			props: {
				context: fixture.context,
				definition: fixture.definition,
				initialState: restored.state,
			},
		});

		expect(wrapper.get('.blf-raw-override code').text()).toBe('[word="(?i)fire"]');
		expect((wrapper.get('input').element as HTMLInputElement).disabled).toBe(true);

		await wrapper.get('.blf-raw-override button').trigger('click');

		expect(wrapper.find('.blf-raw-override').exists()).toBe(false);
		expect((wrapper.get('input').element as HTMLInputElement).disabled).toBe(false);
	});

	test('keeps controller warnings informational when canonical comparison succeeds', () => {
		const warningController: FieldController<'warning-text', TestTextFieldState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'warning-text',
			restore(payload) {
				return {
					state: { value: Array.isArray(payload) ? (payload[0] ?? '') : payload },
					warnings: ['Restored with a harmless adjustment.'],
				};
			},
		};
		const builder = createTestBuilder();
		const form = builder.newForm('search.extended', ContainerRenderer, { title: 'Extended', persistKey: 'extended' });
		const field = builder.newField('search.extended.word', warningController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		form.addChildren(field);
		const definition = builder.build();
		const context = createTestContext();

		const restored = restoreScopedFormState(definition, context, { 'f.word': 'water' }, { patt: '[word="(?i)water"]' });

		expect(restored.issues).toEqual([{ key: 'word', nodeId: field.id, message: 'Restored with a harmless adjustment.' }]);
		expect(restored.state.rawOverrides).toEqual({});
	});

	test('uses the expert CQL field for old raw URLs that only contain canonical patt', () => {
		const builder = createTestBuilder();
		const root = builder.newContainer('search', ContainerRenderer, { title: 'Search', variant: 'tabs' });
		root.addForm('search.simple', ContainerRenderer, { title: 'Simple', persistKey: 'simple' }).addField('search.simple.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		const expert = root.addForm('search.expert', ContainerRenderer, { title: 'Expert', persistKey: 'expert' });
		const expertField = builder.newField('search.expert.query', filterTextController, TextField, {
			metadataFieldId: 'unused',
			displayName: 'Unused',
		});
		const rawField = builder.newField('search.expert.cql', expertQueryController, RawCqlField, {});
		expert.addChildren(expertField, rawField);
		const definition = builder.build();
		const context = createTestContext();

		const restored = restoreScopedFormState(definition, context, {}, { patt: '[word="water"]' });

		expect(restored.formId).toBe('search.expert');
		expect(restored.state.controllerState[rawField.id]).toEqual({ query: '[word="water"]', targetQueries: [] });
		expect(restored.state.rawOverrides).toEqual({});
	});

	test('persists and restores query-affecting tabs with implicit filter contributions', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' });
		const filters = form.addContainer('search.extended.filters', ContainerRenderer, {
			title: 'Filters',
			variant: 'tabs',
		});
		filters.addContainer('search.extended.filters.shared', ContainerRenderer, { title: 'Shared' });
		const newspapers = filters.addContainer('search.extended.filters.newspapers', ContainerRenderer, {
			title: 'Newspapers',
			activeQueryContribution: queryFragment(rawFilter('category("newspaper")')),
		});
		const definition = builder.build();
		const context = createTestContext();
		const state = createFormState(definition, context);
		state.uiState.activeContainers[filters.id] = newspapers.id;

		const encoded = encodeScopedFormQuery(definition, context, {
			formId: form.id,
			state,
			cql: null,
			filter: 'category("newspaper")',
			searchField: null,
		});

		expect(encoded['f.tab']).toEqual(['search.extended.filters:search.extended.filters.newspapers']);

		const restored = restoreScopedFormState(definition, context, encoded, { filter: 'category("newspaper")' });

		expect(restored.state.uiState.activeContainers[filters.id]).toBe(newspapers.id);
		expect(restored.state.rawOverrides).toEqual({});
	});

	test('retains valid tab selections and reports invalid entries', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' });
		const tabs = form.addContainer('search.extended.tabs', ContainerRenderer, { title: 'Tabs', variant: 'tabs' });
		const first = tabs.addContainer('search.extended.tabs.first', ContainerRenderer, { title: 'First' });
		tabs.addContainer('search.extended.tabs.second', ContainerRenderer, { title: 'Second' });
		const definition = builder.build();

		const restored = restoreScopedFormState(definition, createTestContext(), {
			'f.tab': ['search.extended.tabs:search.extended.tabs.first', 'missing:child', 'search.extended.tabs:search.extended.tabs.removed', 'malformed'],
		});

		expect(restored.state.uiState.activeContainers[tabs.id]).toBe(first.id);
		expect(restored.issues.length).toBe(3);
		expect(restored.issues[0].message).contains('missing');
		expect(restored.issues[1].message).contains('search.extended.tabs.removed');
		expect(restored.issues[2].message).contains('malformed');
	});
});

describe('controller persistence compatibility', () => {
	const context = createTestContext();
	const options = ['one', 'two'];
	const selectConfig = { id: 'field', metadataFieldId: 'field', options };
	const annotationConfig = { id: 'field', annotationId: 'field', options };

	test('shares scalar and selection representations across compatible controllers', () => {
		expect(filterSelectController.restore('one', selectConfig, context)).toEqual({ state: ['one'], warnings: [] });
		expect(filterCheckboxController.restore('one,two', selectConfig, context)).toEqual({
			state: { one: true, two: true },
			warnings: [],
		});
		expect(annotationSelectController.restore('one,two', annotationConfig, context)).toEqual({ state: ['one', 'two'], warnings: [] });
		expect(filterRadioController.restore('one', selectConfig, context)).toEqual({ state: 'one', warnings: [] });
	});

	test('rejects ambiguous multiple values for single-value controllers', () => {
		expect(() => filterRadioController.restore('one,two', selectConfig, context)).toThrow(/single-choice/);
		expect(() => filterTextController.restore(['one', 'two'], selectConfig, context)).toThrow(/multiple URL values/);
		expect(() => filterAutocompleteController.restore(['one', 'two'], selectConfig, context)).toThrow(/multiple URL values/);
		expect(() => annotationTextController.restore(['one', 'two'], annotationConfig, context)).toThrow(/multiple URL values/);
	});

	test('preserves structurally valid stale options with warnings', () => {
		expect(filterSelectController.restore('one,removed', selectConfig, context)).toEqual({
			state: ['one', 'removed'],
			warnings: ['Restored values no longer present in the current options: removed.'],
		});
	});

	test('only restores ranges from their structured representation', () => {
		const rangeConfig = { id: 'range', displayName: 'Range', metadataFieldId: 'range' };
		expect(filterRangeController.restore('low=10;high=20', rangeConfig, context)).toEqual({ low: '10', high: '20' });
		expect(() => filterRangeController.restore('10', rangeConfig, context)).toThrow(/incompatible persisted value/);
	});

	test('restores dates and specialized records only through supported representations', () => {
		expect(filterDateController.restore('start=2020-01-02;end=2021-03-04;mode=permissive', { id: 'date', displayName: 'Date', metadataFieldId: 'date', range: true }, context)).toEqual({
			startDate: { y: '2020', m: '01', d: '02' },
			endDate: { y: '2021', m: '03', d: '04' },
			mode: 'permissive',
		});
		expect(() => filterDateController.restore('start=2020;mode=unknown', { id: 'date', displayName: 'Date', metadataFieldId: 'date', range: true }, context)).toThrow(/unknown range mode/);

		expect(annotationPosController.restore('value=VERB;selected=past,plural', {} as never, context)).toEqual({
			annotationValue: 'VERB',
			selected: { past: true, plural: true },
		});
		expect(withinController.restore('element=s;attr.type=quote', {} as never, context)).toEqual({
			element: 's',
			attributes: { type: 'quote' },
		});
		expect(
			parallelController.restore(
				'source=contents;targets=translation;align=sentence',
				{
					id: 'parallel',
					sourceOptions: [{ id: 'default' }],
					targetOptions: [],
					alignByOptions: ['word'],
				} as never,
				context,
			),
		).toEqual({
			source: 'contents',
			targets: ['translation'],
			alignBy: 'sentence',
		});
		expect(expertQueryController.restore('query=[word="water"];targets=[word="water"]', {} as never, context)).toEqual({
			query: '[word="water"]',
			targetQueries: ['[word="water"]'],
		});
	});

	test('round-trips escaped separators in selections and records', () => {
		const selection = ['literal,comma', 'literal;semicolon', 'literal=equals', 'literal\\slash'];
		expect(decodePersistSelection(joinPersistValues(selection))).toEqual(selection);

		const record = encodePersistObject({ value: 'a;b,c=d\\e' });
		expect(record).not.toBeNull();
		expect(decodePersistObject(record!)).toEqual({ value: 'a;b,c=d\\e' });
	});
});
