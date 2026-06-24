import type { BlackLabApi, FrontendApi } from '@/shared/api/lib/api-types';
import type { CFPageConfig, Tagset } from '@/types/apptypes';
import type * as BLTypes from '@/types/blacklabtypes';

import { CancelableRequest } from '@/shared/api/lib/api-types';

type ApiMock = {
	blacklab: BlackLabApi;
	frontend: FrontendApi;
};

function resolvedRequest<T>(value: T): CancelableRequest<T> {
	return new CancelableRequest(Promise.resolve(value), () => {});
}

function rejectedRequest<T>(message: string): CancelableRequest<T> {
	return new CancelableRequest(Promise.reject(new Error(message)), () => {});
}

function unimplemented<T>(name: string): CancelableRequest<T> {
	return rejectedRequest<T>(`Unimplemented API mock: ${name}`);
}

type ApiMockOverrides = {
	blacklab?: Partial<BlackLabApi>;
	frontend?: Partial<FrontendApi>;
};

function createBlackLabApiMock(): BlackLabApi {
	return {
		getServerInfo: () => unimplemented<BLTypes.BLServer>('blacklab.getServerInfo'),
		getUser: () => unimplemented<BLTypes.BLUser>('blacklab.getUser'),
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
		getParsePattern: () => unimplemented<BLTypes.BLParsePatternResponse>('blacklab.getParsePattern'),
		getHits: <T extends BLTypes.BLHitResults | BLTypes.BLHitGroupResults>() => unimplemented<T>('blacklab.getHits'),
		getHitsCsv: () => unimplemented<Blob>('blacklab.getHitsCsv'),
		getDocsCsv: () => unimplemented<Blob>('blacklab.getDocsCsv'),
		getDocs: <T extends BLTypes.BLDocResults | BLTypes.BLDocGroupResults>() => unimplemented<T>('blacklab.getDocs'),
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

export function createApiMock(overrides: ApiMockOverrides = {}): ApiMock {
	return {
		blacklab: {
			...createBlackLabApiMock(),
			...overrides.blacklab,
		},
		frontend: {
			...createFrontendApiMock(),
			...overrides.frontend,
		},
	};
}

export { rejectedRequest, resolvedRequest };
