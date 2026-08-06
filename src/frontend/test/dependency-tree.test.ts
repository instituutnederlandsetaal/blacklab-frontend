// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';

import type { HitContext, NormalizedAnnotation } from '@/types/apptypes';
import type { BLHit } from '@/types/blacklabtypes';

import DepTree from '@/pages/search/results/table/DepTree.vue';

const annotation = (id: string, isMainAnnotation = false): NormalizedAnnotation => ({
	annotatedFieldId: 'contents',
	caseSensitive: false,
	defaultDescription: '',
	defaultDisplayName: id,
	hasForwardIndex: true,
	id,
	isInternal: false,
	isMainAnnotation,
	offsetsAlternative: '',
	uiType: 'text',
});

const context: HitContext = {
	after: [],
	before: [],
	match: [
		{ annotations: { lemma: 'cat', word: 'Cats' }, punct: '' },
		{ annotations: { lemma: 'chase', word: 'chase' }, punct: ' ' },
		{ annotations: { lemma: 'mouse', word: 'mice' }, punct: ' ' },
	],
};
const matchInfos = {
	root: { type: 'relation', relClass: 'dep', relType: 'root', targetStart: 11, targetEnd: 12, start: 11, end: 12 },
	subject: { type: 'relation', relClass: 'dep', relType: 'nsubj', sourceStart: 11, sourceEnd: 12, targetStart: 10, targetEnd: 11, start: 10, end: 12 },
	object: { type: 'relation', relClass: 'dep', relType: 'obj', sourceStart: 11, sourceEnd: 12, targetStart: 12, targetEnd: 13, start: 11, end: 13 },
	semantic: { type: 'relation', relClass: 'semantic', relType: 'agent', sourceStart: 10, sourceEnd: 11, targetStart: 12, targetEnd: 13, start: 10, end: 13 },
} satisfies NonNullable<BLHit['matchInfos']>;

function render(dir: 'ltr' | 'rtl' = 'ltr') {
	return mount(DepTree, {
		props: {
			context,
			dir,
			hitStart: 10,
			matchInfos,
			primaryAnnotation: annotation('word', true),
			secondaryAnnotations: [annotation('word', true), annotation('lemma')],
		},
	});
}

describe('dependency tree', () => {
	test('renders tokens, annotations, roots, and dependency arcs directly as SVG', () => {
		const wrapper = render();

		expect(wrapper.findAll('text.form').map(node => node.text())).toEqual(['Cats', 'chase', 'mice']);
		expect(wrapper.findAll('text.feature').map(node => node.text())).toEqual(['lemma=cat', 'lemma=chase', 'lemma=mouse']);
		expect(wrapper.findAll('.relations text').map(node => node.text())).toEqual(['root', 'nsubj', 'obj']);
		expect(wrapper.findAll('.relations path')).toHaveLength(3);
		expect(wrapper.findAll('.relations path').every(node => !node.attributes('d')?.includes('NaN'))).toBe(true);
	});

	test('switches relation classes without rebuilding an imperative renderer', async () => {
		const wrapper = render();

		await wrapper.get('select').setValue('semantic');

		expect(wrapper.findAll('.relations text').map(node => node.text())).toEqual(['agent']);
		expect(wrapper.findAll('.relations path')).toHaveLength(1);
	});

	test('lays tokens out in visual RTL order', () => {
		const wrapper = render('rtl');

		expect(wrapper.findAll('text.form').map(node => node.text())).toEqual(['mice', 'chase', 'Cats']);
		expect(wrapper.get('svg').attributes('dir')).toBe('rtl');
	});
});
