// @vitest-environment jsdom

import { enableAutoUnmount, shallowMount } from '@vue/test-utils';
import { afterEach, describe, expect, test } from 'vitest';
import { nextTick } from 'vue';

import type { ColumnDef, ColumnDefs, DisplaySettingsForRendering, Rows } from '@/pages/search/results/table/table-layout';

import DocRow from '@/pages/search/results/table/DocRow.vue';
import DocRowDetails from '@/pages/search/results/table/DocRowDetails.vue';
import GenericTable from '@/pages/search/results/table/GenericTable.vue';
import GroupRow from '@/pages/search/results/table/GroupRow.vue';
import HitRow from '@/pages/search/results/table/HitRow.vue';
import HitRowDetails from '@/pages/search/results/table/HitRowDetails.vue';
import TableHeader from '@/pages/search/results/table/TableHeader.vue';

enableAutoUnmount(afterEach);

describe('GenericTable', () => {
	test('renders and forwards events from imported table headers', () => {
		const column = { key: 'summary', field: 'summary', label: 'Document' } as ColumnDef;
		const cols = { hitColumns: [], docColumns: [column], groupColumns: [], groupModeOptions: [] } as ColumnDefs;
		const wrapper = shallowMount(GenericTable, {
			props: { cols, header: [column], rows: { rows: [] }, info: {} as DisplaySettingsForRendering, type: 'docs' },
		});

		const header = wrapper.findComponent(TableHeader);
		expect(header.props('col')).toEqual(column);
		header.vm.$emit('changeSort', 'field:title');
		expect(wrapper.emitted('changeSort')).toEqual([['field:title']]);
	});

	test('shares hover and open state across parallel rows and closes details when the query changes', async () => {
		const columns = { hitColumns: [], docColumns: [], groupColumns: [], groupModeOptions: [] } as ColumnDefs;
		const rows = {
			rows: [
				{ type: 'doc', hit_id: undefined, muted: false },
				{ type: 'hit', hit_id: 'shared-hit', isForeign: false, first_of_hit: true, last_of_hit: false, muted: false },
				{ type: 'hit', hit_id: 'shared-hit', isForeign: true, first_of_hit: false, last_of_hit: true, muted: false },
			],
		} as Rows;
		const wrapper = shallowMount(GenericTable, {
			props: { cols: columns, header: [], rows, info: {} as DisplaySettingsForRendering, type: 'hits', query: { patt: '[]', number: 20 } },
		});

		expect(wrapper.findComponent(DocRow).exists()).toBe(true);
		const hitRows = wrapper.findAllComponents(HitRow);
		const details = wrapper.findAllComponents(HitRowDetails);
		expect(hitRows).toHaveLength(2);
		expect(details).toHaveLength(2);
		expect(details.map(detail => detail.props('open'))).toEqual([false, false]);

		hitRows[0].vm.$emit('hover', ['relation']);
		await nextTick();
		expect(hitRows.map(row => row.props('hoverMatchInfos'))).toEqual([['relation'], ['relation']]);
		details[1].vm.$emit('hover', ['detail-relation']);
		await nextTick();
		expect(details.map(detail => detail.props('hoverMatchInfos'))).toEqual([['detail-relation'], ['detail-relation']]);
		details[0].vm.$emit('unhover');
		await nextTick();
		expect(hitRows.map(row => row.props('hoverMatchInfos'))).toEqual([undefined, undefined]);

		await hitRows[0].trigger('click');
		expect(hitRows.map(row => row.props('open'))).toEqual([true, true]);
		expect(details.map(detail => detail.props('open'))).toEqual([true, true]);
		await hitRows[1].trigger('click');
		expect(hitRows.map(row => row.props('open'))).toEqual([false, false]);
		await hitRows[0].trigger('click');

		await wrapper.setProps({ query: { patt: '[word="changed"]', number: 20 } });
		expect(details.map(detail => detail.props('open'))).toEqual([false, false]);
	});

	test('opens only enabled rows with available details', async () => {
		const columns = { hitColumns: [], docColumns: [], groupColumns: [], groupModeOptions: [] } as ColumnDefs;
		const rows = {
			rows: [
				{ type: 'doc', hit_id: undefined, hits: [], muted: false },
				{ type: 'doc', hit_id: undefined, muted: false },
				{ type: 'group', hit_id: undefined, id: 'group', displayname: 'Group', muted: false },
			],
		} as Rows;
		const wrapper = shallowMount(GenericTable, {
			props: { cols: columns, disabled: true, header: [], rows, info: {} as DisplaySettingsForRendering, type: 'docs' },
		});
		const docRows = wrapper.findAllComponents(DocRow);
		const groupRow = wrapper.getComponent(GroupRow);

		await docRows[0].trigger('click');
		expect(docRows[0].props('open')).toBe(false);
		await wrapper.setProps({ disabled: false });
		await docRows[0].trigger('click');
		expect(docRows[0].props('open')).toBe(true);
		await docRows[1].trigger('click');
		expect(docRows[1].props('open')).toBe(false);
		await groupRow.trigger('click');
		expect(groupRow.props('open')).toBe(true);

		expect(wrapper.findAllComponents(DocRowDetails)).toHaveLength(2);
		await wrapper.setProps({ disableDetails: true });
		expect(wrapper.findAllComponents(DocRowDetails)).toHaveLength(0);
		await groupRow.trigger('click');
		expect(groupRow.props('open')).toBe(true);
	});
});
