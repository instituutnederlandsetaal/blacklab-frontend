/** @public */
export type BLCollocationType = 'proximity' | 'relsources' | 'reltargets';
/** @public */
export type BLCollocationScorer = (string & {}) | 'coll-dice' | 'coll-salience';

/**
 * Parameters specific to BlackLab's collocations endpoint.
 * @public
 */
export type BLCollocationOptions = {
	/** Optional BCQL pattern restricting which collocates are considered. */
	collpatt?: string;
	/** Proximity-based or relation-based collocations. */
	colltype?: BLCollocationType;
	/** Symmetric window size or `before:after` window (proximity only). */
	context?: number | string;
	/** Name of an XML element that must contain the keyword and collocate (proximity only). */
	within?: string;
	/** Relation type or regular expression (relation-based only). */
	reltype?: string;
	/** Annotation used to identify and group collocates. */
	annotation?: string;
	/** Whether collocate grouping is case- and accent-sensitive. */
	sensitive?: boolean;
	/** Hit-group scorer id. */
	scorertype?: BLCollocationScorer;
};

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

/** A collocations request. Only `patt` is required by the endpoint. */
export type BLCollocationsParameters = Omit<BLSearchParameters, 'number' | 'patt'> & BLCollocationOptions & { patt: string; number?: number };

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

