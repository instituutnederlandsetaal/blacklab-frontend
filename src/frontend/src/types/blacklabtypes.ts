/** BlackLab query parameters. Is a stricter subset of query parameters blacklab accepts. */
export type BLSearchParameters = {
	/** Limit results to just this document */
	docpid?: string;
	/** Number of results to request */
	number: number;
	/** Index of first result to request */
	first?: number;
	/** Percentage of results to return (0-100), mutually exclusive with 'samplenum' */
	sample?: number;
	/** Sample up to a flat number of results from the total result set, mutually exclusive with 'sample' */
	samplenum?: number;
	/** Seed from which the samples are generated */
	sampleseed?: number;
	/** Context size, may be limited by blacklab. A number for words before and after the hit, or an inline element such as "s", "p", etc. Depending on corpus. See "inlineTags" in input format (*.blf.yaml), or available from getRelations in the api. */
	context?: number | string;
	/** How to filter results: a lucene query */
	filter?: string;
	/** How to sort results, comma-separated list of field:${someMetadataFieldId} or (before|hit|after):${someAnnotationId}[:${someNumberOfTokens}] */
	group?: string;
	/** Annotated field to return the snippet or left/match/right/start/end/captureGroups for. (defaults to main version) */
	field?: string;
	/** Parallel corpus field to search (if you need it to be different from "field", e.g. for viewing documents in another version than you searched.) */
	searchfield?: string;
	/** CQL query */
	patt?: string;
	/**
	 * CQL query gap-filling values, contents of a tsv file in string form.
	 *
	 * See https://blacklab.ivdnt.org//blacklab-server-overview.html#requests
	 */
	pattgapdata?: string;
	/** How to sort results, comma-separated list of field:${someMetadataFieldId} or (before|hit|after):${someAnnotationId}[:${someNumberOfTokens}] */
	sort?: string;
	/** Also return results within this specific group (only when 'group' specified) */
	viewgroup?: string;

	// additionals that aren't used often
	/** V5 only: Include the size of subcorpus. Use 'includetokencount' in V4 */
	subcorpussize?: boolean;
	/** Block until all results have been found */
	waitfortotal?: boolean;
	/** List of comma-separated annotation IDs to include in the kwic data. Use '*' to return values for all fields. */
	listvalues?: string;
	/** List of comma-separated metadata IDs to include in document info. Use '*' to return values for all fields. */
	listmetadatavalues?: string;
	/** List of comma-separated span attribute IDs (e.g. speech.speaker) to include in the kwic data. */
	listspanattributes?: string;

	/** maximum hits to count outside requested window (only does something when > first+number) */
	maxcount?: number;
	/** maximum hits to actually retrieve (only does something when > first+number) */
	maxretrieve?: number;

	/** When using relation matching in pattern, widen the match part of the hit to contain both source and target. */
	adjusthits?: boolean;

	/** When using relation matching in pattern, widen the match part of the hit to contain both source and target. */
	withspans?: boolean;
};

// #region Base responses

/** Shared interface between all acknowledgement responses to post/delete requests */
export interface BLResponse {
	status: {
		code: string;
		message: string;
	};
}

/** Shared error interface for all error responses */
export interface BLError {
	error: {
		code: string;
		message: string;
		stackTrace?: string;
	};
}

export interface BLUser {
	/** When !loggedIn: false, when loggedIn, true/false depending on whether user has hit the private corpora limit. */
	canCreateIndex: boolean;
	/** Only available when loggedIn. Older versions omitted the property entirely, new versions set this to null */
	id?: string | null;
	loggedIn: boolean;
	debugMode?: boolean;
}

export interface BLCacheStatus {
	maxNumberOfSearches: number;
	maxSearchAgeSec: number;
	maxSizeBytes: number;
	numberOfSearches: number;
	sizeBytes: number;
}

/** Base response */
interface BLServerBase {
	/** Generally 4/5/4.0/5.0 */
	apiVersion: string;
	blacklabBuildTime: string;
	blacklabVersion: string;
	blacklabScmRevision: (string & {}) | 'unknown';
	cacheStatus?: BLCacheStatus;
	helpPageUrl: string;
	user: BLUser;
}
export type BLServerV4 = BLServerBase & {
	indices: Record<string, BLIndexV4>;
};
export type BLServer = BLServerBase & {
	corpora: Record<string, BLIndex>;
};
export const isServerV5 = (v: BLServer | BLServerV4): v is BLServer => (v as BLServer).corpora != null && !v.apiVersion?.startsWith('4');
export const isServerV4 = (v: BLServer | BLServerV4): v is BLServerV4 => !isServerV5(v);

// #endregion

// #region Base corpus info, used in /blacklab-server/ and /blacklab-server/corpora/
// =================

