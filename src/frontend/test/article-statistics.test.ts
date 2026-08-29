// @vitest-environment jsdom

import { mount, shallowMount, type VueWrapper } from '@vue/test-utils';
import type * as Highcharts from 'highcharts';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref } from 'vue';

import type { CorpusContext } from '@/app/state/useCorpusContext';
import * as ArticleStore from '@/features/article/model/article-state';
import type * as BLTypes from '@/types/blacklabtypes';

import AnnotationDistributions from '@/pages/article/AnnotationDistributions.vue';
import AnnotationGrowths from '@/pages/article/AnnotationGrowths.vue';
import ArticlePageStatistics from '@/pages/article/ArticlePageStatistics.vue';

vi.mock('highcharts-vue', async () => {
	const { defineComponent } = await import('vue');
	return {
		Chart: defineComponent({
			name: 'ChartProbe',
			props: { options: { type: Object, required: true } },
			template: '<div />',
		}),
	};
});

const snippet = {
	before: { punct: [] },
	match: {
		punct: ['', '', '', ''],
		lemma: ['run', 'run', 'walk'],
		pos: ['V', 'V', 'N'],
	},
	after: { punct: [] },
} satisfies BLTypes.BLHitInDoc;

const hit = { ...snippet, docPid: 'doc', start: 0, end: 3 } satisfies BLTypes.BLHit;
const document = { docPid: 'doc' } as BLTypes.BLDocument;

function mountStatistics(isPaginated = false) {
	return shallowMount(ArticlePageStatistics, { props: { snippet: hit, document, isPaginated } });
}

function options(wrapper: VueWrapper): Highcharts.Options {
	return wrapper.getComponent({ name: 'ChartProbe' }).props('options') as Highcharts.Options;
}

beforeEach(() => {
	ArticleStore.actions.distributionAnnotation(null);
	ArticleStore.actions.growthAnnotations(null);
	ArticleStore.actions.statisticsTableFn(null);
	ArticleStore.actions.baseColor('#337ab7');
});

describe('ArticlePageStatistics', () => {
	test.each([
		[false, false],
		[true, true],
	])('shows the current-page label when pagination is %s', (isPaginated, showsLabel) => {
		ArticleStore.actions.statisticsTableFn(() => ({ Tokens: '3' }));
		expect(mountStatistics(isPaginated).text().includes('(current page)')).toBe(showsLabel);
	});

	test('resets statistics configuration on every corpus publication', () => {
		const configure = () => {
			ArticleStore.actions.statisticsTableFn(() => ({ Tokens: '3' }));
			ArticleStore.actions.distributionAnnotation({ id: 'lemma', displayName: 'Lemmas' });
			ArticleStore.actions.growthAnnotations({ annotations: [{ id: 'pos', displayName: 'POS' }], displayName: 'Growth' });
			ArticleStore.actions.baseColor('#ff0000');
		};

		for (const id of ['corpus-b', 'corpus-c']) {
			configure();
			ArticleStore.init({ index: { id } } as unknown as CorpusContext);
			expect(ArticleStore.get.statisticsEnabled()).toBe(false);
			expect(ArticleStore.getState()).toMatchObject({
				statisticsTableFn: null,
				distributionAnnotation: null,
				growthAnnotations: null,
				baseColor: '#337ab7',
			});
		}
	});

	test('renders distribution statistics from article configuration', () => {
		ArticleStore.actions.distributionAnnotation({ id: 'lemma', displayName: 'Lemmas' });

		const wrapper = mountStatistics();
		expect(wrapper.getComponent(AnnotationDistributions).props()).toMatchObject({
			snippet: hit,
			annotationId: 'lemma',
			chartTitle: 'Lemmas',
			baseColor: '#337ab7',
		});
		expect(wrapper.findComponent(AnnotationGrowths).exists()).toBe(false);
	});

	test('renders growth statistics from article configuration', () => {
		const annotations = [{ id: 'pos', displayName: 'Part of speech' }];
		ArticleStore.actions.growthAnnotations({ annotations, displayName: 'Vocabulary growth' });

		const wrapper = mountStatistics();
		expect(wrapper.getComponent(AnnotationGrowths).props()).toMatchObject({
			snippet: hit,
			annotations,
			chartTitle: 'Vocabulary growth',
			baseColor: '#337ab7',
		});
		expect(wrapper.findComponent(AnnotationDistributions).exists()).toBe(false);
	});

	test('renders the table and both charts, and reacts to customization changes', async () => {
		const tableLabel = ref('Tokens');
		const statistics = vi.fn(() => ({ [tableLabel.value]: '3' }));
		ArticleStore.actions.statisticsTableFn(statistics);
		ArticleStore.actions.distributionAnnotation({ id: 'lemma', displayName: 'Lemmas' });
		ArticleStore.actions.growthAnnotations({ annotations: [{ id: 'pos', displayName: 'POS' }], displayName: 'Growth' });

		const wrapper = mountStatistics();
		expect(wrapper.text()).toContain('Tokens');
		expect(statistics).toHaveBeenCalledWith(document, hit);
		expect(wrapper.findComponent(AnnotationDistributions).exists()).toBe(true);
		expect(wrapper.findComponent(AnnotationGrowths).exists()).toBe(true);

		ArticleStore.actions.baseColor('#ff0000');
		await nextTick();
		expect(wrapper.getComponent(AnnotationDistributions).props('baseColor')).toBe('#ff0000');
		expect(wrapper.getComponent(AnnotationGrowths).props('baseColor')).toBe('#ff0000');
		tableLabel.value = 'Words';
		await nextTick();
		expect(wrapper.text()).toContain('Words');
		expect(wrapper.text()).not.toContain('Tokens');

		const replacementStatistics = vi.fn(() => ({ Sentences: '1' }));
		ArticleStore.actions.statisticsTableFn(replacementStatistics);
		ArticleStore.actions.distributionAnnotation({ id: 'pos', displayName: 'Parts of speech' });
		ArticleStore.actions.growthAnnotations({ annotations: [{ id: 'lemma', displayName: 'Lemma' }], displayName: 'Vocabulary' });
		await nextTick();

		expect(wrapper.text()).toContain('Sentences');
		expect(wrapper.text()).not.toContain('Tokens');
		expect(replacementStatistics).toHaveBeenCalledWith(document, hit);
		expect(wrapper.getComponent(AnnotationDistributions).props()).toMatchObject({ annotationId: 'pos', chartTitle: 'Parts of speech' });
		expect(wrapper.getComponent(AnnotationGrowths).props()).toMatchObject({ annotations: [{ id: 'lemma', displayName: 'Lemma' }], chartTitle: 'Vocabulary' });
	});
});

