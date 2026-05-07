import { ApiError, type BlackLabApi, type FrontendApi } from '@/_new/shared/api/lib/api-types';
import { rejectedRequest, resolvedRequest } from '@/_new/shared/api/lib/api-utils';
import type { CFPageConfig, Tagset } from '@/_new/types/apptypes';
import type { BLDocGroupResults, BLDocResults, BLHitGroupResults, BLHitResults, BLParsePatternResponse, BLServer, BLUser } from '@/_new/types/blacklabtypes';
import type { CancelableRequest } from '@/_new/utils/loadable/loadable-streams';

function unimplemented<T>(name: string): CancelableRequest<T> {
	return rejectedRequest<T>(ApiError.wrap(`Unimplemented API mock: ${name}`));
}

type ApiMockOverrides<T extends BlackLabApi | FrontendApi> = Partial<T>;

function createBlackLabApiMock(): BlackLabApi {
	return {
		getServerInfo: () => unimplemented<BLServer>('blacklab.getServerInfo'),
		getUser: () => unimplemented<BLUser>('blacklab.getUser'),
		getCorpora: () => unimplemented('blacklab.getCorpora'),
		getCorpusStatus: () => unimplemented('blacklab.getCorpusStatus'),
		getCorpus: () => unimplemented('blacklab.getCorpus'),
		getAnnotatedField: () => unimplemented('blacklab.getAnnotatedField'),
		getShares: () => unimplemented('blacklab.getShares'),
		getFormats: () => unimplemented('blacklab.getFormats'),
		getFormatContent: () => unimplemented('blacklab.getFormatContent'),
		getFormatXslt: () => unimplemented<string>('blacklab.getFormatXslt'),
		postShares: () => unimplemented('blacklab.postShares'),
		postFormat: () => unimplemented('blacklab.postFormat'),
		postCorpus: () => unimplemented('blacklab.postCorpus'),
		postDocuments: () => unimplemented('blacklab.postDocuments'),
		deleteFormat: () => unimplemented('blacklab.deleteFormat'),
		deleteCorpus: () => unimplemented('blacklab.deleteCorpus'),
		getDocumentInfo: () => unimplemented('blacklab.getDocumentInfo'),
		getRelations: () => unimplemented('blacklab.getRelations'),
		getParsePattern: () => unimplemented<BLParsePatternResponse>('blacklab.getParsePattern'),
		getHits: <T extends BLHitResults | BLHitGroupResults>() => unimplemented<T>('blacklab.getHits'),
		getHitsCsv: () => unimplemented<Blob>('blacklab.getHitsCsv'),
		getDocsCsv: () => unimplemented<Blob>('blacklab.getDocsCsv'),
		getDocs: <T extends BLDocResults | BLDocGroupResults>() => unimplemented<T>('blacklab.getDocs'),
		getSnippet: () => unimplemented('blacklab.getSnippet'),
		getTermFrequencies: () => unimplemented('blacklab.getTermFrequencies'),
		getTermAutocomplete: () => unimplemented<string[]>('blacklab.getTermAutocomplete'),
		getMetadataAutocomplete: () => unimplemented<string[]>('blacklab.getMetadataAutocomplete'),
	};
}

function createFrontendApiMock(): FrontendApi {
	return {
		getConfig: () => unimplemented<CFPageConfig>('frontend.getConfig'),
		getDocumentContents: () => unimplemented<string>('frontend.getDocumentContents'),
		getDocumentMetadata: () => unimplemented<string>('frontend.getDocumentMetadata'),
		getHelp: () => resolvedRequest<string>(''),
		getAbout: () => resolvedRequest<string>(''),
		getTagset: () => unimplemented<Tagset>('frontend.getTagset'),
	};
}

export function createBlackLabMock(overrides: ApiMockOverrides<BlackLabApi> = {}): BlackLabApi {
	return { ...createBlackLabApiMock(), ...overrides };
}
export function createFrontendMock(overrides: ApiMockOverrides<FrontendApi> = {}): FrontendApi {
	return { ...createFrontendApiMock(), ...overrides };
}

export { rejectedRequest, resolvedRequest };