export interface BLIndexProgress {
	/** Number of documents finished in this indexing action so far. */
	docsDone: number;
	/** Number of .xml files indexed in this indexing action so far. */
	filesProcessed: number;
	/** Number of tokens finished in this indexing action so far. */
	tokensProcessed: number;
}

type BLCount = {
	tokens: number;
	documents: number;
	/** Parallel only: Total number aggregated across all documents and all their versions. Strictly >= documents */
	docVersions?: number;
};

/** The base structure for an index in the multi-index overview response (e.g. /blacklab-server/ | /blacklab-server/corpora/) */
interface BLIndexBase {
	/** status opening is currently unused, but should be treated as generally unavailable */
	status: 'empty' | 'available' | 'indexing' | 'opening';
	/** key of a BLFormat */
	documentFormat?: string;
	/** yyyy-mm-dd hh:mm:ss */
	timeModified: string;
	/** Only available when status === 'indexing' */
	indexProgress?: BLIndexProgress;
}

export type BLIndexV4 = BLIndexBase & {
	tokenCount: number;
	documentCount: number;
};

export type BLIndex = BLIndexBase & {
	/** Number of tokens and docs in this index (excluding those tokens added in any currently running indexing action). */
	count: BLCount;
};
export const isIndexV5 = (v: BLIndex | BLIndexV4): v is BLIndex => (v as BLIndex).count != null;
export const isIndexV4 = (v: BLIndex | BLIndexV4): v is BLIndexV4 => !isIndexV5(v);

// #endregion

// # region annotation/metadata groups

export type BLAnnotationGroupV4 = {
	name: string;
	annotations: string[];
};
export type BLAnnotationGroup = {
	groupName: string;
	annotations: string[];
	addRemainingAnnotations: boolean;
};
export const isAnnotationGroupV5 = (v: BLAnnotationGroup | BLAnnotationGroupV4): v is BLAnnotationGroup => (v as BLAnnotationGroup).groupName != null;
export const isAnnotationGroupV4 = (v: BLAnnotationGroup | BLAnnotationGroupV4): v is BLAnnotationGroupV4 => !isAnnotationGroupV5(v);

export type BLMetadataGroupV4 = {
	name: string;
	fields: string[];
};
export type BLMetadataGroup = {
	name: string;
	fieldNamesInGroup: string[];
	addRemainingFields: boolean;
};
export const isMetadataGroupV5 = (v: BLMetadataGroup | BLMetadataGroupV4): v is BLMetadataGroup => (v as BLMetadataGroup).fieldNamesInGroup != null;
export const isMetadataGroupV4 = (v: BLMetadataGroup | BLMetadataGroupV4): v is BLMetadataGroupV4 => !isMetadataGroupV5(v);

// #endregion

// #region Corpus Info, used in /blacklab-server/corpora/:corpus | /blacklab-server/:corpus

export type BLDocFieldsV4 = {
	/** Key to a field in BLDocInfo, missing if unknown */
	authorField?: string;
	/** Key to a field in BLDocInfo, missing if unknown */
	dateField?: string;
	/** Key to a field in BLDocInfo, missing if unknown */
	pidField?: string;
	/** Key to a field in BLDocInfo, missing if unknown */
	titleField?: string;
};

/** Contains information about the internal structure of the index - which fields exist for tokens, which metadata fields exist for documents, etc */
interface BLIndexMetadataBase {
	contentViewable: boolean;
	/** key of a BLFormat */
	documentFormat?: string;
	/** Key into annotatedFields */
	mainAnnotatedField: string;
	status: 'empty' | 'available' | 'indexing' | 'opening';
	/** Only available when status === 'indexing' */
	indexProgress?: BLIndexProgress;
	versionInfo: {
		/** e.g. "2026-02-02T11:36:45Z" */
		blacklabBuildTime: string;
		blacklabScmRevision: string;
		blacklabVersion: string;
		indexFormat: '4' | '5';
		/** yyyy-mm-dd hh:mm:ss */
		timeCreated: string;
		/** yyyy-mm-dd hh:mm:ss */
		timeModified: string;
	};
}

type BLIndexMetadataCustomBase = {
	description?: string;
	displayName?: string;
	textDirection: 'ltr' | 'rtl';
	unknownCondition?: string;
	unknownValue?: string;
};

export type BLIndexMetadataV4 = BLIndexMetadataBase &
	BLIndexMetadataCustomBase & {
		indexName: string;

		annotatedFields: Record<string, BLAnnotatedFieldV4>;
		annotationGroups: { [annotatedFieldId: string]: BLAnnotationGroupV4[] };

		metadataFields: Record<string, BLMetadataFieldV4>;
		metadataFieldGroups: BLMetadataGroupV4[];

		fieldInfo: BLDocFieldsV4;
		tokenCount: number;
		documentCount: number;
	};
