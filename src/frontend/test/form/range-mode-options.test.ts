// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { nextTick, ref } from 'vue';

import type { Corpus } from '@/app/state/useCorpusContext';
import { createRangeModeOptions, DateField, RangeField, type FormFieldNode, type RangeModeOption } from '@/features/form';
import type { SearchFormConfiguration } from '@/features/search/model/search-form-configuration';
import { createSearchFormNodeConstructors } from '@/features/search/model/search-form-node-factory';
import type { NormalizedMetadataField } from '@/types/apptypes';

import type { Translate } from '@/shared/i18n';
import { optionLabel, optionTitle } from '@/shared/utils/options';

function metadataField(id: string, uiType: 'date' | 'range'): NormalizedMetadataField {
	return {
		defaultDescription: `${id} description`,
		defaultDisplayName: id,
		id,
		uiType,
	} as NormalizedMetadataField;
}

function getModeOptions(node: FormFieldNode): RangeModeOption[] {
	const options = (node as FormFieldNode & { modeOptions?: RangeModeOption[] }).modeOptions;
	if (!options) throw new Error(`Expected ${node.id} to have graph-provided range mode options.`);
	return options;
}

describe('range mode options', () => {
	test('constructs deferred translations on date and range nodes', () => {
		const locale = ref('en');
		let translationCalls = 0;
		const translate: Translate = {
			...createMockTranslate(),
			$t(key) {
				translationCalls++;
				return `${locale.value}:${key}`;
			},
		};
		const factory = createSearchFormNodeConstructors({
			blacklabApi: createMockApi().blacklabApi,
			configuration: {} as SearchFormConfiguration,
			corpus: { textDirection: 'ltr' } as Corpus,
			tagset: undefined,
			translate,
		});
		const dateOptions = getModeOptions(factory.nodes.metadataDate(metadataField('published', 'date'), { id: 'published' }));
		const rangeOptions = getModeOptions(factory.nodes.metadataRange(metadataField('year', 'range'), { id: 'year' }));

		expect(translationCalls).toBe(0);
		expect(optionLabel(dateOptions[0])).toBe('en:filter.range.permissive');
		expect(optionTitle(rangeOptions[1])).toBe('en:filter.range.strictDescription');

		locale.value = 'nl';

		expect(optionLabel(dateOptions[0])).toBe('nl:filter.range.permissive');
		expect(optionTitle(rangeOptions[1])).toBe('nl:filter.range.strictDescription');
	});

	test('reactively renders graph-provided labels and titles in both components', async () => {
		const locale = ref('en');
		const modeOptions = createRangeModeOptions({ $t: key => `${locale.value}:${key}` });
		const date = mount(DateField, {
			props: {
				id: 'published',
				htmlId: 'published',
				displayName: 'Published',
				modelValue: {
					startDate: { y: '', m: '', d: '' },
					endDate: { y: '', m: '', d: '' },
					mode: 'strict',
				},
				modeOptions,
				range: true,
			},
		});
		const range = mount(RangeField, {
			props: {
				id: 'year',
				htmlId: 'year',
				displayName: 'Year',
				modelValue: { low: '', high: '', mode: 'strict' },
				modeOptions,
				showMode: true,
			},
		});

		expect(date.findAll('button').map(button => button.text())).toEqual(['en:filter.range.permissive', 'en:filter.range.strict']);
		expect(range.get('button[value="permissive"]').attributes('title')).toBe('en:filter.range.permissiveDescription');

		locale.value = 'nl';
		await nextTick();

		expect(date.findAll('button').map(button => button.text())).toEqual(['nl:filter.range.permissive', 'nl:filter.range.strict']);
		expect(range.get('button[value="permissive"]').attributes('title')).toBe('nl:filter.range.permissiveDescription');
	});

	test('keeps value-name fallbacks for direct range field mounts', () => {
		const wrapper = mount(RangeField, {
			props: {
				id: 'year',
				htmlId: 'year',
				displayName: 'Year',
				modelValue: { low: '', high: '', mode: 'strict' },
				showMode: true,
			},
		});

		expect(wrapper.findAll('button').map(button => button.text())).toEqual(['permissive', 'strict']);
	});
});
