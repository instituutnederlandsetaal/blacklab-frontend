import { toReactive, useMemoize } from '@vueuse/core';
import { computed, effectScope, toRef, type MaybeRef, type ObjectPlugin, type Ref } from 'vue';

import useInjectable from '@/app/plugins/lib/useInjectable';
import defaultPageConfig from '@/entities/defaults/page-config.default';
import type { BlackLabApi, FrontendApi } from '@/shared/api/lib/api-types';
import { processTagset } from '@/shared/blacklab-helpers/tagset-helper';
import { Loadable } from '@/shared/utils/loadable/loadable';
import { loadableFromRefs, loadableFromRequest, type LoadableFromRequest } from '@/shared/utils/loadable/loadable-reactive';
import { combineLoadablesIncludingEmpty } from '@/shared/utils/loadable/loadable-streams';
import type { CFPageConfig, NormalizedIndex, Tagset } from '@/types/apptypes';

export type CorpusChange = {
	index: NormalizedIndex | undefined;
	tagset: Tagset | undefined;
	config: CFPageConfig;
};
export type CorpusDataLoadable = LoadableFromRequest<CorpusChange>;

const [_currentCorpusDataInjectionKey, _provideCurrentCorpusData, useCurrentCorpusData] = useInjectable<CorpusDataLoadable>('currentCorpusData');
const [_currentCorpusInjectionKey, _provideCurrentCorpus, useCurrentCorpus] = useInjectable<NormalizedIndex>('currentCorpus');
const [_currentConfigInjectionKey, _provideCurrentConfig, useCurrentConfig] = useInjectable<CFPageConfig>('currentConfig');
const [_currentTagsetInjectionKey, _provideCurrentTagset, useCurrentTagset] = useInjectable<Ref<Tagset | undefined>>('currentTagset');

function isRetryableLoadable<T>(loadable: Loadable<T>): loadable is LoadableFromRequest<T> {
	return typeof (loadable as Partial<LoadableFromRequest<T>>).retry === 'function' && typeof (loadable as Partial<LoadableFromRequest<T>>).stop === 'function';
}

function retryIfPossible(loadable: Loadable<unknown>) {
	if (isRetryableLoadable(loadable)) loadable.retry();
}

function stopIfPossible(loadable: Loadable<unknown>) {
	if (isRetryableLoadable(loadable)) loadable.stop();
}

function normalizeCorpusData({ config, index, tagset }: { config: CFPageConfig; index?: NormalizedIndex; tagset?: Tagset }): CorpusChange {
	const annots = index?.annotatedFields[index.mainAnnotatedField].annotations;
	if (tagset) {
		const mainAnnot = annots && Object.values(annots).find(a => a.uiType === 'pos');
		if (mainAnnot) {
			processTagset(mainAnnot, annots, tagset);
		}
	}

	config.displayName = config.displayName || index?.displayName || 'Blacklab-Frontend';
	return { index, config, tagset };
}

function createCorpusDataLoadable(
	corpusId: string | null,
	getCorpus: (corpusId: string | null) => Loadable<NormalizedIndex>,
	getConfig: (corpusId: string | null) => LoadableFromRequest<CFPageConfig>,
	getTagset: (corpusId: string | null) => Loadable<Tagset | undefined>,
): CorpusDataLoadable {
	const corpus = getCorpus(corpusId);
	const config = getConfig(corpusId);
	const tagset = getTagset(corpusId);

	const combined = computed<Loadable<CorpusChange>>(() => {
		const settled = combineLoadablesIncludingEmpty({ corpus, config, tagset });
		if (!settled.isLoaded()) {
			if (settled.isLoading()) return Loadable.Loading<CorpusChange>();
			if (settled.isError()) return Loadable.LoadingError<CorpusChange>(settled.error);
			return Loadable.Empty<CorpusChange>();
		}

		const { corpus: index, config: resolvedConfig, tagset: resolvedTagset } = settled.value;
		if (!resolvedConfig) return Loadable.Empty<CorpusChange>();
		return Loadable.Loaded(normalizeCorpusData({ index, config: resolvedConfig, tagset: resolvedTagset }));
	});

	const result = loadableFromRefs(
		computed(() => combined.value.state),
		computed(() => combined.value.value),
		computed(() => combined.value.error),
		{
			retry: () => {
				retryIfPossible(corpus);
				retryIfPossible(config);
				retryIfPossible(tagset);
			},
			stop: () => {
				stopIfPossible(corpus);
				stopIfPossible(config);
				stopIfPossible(tagset);
			},
		},
	);

	return result;
}

export function createCorpusData(blacklab: BlackLabApi, frontend: FrontendApi, currentCorpusId: MaybeRef<string | null>): ObjectPlugin {
	return {
		install(app) {
			const effect = effectScope();
			effect.run(() =>
				app.runWithContext(() => {
					const getCorpus = useMemoize<Loadable<NormalizedIndex>, [string | null]>((corpusId: string | null) =>
						corpusId != null ? loadableFromRequest(() => blacklab.getCorpus(corpusId)) : Loadable.Empty<NormalizedIndex>(),
					);
					const getConfig = useMemoize((corpusId: string | null) => loadableFromRequest(() => frontend.getConfig(corpusId)));
					const getTagset = useMemoize((corpusId: string | null) => (corpusId != null ? loadableFromRequest(() => frontend.getTagset(corpusId)) : Loadable.Empty<Tagset | undefined>()));

					const getCorpusData = useMemoize((corpusId: string | null) => createCorpusDataLoadable(corpusId, getCorpus, getConfig, getTagset));

					const currentCorpusIdRef = toRef(currentCorpusId);
					// Note: since the actual inner of the getCorpus can be an empty (if ID is null)
					// but we pretend to always provide a value
					// we need to make sure to sometimes return a dummy (the {} object)
					// we do this to avoid having to add checks on the presence of the corpus in every single component that needs it, since it's a core part of the app and most components will require it.
					// In practice, we'll need to make sure to never call useCurrentCorpus() when we're unsure of the corpus presence.
					// In the component tree, we have a loading guard at the top level
					// (use the useCurrentCorpusData() to get the loading state/retry function)
					_provideCurrentCorpus(app, toReactive(computed<NormalizedIndex>(() => getCorpus(currentCorpusIdRef.value).value || ({} as any as NormalizedIndex))));
					_provideCurrentConfig(app, toReactive(computed(() => getConfig(currentCorpusIdRef.value).value || defaultPageConfig)));
					_provideCurrentTagset(
						app,
						computed(() => getTagset(currentCorpusIdRef.value).value),
					);
					_provideCurrentCorpusData(app, toReactive(computed(() => getCorpusData(currentCorpusIdRef.value))));
				}),
			);
			app.onUnmount(() => effect.stop());
		},
	};
}

export { useCurrentConfig, useCurrentCorpus, useCurrentCorpusData, useCurrentTagset };