export type BLIndexMetadata = BLIndexMetadataBase & {
	corpusName: string;

	annotatedFields: Record<string, BLAnnotatedField>;
	metadataFields: Record<string, BLMetadataField>;
	pidField: string;
	custom?: BLIndexMetadataCustomBase & {
		/** Key to a field in BLDocInfo, missing if unknown */
		titleField?: string;
		/** Key to a field in BLDocInfo, missing if unknown */
		authorField?: string;
		/** Key to a field in BLDocInfo, missing if unknown */
		dateField?: string;
		annotationGroups: { [annotatedFieldId: string]: BLAnnotationGroup[] };
		metadataFieldGroups: BLMetadataGroup[];
	};
	count: BLCount;
};
export const isBLIndexMetadataV5 = (v: BLIndexMetadata | BLIndexMetadataV4): v is BLIndexMetadata => (v as BLIndexMetadata).count != null;
export const isBLIndexMetadataV4 = (v: BLIndexMetadata | BLIndexMetadataV4): v is BLIndexMetadataV4 => !isBLIndexMetadataV5(v);

// #endregion

export interface BLSpanInfo {
	/** Number of occurances of this span in the corpus. */
	count: number;
	attributes?: {
		[attributeName: string]: {
			/** Every value encountered for this attribute on this span, and number of occurances */
			values: { [value: string]: number };
			/** Does the values property contain all values or was it truncated? */
			valueListComplete: boolean;
		};
	};
}

export interface BLRelationInfo {
	/**
	 * Spans (previously "inline tags") in the corpus, with their number of occurances.
	 * A Span is a set of two markers in the text, such as <s> and </s> for a sentence.
	 * They can optionally have attributes, etc.
	 * BlackLab can ensure queries fully occur within these spans, etc.
	 */
	spans?: Record<string, BLSpanInfo>;
	/** Only when relations have been indexed in this corpus. */
	relations?: Record<string, Record<string, number>>; // {relClass: {relType: count}}
}

/** Info about users an index is shared with, entries are usernames */
export type BLShareInfo = string[];

export interface BLFormat {
	configurationBased: boolean;
	/** Often empty */
	description: string;
	/** Often empty */
	displayName: string;
	/** Often empty */
	helpUrl: string;
	isVisible: boolean;
}

export interface BLFormatContent {
	/** id */
	formatName: string;
	/** usually one of 'yml', 'yaml', 'json', lowercased */
	configFileType: 'json' | 'yml' | 'yaml' | (string & {});
	/** contents of the file, treat with caution: user content! */
	configFile: string;
}

export interface BLFormats {
	user: BLUser;
	supportedInputFormats: {
		[key: string]: BLFormat;
	};
}

export type BLParsePatternResponse = {
	parsed: {
		bcql: string;
		json: any;
	};
};

// #region Annotation
// ============================

/** Property of a word, usually 'lemma', 'pos', 'word' */
interface BLAnnotationBase {
	hasForwardIndex: boolean;
	isInternal: boolean;

	offsetsAlternative: string;
	sensitivity: 'SENSITIVE_AND_INSENSITIVE' | 'ONLY_SENSITIVE' | 'ONLY_INSENSITIVE' | 'CASE_AND_DIACRITICS_SEPARATE';

	/** Contains ids of other BLAnnotations in the parent annotatedField if this field has subannotations. */
	subannotations?: string[];

	/** Only when values present. Whether the terms/values property contains all values. */
	valueListComplete?: boolean;
}

type BLAnnotationCustom = {
	description?: string;
	displayName?: string;
	/** Only supported values listed - but open-ended */
	uiType?: (string & {}) | 'select' | 'combobox' | 'text' | 'pos' | 'dropdown' | 'autocomplete';
};

export type BLAnnotationV4 = BLAnnotationBase &
	BLAnnotationCustom & {
		/** Only when the indexMetadata was requested with ?listvalues=annotationId,annotationId etc. */
		values?: string[];
	};

export type BLAnnotation = BLAnnotationBase & {
	/** Only included when ?custom=true was passed with the index metadata request */
	custom?: BLAnnotationCustom;
	/** Replacement for the 'values' property in V4, contains the counts as well. */
	terms?: Record<string, number>;
};
export const isBLAnnotationV5 = (v: BLAnnotation | BLAnnotationV4): v is BLAnnotation => (v as BLAnnotation).custom != null || (v as BLAnnotation).terms != null;
export const isBLAnnotationV4 = (v: BLAnnotation | BLAnnotationV4): v is BLAnnotationV4 => !isBLAnnotationV5(v);

