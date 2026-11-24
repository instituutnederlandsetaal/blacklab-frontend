import { computed, toValue, type MaybeRefOrGetter, type Ref } from 'vue';

import type { CompiledFormResult, RestoredForm, SummaryEntry, SummaryType } from '@/features/form';
import type { SubmittedSearch } from '@/pages/search/model/submitted-search';

import createAppInjection from '@/shared/vue/injection';

export type SearchSummary = { pattern?: string; filter?: string };

export const [, provideSearchSummary, useSearchSummary] = createAppInjection<Readonly<Ref<SearchSummary>>>('searchSummary');

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

/** Return undefined when no field contributes, so callers can fall back to raw query text. */
function formatSummaryEntries(entries: readonly SummaryEntry[], type: SummaryType): string | undefined {
	const matching = entries.filter(entry => entry.summaryType.includes(type));
	return matching.length ? matching.map(entry => `${entry.label}: ${entry.value}`).join(', ') : undefined;
}

/** Summarize the submitted query; editable drafts and result controls are not inputs. */
export function createSearchSummary(submittedInput: MaybeRefOrGetter<SubmittedSearch | undefined>, restored: Readonly<Ref<RestoredForm | null>>) {
	return computed(() => summarizeSubmittedSearch(toValue(submittedInput), restored.value?.submittedResult));
}
