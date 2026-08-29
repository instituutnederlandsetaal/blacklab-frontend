// @vitest-environment jsdom

import { enableAutoUnmount, shallowMount } from '@vue/test-utils';
import { afterEach, describe, expect, test } from 'vitest';
import { nextTick } from 'vue';

import type { ColumnDef, ColumnDefs, DisplaySettingsForRendering, Rows } from '@/pages/search/results/table/table-layout';

import DocRow from '@/pages/search/results/table/DocRow.vue';
import GenericTable from '@/pages/search/results/table/GenericTable.vue';
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

		await hitRows[0].trigger('click');
		expect(hitRows.map(row => row.props('open'))).toEqual([true, true]);
		expect(details.map(detail => detail.props('open'))).toEqual([true, true]);

		await wrapper.setProps({ query: { patt: '[word="changed"]', number: 20 } });
		expect(details.map(detail => detail.props('open'))).toEqual([false, false]);
	});
});
