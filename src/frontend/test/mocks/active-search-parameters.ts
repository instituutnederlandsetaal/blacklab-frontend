import { computed, toValue, type MaybeRefOrGetter, type Plugin } from 'vue';

import { provideActiveSearch, type ActiveSearchParameters } from '@/features/search/model/active-search';

export function provideMockActiveSearchParameters(parameters: ActiveSearchParameters, view: MaybeRefOrGetter<string | null> = 'hits'): Plugin {
	return app => provideActiveSearch(app, { parameters, view: computed(() => toValue(view)) });
}