// #endregion

// #region AnnotatedField

/** A set of annotations that form one data set on a token, usually there is only one of these in an index, called 'contents' */
interface BLAnnotatedFieldBase {
	fieldName: string;
	hasContentStore: boolean;
	isAnnotatedField: true;
	/** If a cql query is fired that is just "searchterm", this is the annotation that is searched, usually 'word' - key in annotations */
	mainAnnotation: string;
	/** Only when present */
	hasXmlTags?: boolean;
}

export type BLAnnotatedFieldCustom = {
	description?: string;
	displayName?: string;
	displayOrder?: string[];
};

export type BLAnnotatedFieldV4 = BLAnnotatedFieldBase &
	BLAnnotatedFieldCustom & {
		annotations: Record<string, BLAnnotationV4>;
		tokenCount?: number;
		documentCount?: number;
	};
export type BLAnnotatedField = BLAnnotatedFieldBase & {
	annotations: Record<string, BLAnnotation>;
	custom?: BLAnnotatedFieldCustom;
	count: BLCount;
	relations: {
		spans: {
			[spanName: string]: BLSpanInfo;
		};
		// other relations here?
		// e.g. relClass: {relType: count}
	};
};
export const isAnnotatedFieldV5 = (v: BLAnnotatedField | BLAnnotatedFieldV4): v is BLAnnotatedField => (v as BLAnnotatedField).count != null;
export const isAnnotatedFieldV4 = (v: BLAnnotatedField | BLAnnotatedFieldV4): v is BLAnnotatedFieldV4 => !isAnnotatedFieldV5(v);

// #endregion

// #region Metadata

interface BLMetadataFieldBase {
	analyzer: string;
	fieldName: string;
	/** Keys are the values for this field, whereas the value for each key is the number of occurances, type is number, but blacklab reported this as strings for a while. */
	fieldValues: Record<string, number | string>;
	isAnnotatedField: false;
	type: 'TOKENIZED' | 'UNTOKENIZED' | 'NUMERIC';
	/** Are all values contained within the fieldValues */
	valueListComplete: boolean;
}

type BLMetadataFieldCustom = {
	/** Only present when provided in the blf.yaml */
	description?: string;
	/** Only present when provided in the blf.yaml */
	displayName?: string;
	/** Always present in v5, only when configured explicitly in blf.yaml in v4 - same type though */
	displayOrder?: string[];
	/** Alternate display names/values for values in this field.*/
	displayValues?: Record<string, string>;
	/** All the types we support are listed here, though the types are user-defined so in anything can show up. */
	uiType?: (string & {}) | 'select' | 'range' | 'combobox' | 'text' | 'checkbox' | 'radio' | 'autocomplete' | 'dropdown';

	/** Internal blacklab property: when the unknownValue is used as the value for a document where the metadata for this field was unknown when indexing */
	unknownCondition: 'NEVER' | 'MISSING' | 'EMPTY' | 'MISSING_OR_EMPTY';
	/** Internal blacklab property: what default value is substituted during indexing for document that are missing this metadata (depending on unknownCondition) */
	unknownValue: string;
};

/** For now, only properties have been moved - no changes to types */
export type BLMetadataFieldV4 = BLMetadataFieldBase & BLMetadataFieldCustom;
export type BLMetadataField = BLMetadataFieldBase & {
	custom?: BLMetadataFieldCustom;
};
export const isMetadataFieldV5 = (v: BLMetadataField | BLMetadataFieldV4): v is BLMetadataField => (v as BLMetadataField).custom != null;
export const isMetadataFieldV4 = (v: BLMetadataField | BLMetadataFieldV4): v is BLMetadataFieldV4 => !isMetadataFieldV5(v);
// #endregion

// --------------
// Search results
// --------------

// #region docssearchsummary

export type BLSearchSummarySampleV4 =
	| {}
	| {
			samplePercentage: number;
			sampleSeed: number;
	  }
	| {
			sampleSeed: number;
			sampleSize: number;
	  };

/** Match info definition in summary */
export type BLSummaryMatchInfo = {
	type: 'span' | 'tag' | 'relation' | 'list';
	/** field this capture is in (if not default field) */
	fieldName?: string;
	/** field the relation target is in (if not default field) */
	targetField?: string;
};

