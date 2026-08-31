// @vitest-environment jsdom

import { mount, RouterLinkStub } from '@vue/test-utils';
import { afterEach, describe, expect, test } from 'vitest';

import type { NormalizedFormat, NormalizedIndexBase } from '@/types/apptypes';

import debug from '@/shared/debug/debug';

import CorpusTable from '@/pages/corpora/CorpusTable.vue';
import FormatsTable from '@/pages/corpora/FormatsTable.vue';
import Spinner from '@/shared/ui/Spinner.vue';

const format = {
	id: 'alice:tei',
	owner: 'alice',
	shortId: 'tei',
	displayName: 'TEI',
} as NormalizedFormat;

function corpus(overrides: Partial<NormalizedIndexBase> = {}): NormalizedIndexBase {
	return {
		description: 'A corpus',
		displayName: 'Shared name',
		documentFormat: format.id,
		id: 'alice:first',
		indexProgress: null,
		owner: 'alice',
		status: 'available',
		timeModified: '2024-03-02 12:34:56',
		tokenCount: 2_695_798,
		documentCount: 1_234,
		...overrides,
	};
}

function mountCorpusTable(props: Partial<InstanceType<typeof CorpusTable>['$props']> = {}) {
	return mount(CorpusTable, {
		props: { corpora: [corpus()], formats: [format], ...props },
		global: { stubs: { RouterLink: RouterLinkStub, Spinner: true } },
	});
}

afterEach(() => {
	debug.value = false;
});

describe('CorpusTable', () => {
	test('renders corpus state, routes, counts, and duplicate names from its partition', async () => {
		const pendingIndex = corpus({ id: 'alice:pending', displayName: 'Pending', status: 'indexing' });
		const indexing = corpus({
			id: 'alice:second',
			status: 'indexing',
			indexProgress: { filesProcessed: 2, docsDone: 3, tokensProcessed: 4 } as NonNullable<NormalizedIndexBase['indexProgress']>,
		});
		const wrapper = mountCorpusTable({ corpora: [corpus(), pendingIndex, indexing], title: 'Public corpora' });
		const links = wrapper.findAllComponents(RouterLinkStub);

		expect(wrapper.text()).toContain('Public corpora');
		expect(wrapper.text()).toContain('Shared name (alice:first)');
		expect(wrapper.findAll('.corpus-name a')[1].text()).toContain('(indexing)');
		expect(wrapper.text()).toContain('(indexing) - 2 files, 3 documents, and 4 tokens indexed so far...');
		expect(wrapper.text()).toContain('2,7M');
		expect(links[0].props('to')).toEqual({ name: 'search', params: { corpus: 'alice:first' } });
		expect(links[0].classes()).not.toContain('disabled');
		expect(links[2].classes()).toContain('disabled');

		await wrapper.find('span[title="show details"]').trigger('click');
		expect(wrapper.get('tr[title="2024-03-02 12:34:56"]').text()).toContain('02-03-2024');
		expect(wrapper.text()).toContain('1,234');
		expect(wrapper.text()).toContain('2,695,798');
		expect(wrapper.text()).toContain('A corpus');
	});

	test('preserves private actions, capabilities, format ownership, debug width, and creation limit', async () => {
		debug.value = true;
		const opening = corpus({ id: 'alice:opening', displayName: 'Opening', status: 'opening' });
		const wrapper = mountCorpusTable({ corpora: [corpus(), opening], isPrivate: true, canCreateCorpus: true, loading: true });

		expect(wrapper.findComponent(Spinner).props('overlay')).toBe(true);
		expect(wrapper.findAll('.fa-search')[1].classes()).toContain('disabled');
		expect(wrapper.findAll('.fa-cloud-upload')[1].classes()).toContain('disabled');
		expect(wrapper.findAll('.fa-trash')[1].classes()).toContain('disabled');

		await wrapper.find('.fa-cloud-upload').trigger('click');
		await wrapper.find('.fa-user-plus').trigger('click');
		await wrapper.find('.fa-trash').trigger('click');
		await wrapper.get('#create-corpus').trigger('click');
		expect(wrapper.emitted('upload')).toEqual([['alice:first']]);
		expect(wrapper.emitted('share')).toEqual([['alice:first']]);
		expect(wrapper.emitted('delete')).toEqual([['alice:first']]);
		expect(wrapper.emitted('create')).toEqual([[]]);

		await wrapper.find('span[title="show details"]').trigger('click');
		expect(wrapper.get('td[title="Format owned by alice"]').text()).toBe('*tei');
		expect(wrapper.get('td[colspan]').attributes('colspan')).toBe('8');

		await wrapper.setProps({ canCreateCorpus: false });
		expect(wrapper.find('#create-corpus').exists()).toBe(false);
		expect(wrapper.text()).toContain('You have reached the private corpora limit.');
	});
});

describe('FormatsTable', () => {
	test('preserves loading state, display, titles, and action payloads', async () => {
		const wrapper = mount(FormatsTable, { props: { formats: [format], loading: true }, global: { stubs: { Spinner: true } } });

		expect(wrapper.findComponent(Spinner).props()).toMatchObject({ lg: true, overlay: true });
		expect(wrapper.text()).toContain('tei');
		expect(wrapper.text()).toContain('TEI');
		expect(wrapper.get('.fa-pencil').attributes('title')).toBe("Edit format 'TEI'");
		expect(wrapper.get('.fa-trash').attributes('title')).toBe("Delete format 'TEI'");

		await wrapper.get('.fa-pencil').trigger('click');
		await wrapper.get('.fa-trash').trigger('click');
		await wrapper.get('button').trigger('click');
		expect(wrapper.emitted('edit')).toEqual([[format.id]]);
		expect(wrapper.emitted('delete')).toEqual([[format.id]]);
		expect(wrapper.emitted('create')).toEqual([[]]);
	});
});
