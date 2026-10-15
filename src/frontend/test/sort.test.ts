// @vitest-environment jsdom

import { createMockCustomizations } from '@test/mocks/customizations';
import { createMockI18n } from '@test/mocks/i18n';
import { shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref } from 'vue';

import type { Corpus } from '@/types/apptypes';

import debug from '@/shared/debug/debug';
import { createI18nPlugin } from '@/shared/i18n/plugin';
import { optionLabel, optionText, optionValue, type OptGroup } from '@/shared/utils/options';

import Sort from '@/pages/search/results/Sort.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

let customizations: ReturnType<typeof createMockCustomizations>;
let i18n: ReturnType<typeof createI18nPlugin>;

const annotationIds = ref<string[]>([]);
const annotationLabels = ref(false);
const metadataIds = ref<string[]>([]);
const metadataLabels = ref(false);
const corpus = {
	annotationGroups: [{ id: 'main', annotatedFieldId: 'contents', entries: ['initial-annotation', 'latest-annotation'], isRemainderGroup: false }],
	annotatedFields: {
		contents: {
			annotations: {
				'initial-annotation': { id: 'initial-annotation', defaultDisplayName: 'Initial annotation' },
				'latest-annotation': { id: 'latest-annotation', defaultDisplayName: 'Latest annotation' },
			},
		},
	},
	isParallelCorpus: true,
	mainAnnotatedField: 'contents',
	metadataFieldGroups: [{ id: 'Metadata', entries: ['initial-metadata', 'latest-metadata'] }],
	metadataFields: {
		'initial-metadata': { id: 'initial-metadata', defaultDisplayName: 'Initial metadata' },
		'latest-metadata': { id: 'latest-metadata', defaultDisplayName: 'Latest metadata' },
	},
} as unknown as Corpus;

beforeEach(() => {
	vi.clearAllMocks();
	const previousDebug = debug.value;
	const previousDebugStorage = localStorage.getItem('cf/debug');
	debug.value = false;
	i18n = createI18nPlugin(
		createMockI18n({
			bundles: {
				en: {
					results: {
						sort: { groups: 'Groups', parallelCorpus: 'Parallel corpus', documents: 'Documents', sortBy: 'Sort by' },
						table: {
							sortBy: 'Sort by {field}',
							sortByDescending: 'Sort by {field} descending',
							sort_groupName: 'Group name',
							sort_groupSize: 'Group size',
							sort_alignments: 'Alignments',
							sort_numberOfHits: 'Number of hits',
						},
					},
					queryForm: { collocations: 'Collocations' },
					collocations: { results: { association: 'Association ({scorer})', collocate: 'Collocate', cooccurrences: 'Co-occurrences' }, scorers: { dice: 'Dice' } },
				},
			},
		}),
	);
	customizations = createMockCustomizations(corpus);
	customizations.resultMetadataField.mockReturnValue(true);
	annotationIds.value = ['initial-annotation'];
	annotationLabels.value = false;
	metadataIds.value = [];
	metadataLabels.value = false;
	customizations.resultSortAnnotationIds.mockImplementation(() => annotationIds.value);
	customizations.resultSortAnnotationLabelsVisible.mockImplementation(() => annotationLabels.value);
	customizations.resultSortMetadataIds.mockImplementation(() => metadataIds.value);
	customizations.resultSortMetadataLabelsVisible.mockImplementation(() => metadataLabels.value);
	return async () => {
		debug.value = previousDebug;
		await nextTick();
		if (previousDebugStorage === null) localStorage.removeItem('cf/debug');
		else localStorage.setItem('cf/debug', previousDebugStorage);
	};
});