interface BLCacheStatus {
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
export const isServerV5 = (v: BLServer | BLServerV4): v is BLServer => (v as BLServer).corpora != null;

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

// #endregion

// # region annotation/metadata groups

type BLAnnotationGroupV4 = {
	name: string;
	annotations: string[];
};
type BLAnnotationGroup = {
	groupName: string;
	annotations: string[];
	addRemainingAnnotations: boolean;
};

type BLMetadataGroupV4 = {
	name: string;
	fields: string[];
};
type BLMetadataGroup = {
	name: string;
	fieldNamesInGroup: string[];
	addRemainingFields: boolean;
};

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

// #endregion

interface BLSpanInfo {
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
/** V4 also includes `terms` when list values were requested, so only V5's `custom` container distinguishes the shapes. */
export const isBLAnnotationV5 = (v: BLAnnotation | BLAnnotationV4): v is BLAnnotation => (v as BLAnnotation).custom != null;

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

type BLAnnotatedFieldCustom = {
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
// #endregion

// --------------
// Search results
// --------------

// #region docssearchsummary

type BLSearchSummarySampleV4 =
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
	hits: number | undefined; // when no pattern, no hits.
	documents: number;
	timeMs: number;
	/** Always present, but never true unless status === 'finished' (even then - only when there were more results but BlackLab stopped the search due to configured limits) */
	stoppedBecauseTooMany: boolean;
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

export type BLSearchSummaryV5 = {
	params: BLSearchParameters;
	pattern?: BLSearchSummaryPatternInfo;
	results: {
		/** Always present, but mostly empty when  */
		window: BLSearchSummaryWindowV5;
		stats: {
			processed: BLSearchResultsStatsV5;
			counted: BLSearchResultsStatsV5;
			/** Subcorpus across the whole query; i.e. what would be matched if pattern wasn't present */
			subcorpusSize?: BLSubcorpusSize;
		} & ({ numberOfGroups: undefined; largestGroupSize: undefined } | { numberOfGroups: number; largestGroupSize: number });

		sample:
			| {
					sample: number;
					seed: number;
			  }
			| {
					percentage: number;
					seed: number;
			  }
			| {
					percentage: undefined;
					seed: undefined;
					sample: undefined;
			  };
	};
};

type BLSearchSummaryPatternInfoV4 = {
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
type BLGroupV4 = {
	identity: string;
	identityDisplay: string;
	size: number;
	/** Group score, present when a hit-group scorer was requested. */
	score?: number;
	/** Individual property values that identify this group. Whereas identity and identityDisplay are encoded cq. preformatted, these are the raw values. */
	properties: Array<{
		name: string;
		value: string;
	}>;
};

type BLHitGroupV4 = BLGroupV4 & {
	/** When grouped on annotation + metadata */
	numberOfDocs: number;
	/** Present when grouped on at least one metadata field, and subcorpussize=true was in the request. If not present and subcorpussize=true was passed, use the main summary. */
	subcorpusSize?: BLSubcorpusSize;
};

export type BLHitGroup = BLHitGroupV4;

type BLDocGroupV4 = BLGroupV4 & {
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
	summary: BLSearchSummaryV5;
};

/** Blacklab response for a query for documents with grouping enabled */
export interface BLDocGroupResultsV4 {
	docGroups: BLDocGroupV4[];
	summary: BLSearchSummaryV4 & BLSearchSummaryGroupedV4;
}

/** Blacklab response for a query for documents with grouping enabled */
export interface BLDocGroupResults {
	docGroups: BLDocGroup[];
	summary: BLSearchSummaryV5;
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

// #endregion docssnippettypes

/** When tagging part of the query like a:[] returns the start and end of the part labelled with the 'a' (so in this case, the []) */
export interface BLMatchInfoSpan {
	/** When tagging part of the query like a:[] returns the start and end of the part labelled with the 'a' (so in this case, the []) */
	type: 'span';
	start: number;
	end: number;
}

/** Something like "within <s/>". Represents the start and end of the span surrounded with the <s/>. */
interface BLMatchInfoTag {
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

/** Raw V5 hit returned by BlackLab. Use BLHit inside app code. */
export type BLHitV5 = {
	docPid: string;
	before?: BLHitSnippetPart;
	match: BLHitSnippetPart;
	after?: BLHitSnippetPart;
	start: number;
	end: number;
	/** parallel corpus: aligned hits in other (requested) versions. Keyed by the full id of the annotatedField e.g. "contents__en" */
	otherFields?: Record<string, BLHitInOtherFieldV5>;
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
};

/** Raw V4 hit returned by BlackLab. Use BLHit inside app code. */
export type BLHitV4 = Pick<BLHitV5, 'docPid' | 'start' | 'end' | 'match' | 'matchInfos'> & {
	left?: BLHitSnippetPart;
	right?: BLHitSnippetPart;

	/** parallel corpus: aligned hits in other (requested) versions. Keyed by the full id of the annotatedField e.g. "contents__en" */
	otherFields?: Record<string, BLHitInOtherFieldV4>;
};

/** Raw V4 snippet embedded in document results. Use BLHitInDoc inside app code. */
export type BLHitInDocV4 = Pick<BLHitV4, 'left' | 'match' | 'right'>;

/** Raw V5 snippet embedded in document results. Use BLHitInDoc inside app code. */
export type BLHitInDocV5 = Pick<BLHitV5, 'before' | 'match' | 'after'>;

/** Raw V4 hit in another annotated field. Use BLHitInOtherField inside app code. */
export type BLHitInOtherFieldV4 = Omit<BLHitV4, 'otherFields' | 'docPid'>;

/** Raw V5 hit in another annotated field. Use BLHitInOtherField inside app code. */
export type BLHitInOtherFieldV5 = Omit<BLHitV5, 'otherFields' | 'docPid'>;

/** Canonical normalized snippet shape used inside the app. */
export type BLHitInDoc = {
	before: BLHitSnippetPart;
	match: BLHitSnippetPart;
	after: BLHitSnippetPart;
};

/** Canonical normalized hit shape used inside the app. */
export type BLHit = BLHitInDoc & {
	docPid: string;

	start: number;
	end: number;

	otherFields?: Record<string, BLHitInOtherField>;
	matchInfos?: Record<string, BLMatchInfo>;
};

/** Canonical normalized hit in another annotated field used inside the app. */
export type BLHitInOtherField = Omit<BLHit, 'otherFields' | 'docPid'>;

/** Canonical normalized snippet/hit data that may not include document/position metadata. */
export type BLHitInContext = BLHitInDoc & Partial<Pick<BLHit, 'docPid' | 'start' | 'end' | 'otherFields' | 'matchInfos'>>;

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

/** DocInfo in a hits response - Fields without indexed values are omitted! */
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
	snippets?: BLHitInDocV4[];
};

/** Raw V5 document result returned by BlackLab. Use BLDoc inside app code. */
export type BLDocV5 = {
	docInfo: BLDocInfo;
	docPid: string;
	/* Only when query was performed with a cql pattern */
	numberOfHits?: number;
	/* Only when query was performed with a cql pattern */
	snippets?: BLHitInDocV5[];
};

/** Info returned when getting hits or documents. */
export type BLDoc = {
	docInfo: BLDocInfo;
	docPid: string;
	/* Only when query was performed with a cql pattern */
	numberOfHits?: number;
	/* Only when query was performed with a cql pattern */
	snippets?: BLHitInDoc[];
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

/** Raw V5 BlackLab response to a query for documents without grouping. Use BLDocResults inside app code. */
export type BLDocResultsV5 = {
	docs: BLDocV5[];
	summary: BLSearchSummaryV5;
};

/** Blacklab response to a query for documents without grouping */
export type BLDocResults = {
	docs: BLDoc[];
	summary: BLSearchSummaryV5;
};

/** Blacklab response to a query for hits without grouping */
export interface BLHitResultsV4 {
	docInfos: Record<string, BLDocInfoV4>;
	hits: BLHitV4[];
	summary: BLSearchSummaryV4 & BLSearchSummaryPatternV4;
}

export type BLHitResultsV5 = {
	docInfos: Record<string, BLDocInfo>;
	hits: BLHitV5[];
	summary: BLSearchSummaryV5;
};

/** Normalized version */
export type BLHitResults = {
	docInfos: Record<string, BLDocInfo>;
	hits: Array<BLHit>;
	summary: BLSearchSummaryV5;
};

export type BLSearchResult = BLHitResults | BLDocResults | BLHitGroupResults | BLDocGroupResults;

export const isHitResults = (d: BLSearchResult | null | undefined): d is BLHitResults => (d as Partial<BLHitResults> | null | undefined)?.hits != null;
export const isDocResults = (d: BLSearchResult | null | undefined): d is BLDocResults => (d as Partial<BLDocResults> | null | undefined)?.docs != null;
export const isHitGroups = (d: BLSearchResult | null | undefined): d is BLHitGroupResults => (d as Partial<BLHitGroupResults> | null | undefined)?.hitGroups != null;
export const isDocGroups = (d: BLSearchResult | null | undefined): d is BLDocGroupResults => (d as Partial<BLDocGroupResults> | null | undefined)?.docGroups != null;
export const isGroups = (d: BLSearchResult | null | undefined): d is BLHitGroupResults | BLDocGroupResults => isHitGroups(d) || isDocGroups(d);

export const hasPatternInfo = (summary: BLSearchSummaryV5 | null | undefined): summary is BLSearchSummaryV5 & { pattern: BLSearchSummaryPatternInfo } => summary?.pattern != null;

export const isBLError = (e: any): e is BLError => !!(e && e.error && e.error.code && e.error.message);

/** Are these valid parameters with a pattern that will yield results with hits? */
export function isHitParams(params: BLSearchParameters | null | undefined): params is BLSearchParameters {
	return !!(params && params.patt);
}
