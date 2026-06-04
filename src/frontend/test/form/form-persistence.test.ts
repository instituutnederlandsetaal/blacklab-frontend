// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';

import { createFormState, encodeScopedFormQuery, expertQueryController, filterTextController, FormSystem, restoreScopedFormState, type FieldController } from '@/features/form';
import { queryFragment, rawFilter } from '@/features/form/model/compile/query-artifact';

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
			schemaVersion: fixture.definition.schemaVersion,
		});

		expect(encoded).toEqual({
			'f.v': '1',
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
		const form = builder.newForm('search.extended', ContainerRenderer, { title: 'Extended', persistKey: 'extended' });
		const filters = form.addContainer('search.extended.filters', ContainerRenderer, {
			title: 'Filters',
			persistKey: 'filters',
			variant: 'tabs',
		});
		filters.addContainer('search.extended.filters.shared', ContainerRenderer, { title: 'Shared', persistKey: 'shared' });
		const newspapers = filters.addContainer('search.extended.filters.newspapers', ContainerRenderer, {
			title: 'Newspapers',
			persistKey: 'newspapers',
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
			schemaVersion: definition.schemaVersion,
		});

		expect(encoded['f.tab']).toEqual(['filters:newspapers']);

		const restored = restoreScopedFormState(definition, context, encoded, { filter: 'category("newspaper")' });

		expect(restored.state.uiState.activeContainers[filters.id]).toBe(newspapers.id);
		expect(restored.state.rawOverrides).toEqual({});
	});
});
