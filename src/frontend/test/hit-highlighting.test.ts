import { describe, expect, test } from 'vitest';

import { getHighlightSections, mergeMatchInfos } from '@/pages/search/results/table/hit-highlighting';
import type { BLHitInOtherField, BLHitResults, BLMatchInfo, BLMatchInfoList, BLMatchInfoRelation } from '@/types/blacklabtypes';

function relation(relType: string, targetField?: string): BLMatchInfoRelation {
	return {
		type: 'relation',
		relClass: 'align',
		relType,
		sourceStart: 1,
		sourceEnd: 2,
		targetStart: 10,
		targetEnd: 11,
		targetField,
		start: 1,
		end: 11,
	};
}

function target(matchInfos?: Record<string, BLMatchInfo>): BLHitInOtherField {
	return {
		before: { punct: [] },
		match: { punct: [] },
		after: { punct: [] },
		start: 10,
		end: 11,
		matchInfos,
	};
}

function results(matchInfos: Record<string, BLMatchInfo>, otherFields: Record<string, BLHitInOtherField>): BLHitResults {
	return {
		docInfos: {},
		hits: [
			{
				docPid: 'doc',
				before: { punct: [] },
				match: { punct: [] },
				after: { punct: [] },
				start: 1,
				end: 2,
				matchInfos,
				otherFields,
			},
		],
		summary: {} as BLHitResults['summary'],
	};
}

function highlightKeys(matchInfos: Record<string, BLMatchInfo>): string[] {
	return getHighlightSections(matchInfos, () => null).map(section => section.key);
}

describe('parallel hit highlighting', () => {
	test('keeps mixed-target relation list indexes while hiding foreign target relations', () => {
		const align = {
			type: 'list',
			start: 1,
			end: 11,
			infos: [relation('a', 'contents__a'), relation('b', 'contents__b')],
		} satisfies BLMatchInfoList;
		const data = results({ align }, { contents__a: target(), contents__b: target() });

		mergeMatchInfos(data);

		expect(highlightKeys(data.hits[0].matchInfos!)).toEqual(['align[0]', 'align[1]']);
		expect(highlightKeys(data.hits[0].otherFields!.contents__a.matchInfos!)).toEqual(['align[0]']);
		expect(highlightKeys(data.hits[0].otherFields!.contents__b.matchInfos!)).toEqual(['align[1]']);
	});

	test('keeps target-owned match info when a copied source entry has the same key', () => {
		const targetOwn = relation('target-own');
		const data = results({ align: relation('copied', 'contents__a') }, { contents__a: target({ align: targetOwn }) });

		mergeMatchInfos(data);

		expect(data.hits[0].otherFields!.contents__a.matchInfos!.align).toBe(targetOwn);
	});
});
