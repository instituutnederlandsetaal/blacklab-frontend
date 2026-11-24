import { ref, type Ref } from 'vue';

import { ResultsState, defaults, type ActiveSearchInputs } from '@/features/search/model/results/results-state';

export function createTestResultsState(pageSize: Ref<number> = ref(defaults.pageSize), inputs: Partial<ActiveSearchInputs> = {}) {
	return new ResultsState({ corpus: undefined, submitted: undefined, withSpans: () => null, debug: false, ...inputs }, pageSize);
}
