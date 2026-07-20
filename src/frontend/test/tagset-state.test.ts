import { describe, expect, test } from 'vitest';

import { normalizeTagset } from '@/features/corpus/model/tagset-state';
import type { NormalizedAnnotation, Tagset } from '@/types/apptypes';

function annotation(id: string, defaultDisplayName: string, values: Array<{ value: string; label: string }>): NormalizedAnnotation {
	return {
		annotatedFieldId: 'contents',
		caseSensitive: false,
		defaultDescription: '',
		defaultDisplayName,
		hasForwardIndex: true,
		id,
		isInternal: false,
		isMainAnnotation: false,
		offsetsAlternative: '',
		uiType: id === 'pos' ? 'pos' : 'select',
		values: values.map(value => ({ ...value, title: null })),
	};
}

describe('tagset processing', () => {
	test('merges meaningful corpus and tagset display names back into both sources', () => {
		const pos = annotation('pos', 'Part of speech', [
			{ value: 'NOU', label: 'Noun from corpus' },
			{ value: 'VRB', label: 'Verb from corpus' },
		]);
		const number = annotation('number', 'Number from corpus', [
			{ value: 'SG', label: 'Singular from corpus' },
			{ value: 'PL', label: 'Plural from corpus' },
		]);
		const tagset: Tagset = {
			values: {
				NOU: { value: 'NOU', displayName: 'NOU', subAnnotationIds: ['number'] },
				VRB: { value: 'VRB', displayName: 'Verb from tagset', subAnnotationIds: [] },
			},
			subAnnotations: {
				number: {
					id: 'number',
					displayName: 'Grammatical number',
					values: [
						{ value: 'SG', displayName: 'SG', pos: ['NOU'] },
						{ value: 'PL', displayName: 'Plural from tagset', pos: ['NOU'] },
					],
				},
			},
		};

		const normalized = normalizeTagset(pos, { pos, number }, tagset);

		expect(normalized.values.NOU.displayName).toBe('Noun from corpus');
		expect(normalized.values.VRB.displayName).toBe('Verb from tagset');
		expect(pos.values).toEqual([
			{ value: 'nou', label: 'Noun from corpus', title: null },
			{ value: 'vrb', label: 'Verb from tagset', title: null },
		]);
		expect(normalized.subAnnotations.number.displayName).toBe('Grammatical number');
		expect(number.defaultDisplayName).toBe('Grammatical number');
		expect(normalized.subAnnotations.number.values.map(value => value.displayName)).toEqual(['Singular from corpus', 'Plural from tagset']);
		expect(number.values?.map(value => value.label)).toEqual(['Singular from corpus', 'Plural from tagset']);
	});

	test('builds equivalent tagset data from the corpus when no tagset is configured', () => {
		const pos = annotation('pos', 'Part of speech', [{ value: 'NOU', label: 'Noun' }]);
		const number = annotation('number', 'Number', [{ value: 'SG', label: 'Singular' }]);
		pos.subAnnotations = ['number'];
		number.parentAnnotationId = 'pos';

		const normalized = normalizeTagset(pos, { pos, number });

		expect(normalized).toEqual({
			values: { NOU: { value: 'nou', displayName: 'Noun', subAnnotationIds: ['number'] } },
			subAnnotations: {
				number: { id: 'number', displayName: 'Number', values: [{ value: 'sg', displayName: 'Singular' }] },
			},
		});
	});

	test('uses the cased raw spelling as display name when case-insensitive sources disagree', () => {
		const pos = annotation('pos', 'Part of speech', [
			{ value: 'NOU', label: 'NOU' },
			{ value: 'vrb', label: 'vrb' },
		]);
		const configured: Tagset = {
			values: {
				nou: { value: 'nou', displayName: 'nou', subAnnotationIds: [] },
				VRB: { value: 'VRB', displayName: 'VRB', subAnnotationIds: [] },
			},
			subAnnotations: {},
		};

		const normalized = normalizeTagset(pos, { pos }, configured);

		expect(Object.values(normalized.values).map(value => ({ value: value.value, displayName: value.displayName }))).toEqual([
			{ value: 'nou', displayName: 'NOU' },
			{ value: 'vrb', displayName: 'VRB' },
		]);
		expect(pos.values?.map(value => ({ value: value.value, label: value.label }))).toEqual([
			{ value: 'nou', label: 'NOU' },
			{ value: 'vrb', label: 'VRB' },
		]);
	});

	test('does not replace normalized corpus values when normalization is repeated', () => {
		const pos = annotation('pos', 'Part of speech', [{ value: 'NOU', label: 'Noun' }]);
		const configured: Tagset = {
			values: { NOU: { value: 'NOU', displayName: 'Noun', subAnnotationIds: [] } },
			subAnnotations: {},
		};

		normalizeTagset(pos, { pos }, configured);
		const normalizedValues = pos.values;
		normalizeTagset(pos, { pos }, configured);

		expect(pos.values).toBe(normalizedValues);
	});
});
