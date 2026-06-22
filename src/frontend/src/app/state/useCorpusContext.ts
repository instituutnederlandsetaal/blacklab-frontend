import { computed, toValue, type MaybeRefOrGetter, type ObjectPlugin, type Ref } from 'vue';

import { processTagset } from '@/features/corpus/model/tagset-state';
import type { CFPageConfig, NormalizedIndex, Tagset } from '@/types/apptypes';

import type { BlackLabApi, CancelableRequest, FrontendApi } from '@/shared/api/lib/api-types';
import { resolvedRequest } from '@/shared/api/lib/api-utils';
import { LoadableState } from '@/shared/utils/loadable/loadable';
import { combineLoadables, loadableFromRequest, mapLoadableReactive, type LoadableFromRequest } from '@/shared/utils/loadable/loadable-reactive';
import useInjectable from '@/shared/utils/useInjectable';

type CorpusContext = {
	index: NormalizedIndex | undefined;
	config: CFPageConfig;
	tagset: Tagset | undefined;
};

const [_corpusLoadableKey, provideCorpusContextLoader, _useCorpusContextLoader] = useInjectable<LoadableFromRequest<CorpusContext>>('corpus_context_loader');
const [_corpusStateKey, provideCorpusContext, _useCorpusContext] = useInjectable<Ref<CorpusContext>>('corpus_context');
const [_cfPageConfigKey, provideCfPageConfig, _useCfPageConfig] = useInjectable<Ref<CFPageConfig>>('cf_page_config');
const [_tagsetKey, provideTagset, _useTagset] = useInjectable<Ref<Tagset | undefined>>('tagset');
const [_corpusKey, provideCorpus, _useCorpus] = useInjectable<Ref<NormalizedIndex | undefined>>('corpus');

// Jump through some hoops to add docstrings to the use* functions, since it doesn't seem to be possible to add them to destructured variables directly?

/** Returns the true value of the corpus context, including loading, error, empty states. When you just need the value, and you _know_ it's loaded, use useCorpusContext. */
const useCorpusContextLoader = _useCorpusContextLoader;
/** Ease-of-use function for locations where you _know_ the corpus state is loaded, such as in components on the search/article page. Use useCorpusContextLoader when you need the true source object with loading and error states. */
const useCorpusContext = _useCorpusContext;
/** Ease-of-use function for locations where you _know_ the CF page config is loaded, such as in components on the search/article page. Use useCorpusContextLoader when you need the true source object with loading and error states. */
const useCfPageConfig = _useCfPageConfig;
/** Ease-of-use function for locations where you _know_ the tagset is loaded, such as in components on the search/article page. Use useCorpusContextLoader when you need the true source object with loading and error states. */
const useTagset = _useTagset;
/** Ease-of-use function for locations where you _know_ the corpus is loaded, such as in components on the search/article page. Use useCorpusContextLoader when you need the true source object with loading and error states. */
const useCorpus = _useCorpus;

function createCorpusContext(blacklab: BlackLabApi, frontend: FrontendApi, corpusId: MaybeRefOrGetter<string | null | undefined>) {
	const getCorpus = (id: string | undefined | null): CancelableRequest<NormalizedIndex | undefined> => (id ? blacklab.getCorpus(id) : resolvedRequest<NormalizedIndex | undefined>(undefined));
	const getConfig = (id: string | undefined | null): CancelableRequest<CFPageConfig> => frontend.getConfig(id ?? null);
	const getTagset = (id: string | undefined | null): CancelableRequest<Tagset | undefined> => (id ? frontend.getTagset(id) : resolvedRequest<Tagset | undefined>(undefined));

	const corpusLoadable = computed(() => loadableFromRequest(() => getCorpus(toValue(corpusId))));
	const configLoadable = computed(() => loadableFromRequest(() => getConfig(toValue(corpusId))));
	const tagsetLoadable = computed(() => loadableFromRequest(() => getTagset(toValue(corpusId))));
	const combinedLoadableSource: LoadableFromRequest<CorpusContext> = combineLoadables({ index: corpusLoadable, config: configLoadable, tagset: tagsetLoadable });

	const combinedLoadable = mapLoadableReactive(combinedLoadableSource, LoadableState.loaded, ({ index, config, tagset }) => {
		if (index) {
			// There's always a config
			config.displayName = config.displayName || index?.displayName || 'Blacklab Frontend'; // TODO externalize? (globalconfig?) Maybe supply from the server?

			if (tagset) {
				const annots = index.annotatedFields[index.mainAnnotatedField].annotations;
				// `TODO the 'pos' annotation should probably be sourced from the tagset, but our current tagset does't contain that info
				// so we need to rely on the uiType, which we eventually want to remove from BlackLab if possible.
				const mainAnnot = Object.values(annots).find(a => a.uiType === 'pos');
				if (mainAnnot) {
					processTagset(mainAnnot, annots, tagset);
				}
			}
		}
		return { index, config, tagset };
	});

	// pretend the value is always there (except for tagset, since that's actually optional)
	// This isn't technically correct, but usage of the use* functions should be gated
	// behind the data source being loaded
	// this makes makes it easier to use the data in various components where it's guaranteed we'll have the data available
	// In practice, the corpusPage component guards the loading and error state
	const combinedValue: Ref<CorpusContext> = computed(() => combinedLoadable.value!);
	const corpusValue: Ref<NormalizedIndex> = computed(() => corpusLoadable.value.value!);
	const configValue: Ref<CFPageConfig> = computed(() => configLoadable.value.value!);
	const tagsetValue: Ref<Tagset | undefined> = computed(() => tagsetLoadable.value.value);

	return {
		install(app) {
			provideCorpusContextLoader(app, combinedLoadable);
			provideCorpusContext(app, combinedValue);
			provideCfPageConfig(app, configValue);
			provideTagset(app, tagsetValue);
			provideCorpus(app, corpusValue);
		},
	} satisfies ObjectPlugin;
}

export {
	/** Returns the true value of the corpus context, including loading, error, empty states */
	useCorpusContextLoader,
	useCorpusContext,
	useCfPageConfig,
	useCorpus,
	useTagset,
	createCorpusContext,
	type CorpusContext,
};
