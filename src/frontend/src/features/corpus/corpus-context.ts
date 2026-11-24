import { computed, hasInjectionContext, shallowRef, toValue, watch, type FunctionPlugin, type MaybeRefOrGetter, type Ref } from 'vue';

import { normalizeTagset } from '@/features/corpus/normalize-tagset';
import type { CFPageConfig, Corpus, NormalizedAnnotatedFieldParallel, NormalizedIndex, Tagset } from '@/types/apptypes';

import type { BlackLabApi, FrontendApi } from '@/shared/api/lib/api-types';
import { mapReduce } from '@/shared/utils/array-utils';
import type { Loadable } from '@/shared/utils/loadable/loadable-core';
import { loadableReactiveFromSnapshot, type RetryableLoadable } from '@/shared/utils/loadable/loadable-reactive';
import { useRequestResource } from '@/shared/utils/loadable/loadable-request-resource';
import createAppInjection from '@/shared/vue/injection';

type CorpusContext = {
	index: Corpus | undefined;
	config: CFPageConfig;
	tagset: Tagset | undefined;
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

const [_corpusLoadableKey, provideCorpusContextLoader, _useCorpusContextLoader] = createAppInjection<RetryableLoadable<CorpusContext>>('corpus_context_loader');
const [_cfPageConfigKey, provideCfPageConfig, _useCfPageConfig] = createAppInjection<Ref<CFPageConfig>>('cf_page_config');
const [_corpusKey, provideCorpus, _useCorpus] = createAppInjection<Ref<Corpus>>('corpus');

let installedCorpus: Ref<Corpus> | undefined;

// Jump through some hoops to add docstrings to the use* functions, since it doesn't seem to be possible to add them to destructured variables directly?

/** Returns the true value of the corpus context, including loading, error, empty states. When you just need the value, and you _know_ it's loaded, use useCorpusContext. */
const useCorpusContextLoader = _useCorpusContextLoader;
/** Ease-of-use function for locations where you _know_ the CF page config is loaded, such as in components on the search/article page. Use useCorpusContextLoader when you need the true source object with loading and error states. */
const useCfPageConfig = _useCfPageConfig;

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
	const allAnnotatedFields = Object.values(index.annotatedFields);
	const parallelAnnotatedFields = allAnnotatedFields.filter((field): field is NormalizedAnnotatedFieldParallel => field.isParallel);
	const allAnnotations = Object.values(index.annotatedFields[index.mainAnnotatedField]?.annotations ?? {});

	return {
		...index,
		allAnnotatedFields,
		allAnnotatedFieldsMap: index.annotatedFields,
		isParallelCorpus: parallelAnnotatedFields.length > 0,
		parallelAnnotatedFields,
		parallelAnnotatedFieldsMap: mapReduce(parallelAnnotatedFields, 'id'),
		parallelFieldPrefix: parallelAnnotatedFields[0]?.prefix ?? '',
		allAnnotations,
		allAnnotationsMap: mapReduce(allAnnotations, 'id'),
		allMetadataFields: Object.values(index.metadataFields),
		allMetadataFieldsMap: index.metadataFields,
		firstMainAnnotation: allAnnotations.find(field => field.isMainAnnotation)!,
		metadataGroups: index.metadataFieldGroups.map(group => ({
			...group,
			fields: group.entries.map(id => index.metadataFields[id]),
		})),
		annotationGroups: index.annotationGroups.map(group => ({
			...group,
			fields: group.entries.map(id => index.annotatedFields[group.annotatedFieldId].annotations[id]),
		})),
		hasRelations: index.relations.relations != null,
	};
}

function createCorpusContext(blacklab: BlackLabApi, frontend: FrontendApi, corpusId: MaybeRefOrGetter<string | null | undefined>) {
	const onBeforePublishCallbacks: Array<(context: CorpusContext) => void> = [];

	// The global configuration is a real request, including when the route has no corpus.
	const resource = useRequestResource(
		async ({ id }, run): Promise<CorpusContext> => {
			const [index, config, tagset] = await Promise.all([
				id ? run.wait(blacklab.getCorpus(id)) : undefined,
				run.wait(frontend.getConfig(id, { headers: { 'Cache-Control': 'no-cache' } })),
				id ? run.wait(frontend.getTagset(id)) : undefined,
			]);
			run.signal.throwIfAborted();
			const corpus = index && createCorpusValue(index);
			if (!corpus) return { index: corpus, config, tagset };
			const annotations = corpus.annotatedFields[corpus.mainAnnotatedField].annotations;
			const mainAnnotation = Object.values(annotations).find(annotation => annotation.uiType === 'pos');
			return { index: corpus, config, tagset: mainAnnotation ? normalizeTagset(mainAnnotation, annotations, tagset) : tagset };
		},
		{ source: () => ({ id: toValue(corpusId) ?? null }), key: input => input.id },
	);
	const published = shallowRef<Loadable<CorpusContext>>(resource.current.value);
	watch(
		resource.current,
		next => {
			// Legacy stores must see this corpus before synchronous consumers can read it.
			if (next.isLoaded()) onBeforePublishCallbacks.forEach(callback => callback(next.value));
			if (resource.current.value === next) published.value = next;
		},
		{ flush: 'sync' },
	);
	const publishedContext = loadableReactiveFromSnapshot(published, resource.retry);

	// pretend the value is always there (except for tagset, since that's actually optional)
	// This isn't technically correct, but usage of the use* functions should be gated
	// behind the data source being loaded
	// this makes makes it easier to use the data in various components where it's guaranteed we'll have the data available
	// In practice, the corpusPage component guards the loading and error state
	const corpusValue: Ref<Corpus | undefined> = computed(() => publishedContext.value?.index);
	const configValue: Ref<CFPageConfig> = computed(() => publishedContext.value?.config ?? defaultConfig);
	const tagsetValue: Ref<Tagset | undefined> = computed(() => publishedContext.value?.tagset);

	return {
		contextLoader: publishedContext,
		corpus: corpusValue,
		config: configValue,
		tagset: tagsetValue,
		beforePublish: (callback: (context: CorpusContext) => void) => {
			onBeforePublishCallbacks.push(callback);
		},
		install: (app => {
			provideCorpusContextLoader(app, publishedContext);
			provideCfPageConfig(app, configValue);
			// The value can be undefined in reality, so this is a lie, but usage is supposed to be gated to where the corpus is loaded.
			installedCorpus = corpusValue as Ref<Corpus>;
			provideCorpus(app, corpusValue as Ref<Corpus>);
		}) satisfies FunctionPlugin,
	};
}

export {
	/** Returns the true value of the corpus context, including loading, error, empty states */
	useCorpusContextLoader,
	useCfPageConfig,
	useCorpus,
	createCorpusContext,
	createCorpusValue,
	provideCorpus,
	provideCfPageConfig,
	provideCorpusContextLoader,
	defaultConfig,
	type CorpusContext,
};