export type BLSearchSummaryV4 = {
	actualWindowSize: number;
	countTime?: number;
	/** These fields have a special meaning in the BLDocResult.docInfo */
	docFields: BLDocFieldsV4;
	requestedWindowSize: number;
	searchParam: BLSearchParameters;
	searchTime: number;
	/** Only available when request was sent with includetokencount: true */
	tokensInMatchingDocuments?: number;
	windowFirstResult: number;
	windowHasNext: boolean;
	windowHasPrevious: boolean;

	/** Total documents across all counted (not retrieved) hits, -1 if some error occured */
	numberOfDocs: number;
	/** Total documents across all retrieved hits */
	numberOfDocsRetrieved: number;
	/** Is any counting ongoing, generally true unless blacklab finished counting all results or results exceed the count limit (stoppedCountingHits = true) */
	stillCounting: boolean;
} & BLSearchSummarySampleV4;

export type BLSearchSummaryWindowV5 = {
	firstResult: number;
	requestedSize: number;
	actualSize: number;
	hasPrevious: boolean;
	hasNext: boolean;
};

export type BLSearchResultsStatsV5 = {
	/** When status === finished, see stoppedBecauseTooMany for the reason */
	status: 'finished' | 'working';
	hits: number;
	documents: number;
	timeMs: number;
	/** Always present, but never true unless status === 'finished' (even then - only when there were more results but BlackLab stopped the search due to configured limits) */
	stoppedBecauseTooMany: boolean;
};

export type BLSearchResultsSample = BLSearchSummarySampleV4;

type SummaryParams = {
	pattern: boolean;
	grouped: boolean;
	subcorpora: boolean;
	sampled: boolean;
};

export type BLSubcorpusSize = {
	documents: number;
	tokens: number;
	annotatedFields?: Array<{
		fieldName: string;
		documents: number;
		tokens: number;
	}>;
};

type IfSummaryFlag<Flag extends boolean, Value> = true extends Flag ? (false extends Flag ? Value | undefined : Value) : undefined;

export type BLSearchSummaryV5<T extends SummaryParams> = {
	params: BLSearchParameters;
	pattern: IfSummaryFlag<T['pattern'], BLSearchSummaryPatternInfo>;
	results: {
		/** Always present, but mostly empty when  */
		window: BLSearchSummaryWindowV5;
		stats: {
			processed: BLSearchResultsStatsV5;
			counted: BLSearchResultsStatsV5;
			numberOfGroups: IfSummaryFlag<T['grouped'], number>;
			largestGroupSize: IfSummaryFlag<T['grouped'], number>;
			/** Subcorpus across the whole query; i.e. what would be matched if pattern wasn't present */
			subcorpusSize?: IfSummaryFlag<T['subcorpora'], BLSubcorpusSize>;
		};
		sample: IfSummaryFlag<
			T['sampled'],
			| {
					sample: number;
					seed: number;
			  }
			| {
					percentage: number;
					seed: number;
			  }
		>;
	};
};

export type BLSearchSummaryPatternInfoV4 = {
	/** The serialization of the query object BlackLab actually executed. */
	bcql: string;
	/** The main annotatedField that was searched. This is the full name of the field e.g. "contents__en" */
	fieldName: string;
	/** Any other annotatedFields involved in the search (in case of parallel corpora). These are the full names e.g. ["contents__en"] */
	otherFields?: string[];
	/** Json representation of the query. Not present when requesting results as xml output. */
	json?: unknown;
	/* MatchInfos only available when hits are returned (i.e. not a docs request, not grouped) */
	matchInfos?: {
		[key: string]: BLSummaryMatchInfo;
	};
};

export type BLSearchSummaryPatternInfo = BLSearchSummaryPatternInfoV4;

/**
 * Properties in the search summary that are only available if a pattern was passed.
 * Irrespective of whether docs or hits were requested.
 * If a pattern was passed, the summary will contain a pattern object with these properties.
 */
export type BLSearchSummaryPatternV4 = {
	/** Only for queries with a pattern. */
	pattern: BLSearchSummaryPatternInfoV4;
	/** Total number of counted hits (so far), -1 if some error occured */
	numberOfHits: number;
	/** Total number of retrieved hits (so far) */
	numberOfHitsRetrieved: number;
	/** Did the query hit the default count limit (defaultMaxHitsToCount) */
	stoppedCountingHits: boolean;
	/** Did the query hit the default retrieval limit (defaultMaxHitsToRetrieve) */
	stoppedRetrievingHits: boolean;
	subcorpusSize?: {
		documents: number;
		tokens: number;
		annotatedFields?: {
			fieldName: string;
			documents: number;
			tokens: number;
		}[];
	};
};

/** Only when results have been grouped. */
export interface BLSearchSummaryGroupedV4 {
	largestGroupSize: number;
	numberOfGroups: number;

	/**
	 * Contains the size of the entire searched subcorpus (e.g. number of docs and tokens found by the same query without a cql pattern).
	 *
	 * When results ARE grouped based on document metadata, is also present in the individual HitGroups instead,
	 * representing sum of all docs that match the metadata of the group + the main query's lucene filter.
	 */
	subcorpusSize: {
		/** NOTE: may be 0 in rare cases, when specifying a search for the empty value for all metadata fields */
		documents: number;
		/** NOTE: may be 0 in rare cases, when specifying a search for the empty value for all metadata fields */
		tokens: number;
	};
}

