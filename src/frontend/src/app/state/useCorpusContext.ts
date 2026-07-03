import { computed, hasInjectionContext, toValue, type FunctionPlugin, type MaybeRefOrGetter, type Ref } from 'vue';

import { processTagset } from '@/features/corpus/model/tagset-state';
import type {
	CFPageConfig,
	NormalizedAnnotatedField,
	NormalizedAnnotatedFieldParallel,
	NormalizedAnnotation,
	NormalizedAnnotationGroup,
	NormalizedIndex,
	NormalizedMetadataField,
	NormalizedMetadataGroup,
	Tagset,
} from '@/types/apptypes';

import type { BlackLabApi, CancelableRequest, FrontendApi } from '@/shared/api/lib/api-types';
import { resolvedRequest } from '@/shared/api/lib/api-utils';
import { mapReduce } from '@/shared/utils/array-utils';
import { combineLoadables } from '@/shared/utils/loadable/loadable-combine-reactive';
import { LoadableState } from '@/shared/utils/loadable/loadable-core';
import { loadableFromRequest, type LoadableFromRequest } from '@/shared/utils/loadable/loadable-datasource';
import { mapLoadableReactive } from '@/shared/utils/loadable/loadable-reactive';
import useInjectable from '@/shared/utils/useInjectable';

type CorpusContext = {
	index: NormalizedIndex | undefined;
	config: CFPageConfig;
	tagset: Tagset | undefined;
};
// Utils we add for convenience on top of the base index.
type Corpus = NormalizedIndex & {
	allAnnotatedFields: NormalizedAnnotatedField[];
	allAnnotatedFieldsMap: Record<string, NormalizedAnnotatedField>;
	mainAnnotatedField: string;
	isParallelCorpus: boolean;
	parallelAnnotatedFields: NormalizedAnnotatedFieldParallel[];
	parallelAnnotatedFieldsMap: Record<string, NormalizedAnnotatedFieldParallel>;
	parallelFieldPrefix: string;
	allAnnotations: NormalizedAnnotation[];
	allAnnotationsMap: Record<string, NormalizedAnnotation>;
	allMetadataFields: NormalizedMetadataField[];
	allMetadataFieldsMap: Record<string, NormalizedMetadataField>;
	firstMainAnnotation: NormalizedAnnotation;
	metadataGroups: Array<NormalizedMetadataGroup & { fields: NormalizedMetadataField[] }>;
	annotationGroups: Array<NormalizedAnnotationGroup & { fields: NormalizedAnnotation[] }>;
	textDirection: 'ltr' | 'rtl';
	hasRelations: boolean;
};

const defaultConfig = {
	analytics: {
		google: null,
		plausible: null,
	},
	bannerMessage: null,
	customCss: {},
	customJs: {},
	displayName: null,
	faviconDir: '',
	footerMessage: null,
	navbarLinks: [],
	pageSize: null,
};

const [_corpusLoadableKey, provideCorpusContextLoader, _useCorpusContextLoader] = useInjectable<LoadableFromRequest<CorpusContext>>('corpus_context_loader');
const [_corpusStateKey, provideCorpusContext, _useCorpusContext] = useInjectable<Ref<CorpusContext>>('corpus_context');
const [_cfPageConfigKey, provideCfPageConfig, _useCfPageConfig] = useInjectable<Ref<CFPageConfig>>('cf_page_config');
const [_tagsetKey, provideTagset, _useTagset] = useInjectable<Ref<Tagset | undefined>>('tagset');
const [_corpusKey, provideCorpus, _useCorpus] = useInjectable<Ref<Corpus>>('corpus');

let installedCorpus: Ref<Corpus> | undefined;

// Jump through some hoops to add docstrings to the use* functions, since it doesn't seem to be possible to add them to destructured variables directly?

/** Returns the true value of the corpus context, including loading, error, empty states. When you just need the value, and you _know_ it's loaded, use useCorpusContext. */
const useCorpusContextLoader = _useCorpusContextLoader;
/** Ease-of-use function for locations where you _know_ the corpus state is loaded, such as in components on the search/article page. Use useCorpusContextLoader when you need the true source object with loading and error states. */
const useCorpusContext = _useCorpusContext;
/** Ease-of-use function for locations where you _know_ the CF page config is loaded, such as in components on the search/article page. Use useCorpusContextLoader when you need the true source object with loading and error states. */
const useCfPageConfig = _useCfPageConfig;
/** Ease-of-use function for locations where you _know_ the tagset is loaded, such as in components on the search/article page. Use useCorpusContextLoader when you need the true source object with loading and error states. */
const useTagset = _useTagset;

let warnedCount = 0;

