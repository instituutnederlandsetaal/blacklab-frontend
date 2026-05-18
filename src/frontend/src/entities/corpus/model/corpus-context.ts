import type { Ref } from 'vue';

import type { CFPageConfig, NormalizedIndex, Tagset } from '@/types/apptypes';

import useInjectable from '@/shared/lib/vue/useInjectable';
import type { LoadableFromRequest } from '@/shared/utils/loadable/loadable-reactive';

export type CorpusContext = {
	index: NormalizedIndex | undefined;
	tagset: Tagset | undefined;
	config: CFPageConfig;
};

export type CorpusContextLoadable = LoadableFromRequest<CorpusContext>;

export type CorpusChange = CorpusContext;
export type CorpusDataLoadable = CorpusContextLoadable;

const [_currentCorpusDataInjectionKey, provideCurrentCorpusData, useCurrentCorpusData] = useInjectable<CorpusContextLoadable>('currentCorpusData');
const [_currentCorpusInjectionKey, provideCurrentCorpus, useCurrentCorpus] = useInjectable<NormalizedIndex>('currentCorpus');
const [_currentTagsetInjectionKey, provideCurrentTagset, useCurrentTagset] = useInjectable<Ref<Tagset | undefined>>('currentTagset');

const provideCurrentCorpusContext = provideCurrentCorpusData;
const useCurrentCorpusContextData = useCurrentCorpusData;

export { provideCurrentCorpus, provideCurrentCorpusContext, provideCurrentCorpusData, provideCurrentTagset, useCurrentCorpus, useCurrentCorpusContextData, useCurrentCorpusData, useCurrentTagset };
