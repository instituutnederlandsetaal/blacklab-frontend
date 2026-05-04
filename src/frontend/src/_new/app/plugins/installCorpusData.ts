import { null_cache_key } from "@/_new/app/plugins/installCache";
import { CorpusDataLoader, type CorpusChange } from "@/_new/entities/corpus-data-from-id";
import type { BlackLabApi, FrontendApi } from "@/_new/shared/api/lib/api-types";
import type { CFPageConfig, NormalizedIndex, Tagset } from "@/types/apptypes";
import { Loadable, loadableFromRequest, mapLoadable, type LoadableFromRequest } from "@/utils/loadable-streams";
import type { User } from "oidc-client-ts";
import { computed, effect, inject, provide, reactive, ref, toRef, toValue, watch, type InjectionKey, type MaybeRef, type ObjectPlugin, type Ref } from "vue";

export type CorpusDataCache = Record<string|symbol, LoadableFromRequest<CorpusChange>>;

function declareKeyAndGetter<T>(key: string): [key: InjectionKey<T>, provide: (value: T) => void, inject: () => T] {
	const injectionKey: InjectionKey<T> = Symbol(key);
	return [injectionKey, (value: T) => provide(injectionKey, value), () => {
		const r = inject(injectionKey);
		if (!r) throw new Error(`${key} not provided. Make sure createCorpusData() is installed.`);
		return r;
	}]
}



// TODO work top-down from here
// get config, tagset and index should return object directly
// config always returns some value
// corpus as well? 
// tagset can be null.
export const [corpusDataCacheInjectionKey, _provideCorpusDataCache, useCorpusDataCache] = declareKeyAndGetter<CorpusDataCache>('corpusDataCache');
export const [currentCorpusDataInjectionKey, _provideCurrentCorpusData, useCurrentCorpusData] = declareKeyAndGetter<LoadableFromRequest<CorpusChange>>('currentCorpusData');
export const [currentCorpusIdInjectionKey, _provideCurrentCorpusId, useCurrentCorpusId] = declareKeyAndGetter<Ref<string|null>>('currentCorpusId');
export const [currentCorpusInjectionKey, _provideCurrentCorpus, useCurrentCorpus] = declareKeyAndGetter<Ref<string|null>>('currentCorpus');
export const [currentConfigInjectionKey, _provideCurrentConfig, useCurrentConfig] = declareKeyAndGetter<Ref<CFPageConfig>>('currentConfig');
export const [currentTagsetInjectionKey, _provideCurrentTagset, useCurrentTagset] = declareKeyAndGetter<Ref<Tagset|undefined>>('currentTagset');


// const corporaCacheInjectionKey: InjectionKey<CorporaCache> = Symbol('corporaCache');
// const currentCorpusDataInjectionKey: InjectionKey<Loadable<CorpusChange>> = Symbol('currentCorpusData');
// const currentCorpusIdInjectionKey: InjectionKey<Ref<string|null>> = Symbol('currentCorpusId');
// const currentConfigInjectionKey: InjectionKey<Ref<CFPageConfig>> = Symbol('currentConfig');
// const currentTagsetInjectionKey: InjectionKey<Ref<Tagset|undefined>> = Symbol('currentTagset');

/** 
 * Return a reactive cache for all corpora data/loading states. 
 * Requires that createCorpusData() was installed on the app beforehand.
 */
// export function useCorporaCache() {
// 	const data = inject(corporaCacheInjectionKey);
// 	if (!data) throw new Error('Corpora cache not provided');
// 	return data;
// }

/**
 * Return a reactive object holding the corpus data for the given corpus ID.
 * Requires that createCorpusData() was installed on the app beforehand.	
 * @param corpusId 
 * @returns 
 */
function useCorpusData(corpusId: MaybeRef<string|null>, getter: (corpusId: string|null) => LoadableFromRequest<CorpusChange>): LoadableFromRequest<CorpusChange> {
	const cache = useCorpusDataCache();
	corpusId = toRef(corpusId);
	watch(toRef(corpusId), id => {
		const key = id ?? null_cache_key;
		if (!cache[key]) {
			cache[key] = getter(id);
		}
	}, {immediate: true});
	return toReactive(computed(() => cache[corpusId.value ?? null_cache_key]));
}


// /**
//  * Get the current corpus ID.
//  * Requires that createCorpusData() was installed on the app beforehand.
//  * @returns 
//  */
// export function useCurrentCorpusId() {
// 	const r = inject(currentCorpusIdInjectionKey);
// 	if (!r) throw new Error('Current corpus ID not provided');
// 	return r;
// }

// /**
//  * Return the current corpus data.
//  * Requires that createCorpusData() was installed on the app beforehand. 
//  */
// export function useCurrentCorpusData() {
// 	return useCorpusData(useCurrentCorpusId());
// }

// export function useCurrentCorpusConfig() {
// 	const r = inject(currentConfigInjectionKey);
// 	if (!r) throw new Error('Current corpus config not provided. Make sure createCorpusData() is installed.');
// 	return r;
// }

