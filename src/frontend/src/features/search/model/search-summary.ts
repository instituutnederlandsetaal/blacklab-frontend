import { computed, toValue, type MaybeRefOrGetter, type Ref } from 'vue';

import { getFilterSummary } from '@/components/filters/filterValueFunctions';
import { formatSummaryEntries, type CompiledFormResult } from '@/features/form';
import type { ModuleRootState as FormState } from '@/features/search/model/form/form-state';
import type { SearchSummary, SubmittedSearch, SubmittedFormRestoration } from '@/features/search/model/submitted-search';
import type { Corpus } from '@/types/apptypes';

import { getPatternSummaryExplore } from '@/shared/blacklab-helpers/pattern-utils';
import useInjectable from '@/shared/utils/useInjectable';

export type { SearchSummary } from '@/features/search/model/submitted-search';

export const [, provideSearchSummary, useSearchSummary] = useInjectable<Readonly<Ref<SearchSummary>>>('searchSummary');

export function summarizeLegacySearch(state: Pick<FormState, 'interface' | 'explore' | 'filters'>, patt: string | undefined, annotations: Corpus['allAnnotationsMap']): SearchSummary {
	return {
		pattern: state.interface.form === 'search' ? patt : getPatternSummaryExplore(state.interface.exploreMode, state.explore, annotations),
		filter: getFilterSummary(Object.values(state.filters).sort((a, b) => a.id.localeCompare(b.id))),
	};
}

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

/** Summarize the submitted query; editable drafts and result controls are not inputs. */
export function createSearchSummary(submittedInput: MaybeRefOrGetter<SubmittedSearch | undefined>, restored: SubmittedFormRestoration) {
	return computed<SearchSummary>(() => {
		const submitted = toValue(submittedInput);
		const compiled = restored.value?.submittedResult;
		const summaries = compiled ? summarizeCompiledForm(compiled) : submitted?.summary;
		return { pattern: summaries?.pattern || submitted?.params.patt || undefined, filter: summaries?.filter || submitted?.params.filter || undefined };
	});
}