// #endregion docssearchsummary

/** Single group of either hits or documents */
export type BLGroupV4 = {
	identity: string;
	identityDisplay: string;
	size: number;
	/** Individual property values that identify this group. Whereas identity and identityDisplay are encoded cq. preformatted, these are the raw values. */
	properties: Array<{
		name: string;
		value: string;
	}>;
};

// NOTE: unchanged, but for completeness' sake
/** Single group of either hits or documents */
export type BLGroup = BLGroupV4;

export type BLHitGroupV4 = BLGroupV4 & {
	/** When grouped on annotation + metadata */
	numberOfDocs: number;
	/** Present when grouped on at least one metadata field, and subcorpussize=true was in the request. If not present and subcorpussize=true was passed, use the main summary. */
	subcorpusSize?: BLSubcorpusSize;
};

export type BLHitGroup = BLGroupV4 & {
	/** Total number of documents represented in this hit group, if BlackLab returned it. */
	numberOfDocs?: number;
	/** Present when grouped on at least one metadata field, and subcorpussize=true was in the request. */
	subcorpusSize?: BLSubcorpusSize;
};

export type BLDocGroupV4 = BLGroupV4 & {
	/** Total number of tokens across all documents in this group */
	numberOfTokens: number;
	/** Present when grouped on at least one metadata field, and subcorpussize=true was in the request. If not present and subcorpussize=true was passed, use the main summary. */
	subcorpusSize?: BLSubcorpusSize;
};

export type BLDocGroup = BLDocGroupV4;

/** Blacklab response for a query for hits with grouping enabled */
export interface BLHitGroupResultsV4 {
	hitGroups: BLHitGroupV4[];
	summary: BLSearchSummaryV4 & BLSearchSummaryPatternV4 & BLSearchSummaryGroupedV4;
}

export type BLHitGroupResults = {
	hitGroups: BLHitGroup[];
	summary: BLSearchSummaryV5<{ grouped: true; pattern: true; subcorpora: true; sampled: boolean }>;
};

/** Blacklab response for a query for documents with grouping enabled */
export interface BLDocGroupResultsV4 {
	docGroups: BLDocGroupV4[];
	summary: BLSearchSummaryV4 & BLSearchSummaryGroupedV4;
}

/** Blacklab response for a query for documents with grouping enabled */
export interface BLDocGroupResults {
	docGroups: BLDocGroup[];
	summary: BLSearchSummaryV5<{ grouped: true; pattern: boolean; subcorpora: true; sampled: boolean }>;
}

// #region docssnippettypes

/**
 * Contains a hit's tokens,
 * deconstructed into the individual annotations/properties, such as lemma, pos, word,
 * always contains punctuation in between tokens
 */
export type BLHitSnippetPart = {
	/**
	 * Punctuation always exists (even if only an empty string or a space).
	 * Punctuation at a token comes BEFORE the word.
	 * The final punctuation (e.g. trailing '?', '.', etc.) is therefor at document length + 1.
	 * This gives a bit of mess in hits, because the punctuation trailing the "before" part of the hit is contained in the match at index 0.
	 * Likewise, punctuation at the end of the hit is contained in the "after" context at index 0.
	 */
	punct: string[];
} &
	/** Usually this contains fields like lemma, word, pos */
	Record<string, string[]>;

/** Shared between v4/v5 - A subset of a BLHit, returned in document requests (/docs) when there are also hits. */
export type BLHitSnippet = {
	match: BLHitSnippetPart;
};

// #endregion docssnippettypes

/** When tagging part of the query like a:[] returns the start and end of the part labelled with the 'a' (so in this case, the []) */
export interface BLMatchInfoSpan {
	/** When tagging part of the query like a:[] returns the start and end of the part labelled with the 'a' (so in this case, the []) */
	type: 'span';
	start: number;
	end: number;
}

/** Something like "within <s/>". Represents the start and end of the span surrounded with the <s/>. */
export interface BLMatchInfoTag {
	/** Something like "within <s/>". Represents the start and end of the span surrounded with the <s/>. */
	type: 'tag';
	start: number;
	end: number;
	/** E.g. "s" */
	tagName: string;
	/** E.g. {id: ["123"]} for <s id=123/> */
	attributes?: Record<string, string[]>;
}