/** Ease-of-use function for locations where you _know_ the corpus is loaded, such as in components on the search/article page. Use useCorpusContextLoader when you need the true source object with loading and error states. */
function useCorpus(): Ref<Corpus>;
/**
 * For when you know what you're doing.
 * Explanation: We intentionally pretend the ref always holds a corpus,
 * even though it can be undefined in reality.
 * This is because the corpus context is supposed to be used only inside the context of a corpus, but the typing doesn't know that.
 * But sometimes you just want an escape hatch and access the corpus ASAP, even when the context might still be loading (because some other required request is still inflight).
 * This will give you that.
 */
function useCorpus(_: { IAcknowledgeItCanBeUndefined: true }): Ref<Corpus | undefined>;
function useCorpus(_?: { IAcknowledgeItCanBeUndefined?: true }): Ref<Corpus | undefined> {
	if (hasInjectionContext()) return _useCorpus();
	if (installedCorpus) {
		if (warnedCount++ < 5) {
			const stack = new Error().stack;
			const stackLines = stack?.split('\n') ?? [];
			const vueComponentLine = stackLines.findIndex(line => line.includes('.vue'));
			const upToIncludingVueComponent = vueComponentLine >= 0 ? stackLines.slice(0, vueComponentLine + 1) : stackLines;
			console.warn('Called useCorpus() outside app context, returning installedCorpus.', upToIncludingVueComponent);
		}
		return installedCorpus;
	}
	throw new Error('corpus not provided. Make sure the corpus context provider plugin is installed.');
}

function createCorpusValue(index: NormalizedIndex): Corpus {
	const allAnnotatedFields = index ? Object.values(index.annotatedFields) : [];
	const allAnnotatedFieldsMap = index?.annotatedFields ?? {};
	const mainAnnotatedField = index?.mainAnnotatedField ?? 'contents';
	const parallelAnnotatedFields = allAnnotatedFields.filter((field): field is NormalizedAnnotatedFieldParallel => field.isParallel);
	const allAnnotations = index ? Object.values(index.annotatedFields[index.mainAnnotatedField]?.annotations ?? {}) : [];
	const allAnnotationsMap = mapReduce(allAnnotations, 'id');
	const allMetadataFields = index ? Object.values(index.metadataFields) : [];
	const firstMainAnnotation = allAnnotations.find(field => field.isMainAnnotation)!;

	return {
		...index,
		allAnnotatedFields,
		allAnnotatedFieldsMap,
		mainAnnotatedField,
		isParallelCorpus: parallelAnnotatedFields.length > 0,
		parallelAnnotatedFields,
		parallelAnnotatedFieldsMap: mapReduce(parallelAnnotatedFields, 'id'),
		parallelFieldPrefix: parallelAnnotatedFields[0]?.prefix ?? '',
		allAnnotations,
		allAnnotationsMap,
		allMetadataFields,
		allMetadataFieldsMap: index?.metadataFields ?? {},
		firstMainAnnotation,
		metadataGroups: index
			? index.metadataFieldGroups.map(group => ({
					...group,
					fields: group.entries.map(id => index.metadataFields[id]),
				}))
			: [],
		annotationGroups: index
			? index.annotationGroups.map(group => ({
					...group,
					fields: group.entries.map(id => index.annotatedFields[group.annotatedFieldId].annotations[id]),
				}))
			: [],
		textDirection: index?.textDirection ?? 'ltr',
		hasRelations: index?.relations.relations != null,
	};
}

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
	const corpusValue: Ref<Corpus | undefined> = computed(() => (corpusLoadable.value.value ? createCorpusValue(corpusLoadable.value.value) : undefined));
	const configValue: Ref<CFPageConfig> = computed(() => configLoadable.value.value || defaultConfig);
	const tagsetValue: Ref<Tagset | undefined> = computed(() => tagsetLoadable.value.value);

	return {
		contextLoader: combinedLoadable,
		context: combinedValue,
		corpus: corpusValue,
		config: configValue,
		tagset: tagsetValue,
		install: (app => {
			provideCorpusContextLoader(app, combinedLoadable);
			provideCorpusContext(app, combinedValue);
			provideCfPageConfig(app, configValue);
			provideTagset(app, tagsetValue);
			// The value can be undefined in reality, so this is a lie, but usage is supposed to be gated to where the corpus is loaded.
			installedCorpus = corpusValue as Ref<Corpus>;
			provideCorpus(app, corpusValue as Ref<Corpus>);
		}) satisfies FunctionPlugin,
	};
}

export {
	/** Returns the true value of the corpus context, including loading, error, empty states */
	useCorpusContextLoader,
	useCorpusContext,
	useCfPageConfig,
	useCorpus,
	useTagset,
	createCorpusContext,
	type Corpus,
	type CorpusContext,
};