describe('article statistic charts', () => {
	test('builds distribution data, colors, and replacement options', async () => {
		const wrapper = mount(AnnotationDistributions, {
			props: { snippet, annotationId: 'lemma', chartTitle: 'Lemmas', baseColor: '#337ab7' },
		});
		const initial = options(wrapper);
		expect(initial).toMatchObject({
			title: { text: 'Lemmas' },
			series: [
				{
					type: 'pie',
					data: [
						{ name: 'run', y: 2 },
						{ name: 'walk', y: 1 },
					],
					colors: ['rgb(0,20,81)', 'rgb(70,141,202)'],
				},
			],
		});

		await wrapper.setProps({ snippet: { ...snippet, match: { punct: ['', ''], lemma: ['walk'] } } });
		const replacement = options(wrapper);
		expect(replacement).not.toBe(initial);
		expect(replacement.series?.[0]).toMatchObject({ data: [{ name: 'walk', y: 1 }], colors: ['rgb(0,20,81)'] });

		await wrapper.setProps({
			snippet: {
				...snippet,
				match: { punct: Array(22).fill(''), lemma: Array.from({ length: 21 }, (_, i) => `${i}`) },
			},
		});
		const cappedColors = (options(wrapper).series as Highcharts.SeriesPieOptions[])[0].colors;
		expect(cappedColors).toHaveLength(20);
		expect(cappedColors?.[19]).toBe('rgb(255,255,255)');
	});

	test('preserves the growth data transform, color counts, and replacement options', async () => {
		const wrapper = mount(AnnotationGrowths, {
			props: { snippet, annotations: [], chartTitle: 'Growths', baseColor: '#337ab7' },
		});
		const initial = options(wrapper);
		expect(initial).toMatchObject({ title: { text: 'Growths' }, colors: [], series: [] });

		await wrapper.setProps({
			chartTitle: 'Growth',
			annotations: [
				{ id: 'lemma', displayName: 'Lemma' },
				{ id: 'pos', displayName: 'Part of speech' },
			],
		});
		const replacement = options(wrapper);
		expect(replacement).not.toBe(initial);
		expect(replacement.colors).toEqual(['rgb(0,20,81)', 'rgb(70,141,202)']);
		expect(replacement.series).toEqual([
			{
				type: 'line',
				name: 'Lemma',
				boostThreshold: 250,
				keys: ['name', 'x', 'x2', 'y', 'y2'],
				data: [
					['run', 1, 25, 1, 50],
					['run', 2, 50, 1, 50],
					['walk', 3, 75, 2, 100],
				],
			},
			{
				type: 'line',
				name: 'Part of speech',
				boostThreshold: 250,
				keys: ['name', 'x', 'x2', 'y', 'y2'],
				data: [
					['V', 1, 25, 1, 50],
					['V', 2, 50, 1, 50],
					['N', 3, 75, 2, 100],
				],
			},
		]);

		await wrapper.setProps({ annotations: [{ id: 'missing', displayName: 'Missing' }] });
		expect(options(wrapper).series).toEqual([
			{
				type: 'line',
				name: 'Missing',
				boostThreshold: 250,
				keys: ['name', 'x', 'x2', 'y', 'y2'],
				data: [],
			},
		]);
	});
});
