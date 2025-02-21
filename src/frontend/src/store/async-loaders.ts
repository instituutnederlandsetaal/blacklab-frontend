import { User } from 'oidc-client-ts';
import { combineLoadableStreamsIncludingEmpty, Loadable, loadableStreamFromPromise, mapError, mapLoaded, repeatLatestWhen, toObservable } from '@/utils/loadable-streams';
import { combineLatest, distinctUntilChanged, shareReplay, concatMap, of, Subject, switchMap, catchError, BehaviorSubject } from 'rxjs';

import * as Api from '@/api';
import { normalizeIndex } from '@/utils/blacklabutils';
import { CFPageConfig, NormalizedIndex, Tagset } from '@/types/apptypes';
import { copyDisplaynamesAndValuesToCorpus, lowercaseValuesIfNeeded, validateTagset } from '@/store/tagset';

export type CorpusChange = {
	index: NormalizedIndex|undefined;
	tagset: Tagset|undefined;
	config: CFPageConfig;
}

/** A callback for when a new corpus has been loaded. */
type OnCorpusChange = (newData: CorpusChange) => Promise<void>;
export function createStoreInitializer(p: { onCorpusChange: OnCorpusChange }) {
	const indexId$ = new BehaviorSubject<string|null>(null);
	const user$ = new Subject<User|null>(); // use Subject: we need to wait for a User or null to be supplied before we should do anything. (Initialization order of the page requires we _first_ have a User, or null.)
	const retry$ = new Subject<void>();

	const corpusIdAndUser$ = combineLatest({user: user$, indexId: indexId$}).pipe(distinctUntilChanged((a,b) => a.user === b.user && a.indexId === b.indexId));
	const corpusData$ = corpusIdAndUser$.pipe(
		repeatLatestWhen(retry$),
		switchMap(({user, indexId}) => combineLoadableStreamsIncludingEmpty({
			index: indexId ? toObservable(Api.frontend.getCorpus(indexId)) : of(Loadable.Empty()),
			relations: indexId ? toObservable(Api.blacklab.getRelations(indexId)) : of(Loadable.Empty()),
			tagset: indexId ? toObservable(Api.frontend.getTagset(indexId).catch((e: Api.ApiError) => {
				if (e.httpCode === 404) return undefined; throw e; // remove 404, propagate other errors.
			})) : of(Loadable.Empty()),
			config: toObservable(Api.frontend.getConfig(indexId))
		})),
		mapLoaded(({index: baseIndex, relations, tagset, config}) => {
			let index = baseIndex && relations && normalizeIndex(baseIndex, relations);
			const annots = index?.annotatedFields[index.mainAnnotatedField].annotations;
			const mainAnnot = annots && Object.values(annots).find(a => a.uiType === 'pos');
			if (tagset && mainAnnot) {
				validateTagset(mainAnnot, annots, tagset);
				lowercaseValuesIfNeeded(mainAnnot, annots, tagset);
				copyDisplaynamesAndValuesToCorpus(mainAnnot, Object.values(tagset.values));
				Object.values(tagset.subAnnotations).forEach(sub => copyDisplaynamesAndValuesToCorpus(annots[sub.id], sub.values));
			}
			config!.displayName = config!.displayName || index?.displayName || 'Corpus-Frontend'; // TODO externalize? (globalconfig?)
			const r: CorpusChange = { index, config: config!, tagset}
			return r;
		}),
		// concatMap buffers all events, and waits for the inner observable to complete before moving on to the next value.
		// So essentially this prevents multiple concurrent calls to corpusChanged.
		concatMap(state => state.isLoaded() ? loadableStreamFromPromise(p.onCorpusChange(state.value).then(() => state.value)) : of(state)),
		// Make sure we don't run this multiple times if multiple subscribers are listening.
		shareReplay(1)
	);

	return {
		corpusData$,
		indexId$,
		user$,
		retry$
	}
}
