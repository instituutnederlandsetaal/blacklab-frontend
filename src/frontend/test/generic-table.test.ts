// @vitest-environment jsdom

import { enableAutoUnmount, shallowMount } from '@vue/test-utils';
import { afterEach, describe, expect, test } from 'vitest';

import type { ColumnDef, ColumnDefs, DisplaySettingsForRendering } from '@/pages/search/results/table/table-layout';

import GenericTable from '@/pages/search/results/table/GenericTable.vue';
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
});
