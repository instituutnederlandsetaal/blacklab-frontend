import { vi } from 'vitest';
import { computed, toValue, type App, type MaybeRefOrGetter, type Ref } from 'vue';

import { defaultConfig, provideCorpus, provideCfPageConfig, provideCorpusContextLoader, type CorpusContext } from '@/app/state/useCorpusContext';
import type { CFPageConfig, Corpus } from '@/types/apptypes';

import { Loadable } from '@/shared/utils/loadable/loadable-core';
import type { LoadableFromRequest } from '@/shared/utils/loadable/loadable-datasource';
import { loadableReactiveFromSnapshot } from '@/shared/utils/loadable/loadable-reactive';

export function createMockCorpusContext(
	options: {
		corpus?: MaybeRefOrGetter<Corpus | undefined>;
		config?: MaybeRefOrGetter<Partial<CFPageConfig>>;
		loader?: LoadableFromRequest<CorpusContext>;
	} = {},
) {
	const defaults = structuredClone(defaultConfig);
	const contextLoader =
		options.loader ??
		loadableReactiveFromSnapshot(
			computed(() =>
				Loadable.Loaded<CorpusContext>({
					index: toValue(options.corpus),
					config: { ...defaults, ...toValue(options.config) },
					tagset: undefined,
				}),
			),
			{ retry: vi.fn() },
		);
	const corpus = computed(() => contextLoader.value?.index);
	const config = computed(() => contextLoader.value?.config ?? defaults);
	return {
		corpus,
		config,
		contextLoader,
		install(app: App) {
			provideCorpus(app, corpus as Ref<Corpus>);
			provideCfPageConfig(app, config);
			provideCorpusContextLoader(app, contextLoader);
		},
	};
}