/** Represents the info captured by an arrow in the query (-->, ==>). So the source, target, and value. */
export interface BLMatchInfoRelation {
	/** Represents the info captured by an arrow in the query (-->, ==>). So the source, target, and value. */
	type: 'relation';
	/**
	 * Usually "dep" (for "dependency"), but ultimately decided by the user when they indexed their corpus.
	 * Multiple sets of relations can be indexed if the user wishes to.
	 * Such as relations between equal words in different languages, grammatical relations between words in the same sentence, etc.
	 */
	relClass: string;
	/** The value of the relation. */
	relType: string;

	/** Inclusive index. Not present for root relations */
	sourceStart?: number;
	/** Exclusive index. Not present for root relations */
	sourceEnd?: number;
	/** Inclusive index */
	targetStart: number;
	/** Exclusive index */
	targetEnd: number;
	/** Target field, if different from source field */
	targetField?: string;

	/** Smallest of sourceStart and targetStart */
	start: number;
	/** Smallest of targetStart and targetEnd */
	end: number;
}

/**
 * Usually when requesting all relations within a tag (with query parameter "context=s" when corpus contains <s/> tags for example)
 * The infos will contain a multitude of RelationMatchRelation objects, each representing a relation between two tokens within the span.
 * The start and end of the entirity of the span are also included.
 */
export interface BLMatchInfoList {
	/**
	 * Usually when requesting all relations within a tag (with query parameter "context=s" when corpus contains <s/> tags for example)
	 * The infos will contain a multitude of RelationMatchRelation objects, each representing a relation between two tokens within the span.
	 */
	type: 'list';
	start: number;
	end: number;
	infos: Array<BLMatchInfoRelation | BLMatchInfoTag>;
}

export type BLMatchInfo = BLMatchInfoSpan | BLMatchInfoRelation | BLMatchInfoTag | BLMatchInfoList;

/** One of the otherFields hits (parallel corpus query, hit in one of the target fields) */
export type BLHitInOtherField = Omit<BLHit, 'otherFields' | 'docPid'>;

type BLHitBase = BLHitSnippet & {
	start: number;
	end: number;
	/**
	 * Contains the relevant info about <br>
	 * A) capture groups: tokens with a label in the query, such as a:[pos="..."] would result in {a: {start: x, end: y, type: 'span'}})
	 * B) relations: if querying for tokens with a relation (for example _ -obj-> _), the info about this relation and the (source, target) tokens are also stored here.
	 * The above query could result for example in:
	 *  obj: {
	 *    type: "relation",
	 *    relClass: "dep",
	 *    relType: "obj",
	 *    sourceStart: 26,
	 *    sourceEnd: 27,
	 *    targetStart: 25,
	 *    targetEnd: 26,
	 *    start: 25,
	 *    end: 27
	 *  }
	 */
	matchInfos?: Record<string, BLMatchInfo>;
	docPid: string;
	/** parallel corpus: aligned hits in other (requested) versions. Keyed by te full id of the annotatedField e.g. "contents__en" */
	otherFields?: Record<string, BLHitInOtherField>; //
};

export type BLHitV4 = BLHitBase & {
	/** Omitted if hit is at start of document */
	left?: BLHitSnippetPart;
	/** Omitted if hit is at end of document */
	right?: BLHitSnippetPart;
};

/** A hit in the BlackLab hits response. */
export type BLHit = BLHitBase & {
	/** Always present in hits, never in /snippet requests */
	before?: BLHitSnippetPart;
	/** Always present in hits, never in /snippet requests */
	after?: BLHitSnippetPart;
};

export function hitHasParallelInfo(h: BLHit | BLHitSnippet): h is Required<BLHit> {
	return !!(h as BLHit).matchInfos && !!(h as BLHit).otherFields;
}

/** Contains occurance counts of terms in the index */
export interface BLTermOccurances {
	termFreq: {
		[term: string]: number;
	};
}

/** Contains all metadata for a document. Fields without indexed values are omitted! */
export type BLDocInfoV4 = {
	lengthInTokens: number;
	tokenCounts?: Array<{ fieldName: string; tokenCount: number }>;
	mayView: boolean;
	[metadataField: string]: string | string[] | number | boolean | Array<{ fieldName: string; tokenCount: number }> | undefined;
};

export type BLDocInfo = {
	metadata: Record<string, string[]>;
	tokenCounts: Array<{ fieldName: string; tokenCount: number }>;
	mayView: boolean;
};

export function getMetadataFieldValues(docInfo: BLDocInfo | BLDocInfoV4, fieldId: string | null | undefined): string[] | undefined {
	if (!fieldId) return undefined;
	const value = 'metadata' in docInfo ? (docInfo as BLDocInfo).metadata[fieldId] : (docInfo as BLDocInfoV4)[fieldId];
	if (typeof value === 'string') return [value];
	if (Array.isArray(value) && value.every(v => typeof v === 'string')) return value;
	return undefined;
}

