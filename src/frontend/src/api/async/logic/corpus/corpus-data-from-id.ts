import type { User } from 'oidc-client-ts';
import { pipe, switchMap, tap, type Observable } from 'rxjs';

import { processTagset } from '@/features/corpus/model/tagset-state';
import type { CFPageConfig, NormalizedIndex, Tagset } from '@/types/apptypes';
import type { BLIndexMetadata, BLRelationInfo } from '@/types/blacklabtypes';

import type { ApiError, BlackLabApi, FrontendApi } from '@/shared/api/lib/api-types';
import { normalizeIndex } from '@/shared/blacklab-helpers/normalize-responses';
import type { Loadable } from '@/shared/utils/loadable/loadable';
import { combineLoadableStreamsIncludingEmpty, EMPTY_LOADABLE_STREAM, InteractiveLoadable, mapLoaded } from '@/shared/utils/loadable/loadable-streams';

export type CorpusChange = {
	index: NormalizedIndex | undefined;
	tagset: Tagset | undefined;
	config: CFPageConfig;
};

function indexIdToResponses(blacklab: BlackLabApi, frontend: FrontendApi, indexId: string | null): Observable<Loadable<RawCorpusDataOutput>> {
	console.log('Loading corpus data for indexId', indexId);
	const r = combineLoadableStreamsIncludingEmpty({
		// Requesting config is valid for null index, will return the builtin default config (with customizations if applicable).
		config: frontend.getConfig(indexId),

		index: indexId ? blacklab.getCorpus(indexId) : EMPTY_LOADABLE_STREAM,
		relations: indexId ? blacklab.getRelations(indexId) : EMPTY_LOADABLE_STREAM,
		tagset: indexId
			? frontend.getTagset(indexId).catch((e: ApiError) => {
					if (e.httpCode === 404) return undefined;
					throw e; // remove 404, tagset is optional, but propagate other errors.
				})
			: EMPTY_LOADABLE_STREAM,
	}).pipe(tap(console.log));
	return r;
}

type CorpusDataInput = {
	user: User | null;
	indexId: string | null;
};
type RawCorpusDataOutput = {
	index: BLIndexMetadata | undefined;
	relations: BLRelationInfo | undefined;
	tagset: Tagset | undefined;
	config: CFPageConfig | undefined;
};
type CorpusDataOutput = {
	index: NormalizedIndex | undefined;
	tagset: Tagset | undefined;
	config: CFPageConfig;
};
export class CorpusDataLoader extends InteractiveLoadable<CorpusDataInput, CorpusDataOutput> {
	constructor(blacklab: BlackLabApi, frontend: FrontendApi) {
		super(
			pipe(
				switchMap(({ indexId, user }) => indexIdToResponses(blacklab, frontend, indexId)),
				mapLoaded(({ index: baseIndex, relations, tagset, config }): CorpusDataOutput => {
					console.log('Mapping corpus data to store format', { baseIndex, relations, tagset, config });
					config = config!; // config is always present, but types aren't rich enough to capture that.
					let index = baseIndex && relations && normalizeIndex(baseIndex, relations);
					const annots = index?.annotatedFields[index.mainAnnotatedField].annotations;
					// TODO the 'pos' annotation should probably be sourced from the tagset, but our current tagset does't contain that info
					// so we need to rely on the uiType, which we eventually want to remove from BlackLab if possible.
					const mainAnnot = annots && Object.values(annots).find(a => a.uiType === 'pos');
					if (tagset && mainAnnot) {
						processTagset(mainAnnot, annots, tagset);
					}
					// There's always a config
					config.displayName = config.displayName || index?.displayName || 'Blacklab-Frontend'; // TODO externalize? (globalconfig?) Maybe supply from the server?
					const r: CorpusChange = { index, config: config!, tagset };
					return r;
				}),
			),
		);
	}
}
