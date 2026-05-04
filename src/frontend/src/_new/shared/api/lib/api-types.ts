import type { CFPageConfig, NormalizedFormat, NormalizedIndex, NormalizedIndexBase, Tagset } from "@/types/apptypes";
import type { BLAnnotatedField, BLDocGroupResults, BLDocResults, BLDocument, BLFormatContent, BLHit, BLHitGroupResults, BLHitResults, BLParsePatternResponse, BLRelationInfo, BLResponse, BLSearchParameters, BLServer, BLShareInfo, BLTermOccurances, BLUser } from "@/types/blacklabtypes";
import type { CancelableRequest } from "@/utils/loadable-streams";
import type { AxiosRequestConfig } from "axios";

export type ApiEndpoint<ResponseType = never, Params extends any[] = []> = (...args: [...Params, requestParameters?: AxiosRequestConfig]) => CancelableRequest<ResponseType>;

export type DocumentContentsParameters = {
	indexId: string,
	docId: string,
	patt?: string,
	pattgapdata?: string,
	wordstart?: number,
	wordend?: number,
	/** Annotated field for which to get contents */
	viewField: string,
	/** Annotated field in which to search (for parallel corpora) - only required if different from field */
	searchfield?: string
};

export interface FrontendApi {
	/** Retrieve the config for a given corpus/index, or return the default config (or overrides of the default config) if indexId is null */
	getConfig: ApiEndpoint<CFPageConfig, [indexId: string|null]>;
	getDocumentContents: ApiEndpoint<string, [params: DocumentContentsParameters]>;
	getDocumentMetadata: ApiEndpoint<string, [indexId: string, pid: string]>;
	/** Return the HTML of the help page for the corpus, or the default help page if indexId is not provided */
	getHelp: ApiEndpoint<string, [indexId?: string]>;
	/** Return the HTML of the about page for the corpus, or the default about page if indexId is not provided */
	getAbout: ApiEndpoint<string, [indexId?: string]>;
	getTagset: ApiEndpoint<Tagset, [indexId: string]>;
}

export interface BlackLabApi {
	getServerInfo: ApiEndpoint<BLServer>;
	getUser: ApiEndpoint<BLUser>;
	getCorpora: ApiEndpoint<NormalizedIndexBase[]>;
	getCorpusStatus: ApiEndpoint<NormalizedIndexBase, [id: string]>;
	getCorpus: ApiEndpoint<NormalizedIndex, [id: string]>;
	getAnnotatedField: ApiEndpoint<BLAnnotatedField, [indexId: string, fieldName: string]>;
	getShares: ApiEndpoint<BLShareInfo, [id: string]>;
	getFormats: ApiEndpoint<NormalizedFormat[]>;
	getFormatContent: ApiEndpoint<BLFormatContent, [id: string]>;
	getFormatXslt: ApiEndpoint<string, [id: string]>;
	postShares: ApiEndpoint<BLResponse, [id: string, users: BLShareInfo]>;
	postFormat: ApiEndpoint<BLResponse, [name: string, contents: string]>;
	postCorpus: ApiEndpoint<BLResponse, [id: string, displayName: string, format: string]>;
	postDocuments: ApiEndpoint<BLResponse, [indexId: string, docs: File[], meta?: File[]|null, onProgress?: (percentage: number) => any]>;
	deleteFormat: ApiEndpoint<BLResponse, [id: string]>;
	deleteCorpus: ApiEndpoint<BLResponse, [id: string]>;
	getDocumentInfo: ApiEndpoint<BLDocument, [indexId: string, documentId: string, params?: { query?: string }]>;
	getRelations: ApiEndpoint<BLRelationInfo, [indexId: string]>;
	getParsePattern: ApiEndpoint<BLParsePatternResponse, [indexId: string, pattern: string]>;
	getHits<T extends BLHitResults|BLHitGroupResults = BLHitResults|BLHitGroupResults>(indexId: string, params: BLSearchParameters, requestParameters?: AxiosRequestConfig): CancelableRequest<T>;
	getHitsCsv: ApiEndpoint<Blob, [indexId: string, params: BLSearchParameters]>;
	getDocsCsv: ApiEndpoint<Blob, [indexId: string, params: BLSearchParameters]>;
	getDocs<T extends BLDocResults|BLDocGroupResults = BLDocResults|BLDocGroupResults>(indexId: string, params: BLSearchParameters, requestParameters?: AxiosRequestConfig): CancelableRequest<T>;
	getSnippet: ApiEndpoint<BLHit, [indexId: string, docId: string, field: string|undefined, hitstart: number, hitend: number, context?: string|number]>;
	getTermFrequencies: ApiEndpoint<BLTermOccurances, [indexId: string, annotationId: string, values?: string[], filter?: string, number?: number]>;
	getTermAutocomplete: ApiEndpoint<string[], [indexId: string, annotatedFieldId: string, annotationId: string, prefix: string]>;
	getMetadataAutocomplete: ApiEndpoint<string[], [indexId: string, metadataFieldId: string, prefix: string]>;
}

export class ApiError extends Error {
	public readonly title: string;
	public readonly message: string;
	/** Message representing the httpCode, like "Not Found" for 404 */
	public readonly statusText: string;
	/** Http code, -1 if generic network error, http code otherwise, or none if no network error at all. */
	public readonly httpCode: number|undefined;

	public static CANCELLED = new ApiError('Request Cancelled', 'The request was cancelled by the user.', 'Cancelled', -1);

	constructor(title: string, message: string, statusText: string, httpCode: number|undefined) {
		super(message);
		this.title = title;
		this.message = message;
		this.statusText = statusText;
		this.httpCode = httpCode;
	}

	get isCancelledRequest() { return this === ApiError.CANCELLED; }

	public static wrap(error: any): ApiError {
		if (error instanceof ApiError) return error;
		if (error instanceof Error) return new ApiError('Unknown Error', `${error.message}`, 'Error', undefined);
		return new ApiError(error?.title ?? 'Unknown Error', error?.message ?? `${JSON.stringify(error)}`, error?.statusText ?? 'Error', error?.httpCode ?? undefined);
	}
}