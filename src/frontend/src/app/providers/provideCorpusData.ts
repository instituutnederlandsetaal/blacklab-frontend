import { toReactive, useMemoize } from '@vueuse/core';
import { computed, effectScope, toRef, type MaybeRef, type ObjectPlugin } from 'vue';

import { provideCurrentCorpus, provideCurrentCorpusData, provideCurrentTagset, type CorpusContext, type CorpusContextLoadable } from '@/entities/corpus/model/corpus-context';
import { provideCurrentConfig } from '@/entities/page-config/page-config';
import defaultPageConfig from '@/entities/page-config/page-config.default';
import type { CFPageConfig, NormalizedIndex, Tagset } from '@/types/apptypes';

import type { BlackLabApi, FrontendApi } from '@/shared/api/lib/api-types';
import { processTagset } from '@/shared/blacklab-helpers/tagset-helper';
import { Loadable } from '@/shared/utils/loadable/loadable';
import { loadableFromRefs, loadableFromRequest, type LoadableFromRequest } from '@/shared/utils/loadable/loadable-reactive';
import { combineLoadablesIncludingEmpty } from '@/shared/utils/loadable/loadable-streams';

function isRetryableLoadable<T>(loadable: Loadable<T>): loadable is LoadableFromRequest<T> {
	return typeof (loadable as Partial<LoadableFromRequest<T>>).retry === 'function' && typeof (loadable as Partial<LoadableFromRequest<T>>).stop === 'function';
}

function retryIfPossible(loadable: Loadable<unknown>) {
	if (isRetryableLoadable(loadable)) loadable.retry();
}

function stopIfPossible(loadable: Loadable<unknown>) {
	if (isRetryableLoadable(loadable)) loadable.stop();
}

function normalizeCorpusData({ config, index, tagset }: { config: CFPageConfig; index?: NormalizedIndex; tagset?: Tagset }): CorpusContext {
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
): CorpusContextLoadable {
	const corpus = getCorpus(corpusId);
	const config = getConfig(corpusId);
	const tagset = getTagset(corpusId);

	const combined = computed<Loadable<CorpusContext>>(() => {
		const settled = combineLoadablesIncludingEmpty({ corpus, config, tagset });
		if (!settled.isLoaded()) {
			if (settled.isLoading()) return Loadable.Loading<CorpusContext>();
			if (settled.isError()) return Loadable.LoadingError<CorpusContext>(settled.error);
			return Loadable.Empty<CorpusContext>();
		}

		const { corpus: index, config: resolvedConfig, tagset: resolvedTagset } = settled.value;
		if (!resolvedConfig) return Loadable.Empty<CorpusContext>();
		return Loadable.Loaded(normalizeCorpusData({ index, config: resolvedConfig, tagset: resolvedTagset }));
	});

	return loadableFromRefs(
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
					provideCurrentCorpus(app, toReactive(computed<NormalizedIndex>(() => getCorpus(currentCorpusIdRef.value).value || ({} as any as NormalizedIndex))));
					provideCurrentConfig(app, toReactive(computed(() => getConfig(currentCorpusIdRef.value).value || defaultPageConfig)));
					provideCurrentTagset(
						app,
						computed(() => getTagset(currentCorpusIdRef.value).value),
					);
					provideCurrentCorpusData(app, toReactive(computed(() => getCorpusData(currentCorpusIdRef.value))));
				}),
			);
			app.onUnmount(() => effect.stop());
		},
	};
}