// export function useCurrentCorpusTagset() {
// 	const r = inject(currentTagsetInjectionKey);
// 	if (!r) throw new Error('Current corpus tagset not provided. Make sure createCorpusData() is installed.');
// 	return r;
// }

// function testfn(): {test: string, test2: string} {
// 	return {test: 'test', test2: 'test2'};
// }


function normalizeCorpusData({config, index, tagset}: {config: CFPageConfig, index?: NormalizedIndex, tagset?: Tagset|undefined}): CorpusChange {
	console.log('Preprocessing page data / corpus and UI config.');

	const annots = index?.annotatedFields[index.mainAnnotatedField].annotations;
	// TODO the 'pos' annotation should probably be sourced from the tagset, but our current tagset does't contain that info
	// so we need to rely on the uiType, which we eventually want to remove from BlackLab if possible.
	if (tagset) {
		const mainAnnot = annots && Object.values(annots).find(a => a.uiType === 'pos');
		if (!mainAnnot) {
			console.warn('Corpus has a tagset, but no main pos annotation with uiType "pos" could be found. Skipping tagset processing.', {index, tagset});
		} else {
			processTagset(mainAnnot, annots, tagset)
		}
	}
	// There's always a config
	config.displayName = config.displayName || index?.displayName || 'Blacklab-Frontend'; // TODO externalize? (globalconfig?) Maybe supply from the server?
	const r: CorpusChange = { index, config: config!, tagset}
	return r;
}


import defaultPageConfig from '@/_new/entities/defaults/page-config.default';
import { toReactive, useMemoize } from "@vueuse/core";
import { combineLoadablesValue, mapLoadedValue } from "@/utils/loadable-operators";
import { flatMapLoadedReactive, loadableFromRefs, mapLoadedReactive } from "@/utils/loadable-reactive";
import { normalizeIndex } from "@/utils/blacklabutils";
import { processTagset } from "@/features/corpus/model/tagset-state";
import type { BLRelationInfo } from "@/types/blacklabtypes";

export function createCorpusData(blacklab: BlackLabApi, frontend: FrontendApi, currentCorpusId: MaybeRef<string|null>, user: MaybeRef<User|null>): ObjectPlugin {
	return {
		install(app) {
			app.runWithContext(() => {
				// set up initial caches
				const getCorpus = useMemoize((corpusId: string|null) => corpusId != null ? loadableFromRequest(() => blacklab.getCorpus(corpusId)) : Loadable.Empty());
				const getConfig = useMemoize((corpusId: string|null) => loadableFromRequest(() => frontend.getConfig(corpusId)));
				const getTagset = useMemoize((corpusId: string|null) => corpusId != null ? loadableFromRequest(() => frontend.getTagset(corpusId)) : Loadable.Empty());

				// set up cache for combined data from the initial caches
				const getCorpusData = useMemoize((corpusId: string|null) => {
					const corpus = getCorpus(corpusId);
					const config = getConfig(corpusId);
					const tagset = getTagset(corpusId);

					// return something reactive here, will be returned when getCorpusData(someId) is called.
					// so map the loadable to the actual return type now.
					const base = mapLoadedReactive({corpus, config, tagset}, ({corpus, config, tagset}) => normalizeCorpusData({
						index: corpus,
						config: config,
						tagset,
					}))
					return base;
				});

				// set up retry hook
				// this is particularly annoying
				// since getCorpusData returns a Loadable, but we want to return the loadable + retry function
				// that means we need to somehow wrap it, or thread the retry function through all layers so it ends up in the inner loadable directly
				// but threading through would then prevent the reuse of empty/loading/error loadables, 
				// as the source loadables won't have the retry function necessarily.
				

				function useCurrentCorpusData() {
					return toReactive(computed(() => getCorpusData(toValue(currentCorpusId))));
				}

				
				
				const currentCorpusIdRef = toRef(currentCorpusId);
				const cache: CorpusDataCache = reactive({});

				_provideCorpusDataCache(cache);
				_provideCurrentCorpusId(currentCorpusIdRef);
		

				_provideCurrentCorpusData(useCorpusData(currentCorpusIdRef));
				_provideCurrentCorpus(computed(() => ))
				_provideCurrentConfig(ref(defaultPageConfig));
	
				app.provide(corporaCacheInjectionKey, cache);
				app.provide(currentCorpusIdInjectionKey, currentCorpusIdRef);
				app.provide(currentCorpusDataInjectionKey, useCorpusData(currentCorpusIdRef))
	
				// Create the loader for the data
				// Refresh the loader when the user changes, but keep it local to a single corpusId instance.
				effect(() => {
					const loaderCorpusId = currentCorpusIdRef.value ?? null;
					const loaderCacheKey = loaderCorpusId ?? null_cache_key;
					if (!cache[loaderCacheKey]) {
						const loader = cache[loaderCacheKey] = new CorpusDataLoader(blacklab, frontend);
						watch(toRef(user), currentUser => loader.next({indexId: loaderCorpusId, user: currentUser}), { immediate: true });
					}
				})

			})
		}
	}
}


