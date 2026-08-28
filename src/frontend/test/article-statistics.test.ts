// @vitest-environment jsdom

import { mount, shallowMount, type VueWrapper } from '@vue/test-utils';
import type * as Highcharts from 'highcharts';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';

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

function mountStatistics() {
	return shallowMount(ArticlePageStatistics, { props: { snippet: hit, document } });
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
	test('renders distribution statistics from article configuration', () => {
		ArticleStore.actions.distributionAnnotation({ id: 'lemma', displayName: 'Lemmas' });

		const wrapper = mountStatistics();
		expect(wrapper.vm.$options.props).toMatchObject({
			snippet: { type: Object, required: true },
			document: { type: Object, required: true },
			isPaginated: Boolean,
		});
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

	test('renders the table and both charts, and reacts to article color changes', async () => {
		const statistics = vi.fn(() => ({ Tokens: '3' }));
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
	});
});

describe('article statistic charts', () => {
	test('builds distribution data, colors, and replacement options', async () => {
		const wrapper = mount(AnnotationDistributions, {
			props: { snippet, annotationId: 'lemma', chartTitle: 'Lemmas', baseColor: '#337ab7' },
		});
		expect(wrapper.vm.$options.props).toMatchObject({ snippet: Object, baseColor: String, annotationId: String, chartTitle: String });
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

	test('preserves the growth defaults, data transform, color counts, and replacement options', async () => {
		const wrapper = mount(AnnotationGrowths, {
			props: { snippet, baseColor: '#337ab7' },
		});
		expect(wrapper.vm.$options.props).toMatchObject({
			snippet: { type: Object, required: true },
			annotations: Array,
			chartTitle: { type: String, default: 'Growths' },
			baseColor: String,
		});
		const initial = options(wrapper);
		expect(initial).toMatchObject({ title: { text: 'Growths' }, colors: ['rgb(0,20,81)'], series: [] });

		await wrapper.setProps({ annotations: [] });
		expect(options(wrapper)).toMatchObject({ colors: [], series: [] });

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
	});
});