/** Info returned when getting hits or documents. */
export type BLDocV4 = {
	docInfo: BLDocInfoV4;
	docPid: string;
	/* Only when query was performed with a cql pattern */
	numberOfHits?: number;
	/* Only when query was performed with a cql pattern */
	snippets?: BLHitSnippet[];
};

/** Info returned when getting hits or documents. */
export type BLDoc = {
	docInfo: BLDocInfo;
	docPid: string;
	/* Only when query was performed with a cql pattern */
	numberOfHits?: number;
	/* Only when query was performed with a cql pattern */
	snippets?: BLHitSnippet[];
};

/** Info returned when getting a document's metadata directly. */
export type BLDocument = {
	docPid: string;
	docInfo: BLDocInfo;
	docFields: BLDocFieldsV4;
};

export type BLDocumentV4 = {
	docPid: string;
	docInfo: BLDocInfoV4;
	docFields: BLDocFieldsV4;
	metadataFieldGroups: BLMetadataGroupV4[];
	metadataFieldDisplayNames: Record<string, string>;
};

/** Blacklab response to a query for documents without grouping */
export interface BLDocResultsV4 {
	docs: BLDocV4[];
	/** All of the hit properties exist or none of them do, depending on whether a pattern was supplied */
	summary: BLSearchSummaryV4;
}

/** Blacklab response to a query for documents without grouping */
export type BLDocResults = {
	docs: BLDoc[];
	summary: BLSearchSummaryV5<{ grouped: false; pattern: boolean; subcorpora: true; sampled: boolean }>;
};

/** Blacklab response to a query for hits without grouping */
export interface BLHitResultsV4 {
	docInfos: Record<string, BLDocInfoV4>;
	hits: BLHitV4[];
	summary: BLSearchSummaryV4 & BLSearchSummaryPatternV4;
}

export type BLHitResults = {
	docInfo: Record<string, BLDocInfo>;
	hits: BLHit[];
	summary: BLSearchSummaryV5<{ grouped: false; pattern: true; subcorpora: true; sampled: boolean }>;
};

export type BLSearchResultV4 = BLHitResultsV4 | BLDocResultsV4 | BLHitGroupResultsV4 | BLDocGroupResultsV4;
export type BLSearchResult = BLHitResults | BLDocResults | BLHitGroupResults | BLDocGroupResults;

export type BLSearchSummary = BLSearchResult['summary'];
export type BLSearchSummaryPattern = BLSearchSummary & { pattern: BLSearchSummaryPatternInfo };
export type BLSearchSummaryGrouped = BLSearchSummary & {
	results: BLSearchSummary['results'] & {
		stats: BLSearchSummary['results']['stats'] & {
			numberOfGroups: number;
			largestGroupSize: number;
		};
	};
};

export const isHitResultsV4 = (d: any): d is BLHitResultsV4 => !!(d && d.docInfos && d.hits);
export const isHitResults = (d: any): d is BLHitResults => !!(d && d.docInfo && d.hits);
export const isDocResults = (d: any): d is BLDocResults => !!(d && d.docs);
export const isHitGroups = (d: any): d is BLHitGroupResults => !!(d && d.hitGroups);
export const isDocGroups = (d: any): d is BLDocGroupResults => !!(d && d.docGroups);
export const isHitGroupsOrResults = (d: any): d is BLHitResults | BLHitGroupResults => isHitGroups(d) || isHitResults(d);
export const isDocGroupsOrResults = (d: any): d is BLDocResults | BLDocGroupResults => isDocGroups(d) || isDocResults(d);
export const isGroups = (d: any): d is BLHitGroupResults | BLDocGroupResults => isHitGroups(d) || isDocGroups(d);
export const isBLError = (e: any): e is BLError => !!(e && e.error && e.error.code && e.error.message);

export function hasPatternInfo(e?: BLSearchResult | null): e is BLSearchResult & { summary: BLSearchSummaryPattern };
export function hasPatternInfo(e?: BLSearchSummary | null): e is BLSearchSummaryPattern;
export function hasPatternInfo(e?: BLSearchResult | BLSearchSummary | null) {
	if (e == null) return false;
	const summary = 'summary' in e ? e.summary : e;
	return summary.pattern != null;
}
export const hasGroupInfo = <T extends BLSearchResult>(e?: T | null): e is T & { summary: T['summary'] & BLSearchSummaryGrouped } => e != null && e.summary.results.stats.numberOfGroups != null;

/** Are these valid parameters with a pattern that will yield results with hits? */
export function isHitParams(params: BLSearchParameters | null | undefined): params is BLSearchParameters {
	return !!(params && params.patt);
}