describe('Sort', () => {
	test('keeps built-in sort pairs and customization order', () => {
		customizations.sortOptionGroup.mockImplementation(group => ({ ...group, label: `custom:${optionText(group.label) ?? ''}` }));
		const wrapper = shallowMount(Sort, {
			props: { hits: true, docs: true, groups: true, corpus },
			global: { plugins: [i18n, customizations] },
		});
		const options = wrapper.getComponent(SelectPicker).props('options') as OptGroup[];

		expect(options.map(group => group.label)).toEqual(['custom:Groups', 'custom:Hit', 'custom:Before hit', 'custom:After hit', 'custom:Parallel corpus', 'custom:Documents']);
		expect(options.filter(group => ['custom:Groups', 'custom:Parallel corpus', 'custom:Documents'].includes(optionText(group.label) ?? '')).map(group => group.options)).toEqual([
			[
				{ label: 'Sort by Group name', value: 'identity' },
				{ label: 'Sort by Group name descending', value: '-identity' },
				{ label: 'Sort by Group size', value: 'size' },
				{ label: 'Sort by Group size descending', value: '-size' },
			],
			[
				{ label: 'Sort by Alignments', value: 'alignments' },
				{ label: 'Sort by Alignments descending', value: '-alignments' },
			],
			[
				{ label: 'Sort by Number of hits', value: 'numhits' },
				{ label: 'Sort by Number of hits descending', value: '-numhits' },
			],
		]);
	});

	test('keeps built-in and metadata sorting when annotation sorting is disabled', () => {
		annotationIds.value = [];
		metadataIds.value = ['initial-metadata'];
		const wrapper = shallowMount(Sort, { props: { hits: true, docs: true, corpus }, global: { plugins: [i18n, customizations] } });
		const options = wrapper.getComponent(SelectPicker).props('options') as OptGroup[];

		expect(options.map(group => optionText(group.label))).toEqual(['Parallel corpus', 'Documents', 'Metadata']);
		expect(options.flatMap(group => group.options).map(optionValue)).toEqual(['alignments', '-alignments', 'numhits', '-numhits', 'field:initial-metadata', '-field:initial-metadata']);
	});

	test('uses the latest reactive sort customizations', async () => {
		annotationIds.value = ['initial-annotation'];
		metadataIds.value = ['initial-metadata'];
		const wrapper = shallowMount(Sort, { props: { hits: true, docs: true, corpus }, global: { plugins: [i18n, customizations] } });
		const options = () => (wrapper.getComponent(SelectPicker).props('options') as OptGroup[]).flatMap(group => group.options);
		const label = (value: string) => optionLabel(options().find(option => optionValue(option) === value)!).trim();
		expect(options().map(optionValue)).toEqual([
			'hit:initial-annotation',
			'-hit:initial-annotation',
			'before:initial-annotation',
			'-before:initial-annotation',
			'after:initial-annotation',
			'-after:initial-annotation',
			'alignments',
			'-alignments',
			'numhits',
			'-numhits',
			'field:initial-metadata',
			'-field:initial-metadata',
		]);
		expect(label('before:initial-annotation')).toBe('Sort by Initial annotation');
		expect(label('field:initial-metadata')).toBe('Sort by Initial metadata');

		annotationIds.value = ['latest-annotation'];
		annotationLabels.value = true;
		metadataIds.value = ['latest-metadata'];
		metadataLabels.value = true;
		await nextTick();
		expect(options().map(optionValue)).toEqual([
			'hit:latest-annotation',
			'-hit:latest-annotation',
			'before:latest-annotation',
			'-before:latest-annotation',
			'after:latest-annotation',
			'-after:latest-annotation',
			'alignments',
			'-alignments',
			'numhits',
			'-numhits',
			'field:latest-metadata',
			'-field:latest-metadata',
		]);
		expect(label('before:latest-annotation')).toBe('Sort by Latest annotation  <small class="text-muted">before</small>');
		expect(label('field:latest-metadata')).toBe('Sort by Latest metadata  <small class="text-muted">Metadata</small>');
	});

	test('offers association, collocate, and co-occurrence sorting for collocation groups', () => {
		const wrapper = shallowMount(Sort, { props: { groups: true, collocations: true, collocationScorer: 'coll-dice', corpus }, global: { plugins: [i18n, customizations] } });
		const options = wrapper.getComponent(SelectPicker).props('options') as OptGroup[];

		expect(options).toEqual([
			{
				label: 'Collocations',
				options: [
					{ label: 'Sort by Association (Dice)', value: 'score' },
					{ label: 'Sort by Association (Dice) descending', value: '-score' },
					{ label: 'Sort by Collocate', value: 'identity' },
					{ label: 'Sort by Collocate descending', value: '-identity' },
					{ label: 'Sort by Co-occurrences', value: 'size' },
					{ label: 'Sort by Co-occurrences descending', value: '-size' },
				],
			},
		]);
	});
});
