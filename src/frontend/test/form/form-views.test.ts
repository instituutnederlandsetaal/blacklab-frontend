// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue';

import { type FormRuntime, type SummaryTotalsState } from '@/features/form';
import { provideFormSystemRuntime, provideParentForm } from '@/features/form/model/runtime';
import { type CompiledFormSummary } from '@/features/form/model/types/form-result';

import HeadingView from '@/features/form/views/HeadingView.vue';
import SummaryView from '@/features/form/views/SummaryView.vue';

function mountSummary() {
	const compiled = ref<CompiledFormSummary>({ params: {}, summaries: [] });
	const totals = ref<SummaryTotalsState>({ status: 'loading' });
	const update = vi.fn();
	const dispose = vi.fn();
	// SummaryView consumes only this injected projection; compilation has its own contract tests.
	const runtime = { compileSummary: () => compiled.value } satisfies Pick<FormRuntime, 'compileSummary'>;
	const Host = defineComponent({
		setup() {
			provideFormSystemRuntime(shallowRef(runtime as unknown as FormRuntime));
			provideParentForm(ref('search'));
			return () => h(SummaryView, { createTotals: () => ({ state: totals, update, dispose }) });
		},
	});
	return { compiled, totals, update, dispose, wrapper: mount(Host) };
}

describe('heading view', () => {
	test('heading renders deferred text and its help link', async () => {
		const title = ref('Search');
		const wrapper = mount(HeadingView, {
			props: {
				title: () => title.value,
				description: 'Choose a query.',
				help: { href: 'https://example.com/help', title: 'Learn more' },
			},
		});
		expect(wrapper.get('h3').text()).toContain('Search');
		expect(wrapper.get('p').text()).toBe('Choose a query.');
		expect(wrapper.get('h3 a').attributes()).toMatchObject({ href: 'https://example.com/help', 'aria-label': 'Learn more', rel: 'noopener noreferrer', target: '_blank' });
		title.value = 'Zoeken';
		await nextTick();
		expect(wrapper.get('h3').text()).toContain('Zoeken');
	});
});

describe('summary view component contract', () => {
	test('renders only summaries affecting the filter parameter', async () => {
		const { compiled, wrapper } = mountSummary();
		compiled.value.summaries = [
			{ label: 'Frontend only', summaryType: [], value: 'frontend' },
			{ label: 'Pattern only', summaryType: ['patt'], value: 'pattern' },
			{ label: 'Author', summaryType: ['filter'], value: 'Austen', group: 'Bibliographic' },
			{ label: 'Multi-type', summaryType: ['patt', 'filter'], value: 'shared' },
		];
		await nextTick();
		expect(wrapper.text()).toContain('Author (Bibliographic): Austen');
		expect(wrapper.text()).toContain('Multi-type: shared');
		expect(wrapper.text()).not.toContain('Frontend only');
		expect(wrapper.text()).not.toContain('Pattern only');
	});

	test('passes filter and searchfield changes to its totals controller and disposes it on unmount', async () => {
		const { compiled, update, dispose, wrapper } = mountSummary();
		expect(update).toHaveBeenLastCalledWith({ filter: undefined, searchfield: undefined });
		compiled.value.params = { filter: 'author:(Austen)', searchfield: 'contents__en' };
		await nextTick();
		expect(update).toHaveBeenLastCalledWith({ filter: 'author:(Austen)', searchfield: 'contents__en' });
		compiled.value.params.searchfield = 'contents__nl';
		await nextTick();
		expect(update).toHaveBeenLastCalledWith({ filter: 'author:(Austen)', searchfield: 'contents__nl' });
		compiled.value.params.filter = undefined;
		await nextTick();
		expect(update).toHaveBeenLastCalledWith({ filter: undefined, searchfield: 'contents__nl' });
		wrapper.unmount();
		expect(dispose).toHaveBeenCalledOnce();
	});

	test('renders loading, loaded totals with percentages, and errors', async () => {
		const { totals, wrapper } = mountSummary();
		expect(wrapper.text()).toContain('filterOverview.calculating');
		totals.value = { status: 'loaded', documents: 25, tokens: 400, totalDocuments: 100, totalTokens: 1000 };
		await nextTick();
		expect(wrapper.findAll('.numbers').map(node => node.text())).toEqual(['25 400', '(25%) (40%)']);
		totals.value = { status: 'error', message: 'Count failed' };
		await nextTick();
		expect(wrapper.text()).toContain('filterOverview.error: Count failed');
	});
});
