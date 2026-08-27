// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest';

import * as RootStore from '@/app/state/root-store';
import { searchFormIds } from '@/customization-api/shared/form/ids';
import type { CompiledFormResult, FormRuntime } from '@/features/form';

import { createTestBuilder, createTestRuntime } from './helpers';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import QueryForm from '@/pages/search/form/QueryForm.vue';

type SubmitContext = {
	confirmLargeExploreSearch(form?: 'search' | 'explore'): boolean;
	newForm: FormRuntime | null;
	blurActiveElement(): void;
};

type SubmitNewForm = (this: SubmitContext, snapshot: CompiledFormResult) => void;

const submitNewForm = (QueryForm as unknown as { methods: { submitNewForm: SubmitNewForm } }).methods.submitNewForm;

afterEach(() => vi.restoreAllMocks());

describe('new query form submission', () => {
	test('passes the effective compiled result to the search handoff', () => {
		const builder = createTestBuilder();
		const form = builder.newForm(searchFormIds.searchForm('simple'), ContainerRenderer, {});
		const runtime = createTestRuntime(builder);
		runtime.state.rawOverrides.value.patt = '[word="restored"]';
		runtime.state.rawOverrides.value.collpatt = '[lemma="ignored"]';
		const snapshot = runtime.compile(form.id);
		const searchFromSubmit = vi.spyOn(RootStore.actions, 'searchFromSubmit').mockImplementation(() => undefined);

		submitNewForm.call(
			{
				confirmLargeExploreSearch: () => true,
				newForm: runtime,
				blurActiveElement: vi.fn(),
			},
			snapshot,
		);

		expect(snapshot.params).toEqual({ patt: '[word="restored"]' });
		expect(searchFromSubmit).toHaveBeenCalledWith(snapshot);
	});
});
