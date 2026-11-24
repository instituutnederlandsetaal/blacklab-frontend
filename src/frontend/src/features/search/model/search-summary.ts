import { computed, toValue, type MaybeRefOrGetter, type Ref } from 'vue';

import { formatSummaryEntries, type CompiledFormResult, type RestoredForm } from '@/features/form';
import type { SubmittedSearch } from '@/features/search/model/submitted-search';

import useInjectable from '@/shared/utils/useInjectable';

export type SearchSummary = { pattern?: string; filter?: string };

export const [, provideSearchSummary, useSearchSummary] = useInjectable<Readonly<Ref<SearchSummary>>>('searchSummary');

export function summarizeCompiledForm(result: CompiledFormResult) {
	return {
		pattern:
			result.params.colltype !== undefined
				? result.summaries
						.filter(entry => entry.summaryType.some(type => ['patt', 'collpatt', 'context', 'within', 'annotation'].includes(type)))
						.map(entry => `${entry.label}: ${entry.value}`)
						.join(' · ') || undefined
				: formatSummaryEntries(result.summaries, 'patt'),
		filter: formatSummaryEntries(result.summaries, 'filter'),
	};
}

export function summarizeSubmittedSearch(submitted?: SubmittedSearch, compiled?: CompiledFormResult | null): SearchSummary {
	const summaries = compiled ? summarizeCompiledForm(compiled) : undefined;
	return { pattern: summaries?.pattern || submitted?.params.patt || undefined, filter: summaries?.filter || submitted?.params.filter || undefined };
}

/** Summarize the submitted query; editable drafts and result controls are not inputs. */
export function createSearchSummary(submittedInput: MaybeRefOrGetter<SubmittedSearch | undefined>, restored: Readonly<Ref<RestoredForm | null>>) {
	return computed(() => summarizeSubmittedSearch(toValue(submittedInput), restored.value?.submittedResult));
}
