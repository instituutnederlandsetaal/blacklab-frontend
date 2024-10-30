export type BLFSchema = {
	/** Displayname of this format. I.e. without the owner's username etc. */
	displayName?: string;
	/** Description of the format. E.g. which files it's meant for. */
	description?: string;
	/** Url where more information can be found (optional) */
	helpUrl?: string;
	/** DEPRECATED.  */
	baseFormat?: string;

	/** For your own administration, not used by BlackLab */
	type?: string;

	/**
	 * Plain text files don't allow you to use a lot of BlackLab's features and hence don't require a lot of configuration either. If you need specific indexing features for non-tabular, non-XML file formats, please let us know and we will consider adding them.
	 */
	fileType?: 'xml'|'tabular'|'text';
	/** Only relevant for 'tabular' fileType. Allows you to specificy some extra options. */
	fileTypeOptions?: {
		/** Tab-separated (tsv) or comma-separated (csv, like Excel sheets) */
		type: 'tsv'|'csv';
		/** Defaults to '/' */
		multipleValuesSeparator?: string;
		/** Does the file have column names in the first line? [default: false] */
		columnNames?: boolean;
		/** The delimiter character to use between column values [default: comma (",") for CSV, tab ("\t") for TSV] */
		delimiter?: string;
		/** The quote character used around column values (where necessary) [default: disable quoting column values] */
		quote?: string;

		/** allows inline tags such as in Sketch WPL format. all inline tags encountered will be indexed */
		inlineTags?: boolean;
		/** interprets <g/> to be a glue tag such as in Sketch WPL format */
		glueTags?: boolean;
		/**
		 * If the file includes "inline tags" like <p></p> and <s></s>,
		 * (like for example the Sketch Engine WPL format does)
		 * is it allowed to have separated characters after such a tag?
		 * [default: false]
		 */
		allowSeparatorsAfterInlineTags: boolean;
	}

	/**
	 * Which xml processor to use. Defaults to vtd.
	 * See https://inl.github.io/BlackLab/guide/how-to-configure-indexing.html#xpath-support-level
	 */
	processor?: 'saxon'|'vtd';

	/** Namespace declarations for xpaths. The namespace under the empty string ('') will be the default namespace used. */
	namespaces?: {[uri: string]: string};

	/** Xpath: what elements starts a new document? */
	documentPath: string;

	/** What annotation sets are in the document? */
	annotatedFields: { [annotatedFieldId: string]: AnnotatedField };

	/** Embedded metadata in document */
	metadata: Metadata;
	/** Analyzer to use for metadata fields. Unless overridden in the field */
	metadataDefaultAnalyzer?: 'default'|'standard'|'whitespace'|string;
	/** When to substitute default value for metadata. Defaults to 'never' */
	metadataDefaultUnknownCondition?: 'never'|'missing'|'empty'|'missing_or_empty';
	/** Value to substitute when a metadata field doesn't have a value. Defaults to 'unknown' */
	metadataDefaultUnknownValue?: string;
	/** Name replacements for metadata fields. Only has effect for fields created through forEachPath */
	indexFieldAs?: {[originalName: string]: string};

	/** See https://inl.github.io/BlackLab/guide/how-to-configure-indexing.html#linking-to-external-document-metadata */
	linkedDocuments?: { [fieldname: string]: LinkedDocument };

	/** See https://inl.github.io/BlackLab/guide/how-to-configure-indexing.html#corpus-metadata */
	corpusConfig?: CorpusConfig;

	/** Whether to store the document contents in the content store. Disabling this removes the ability to view document's contents. Defaults to true. */
	store?: boolean;
}

type Metadata = {
	/** Xpath: What element (relative to documentPath) contains the metadata? (If omitted, entire document is used.) */
	containerPath?: string;
	/** Analyzer to use for metadata fields. Unless overridden in the field through */
	defaultAnalyzer?: 'default'|'standard'|'whitespace'|string;
	/** The metadata fields. These are indexed in order of declaration. Their xpaths are relative to 'containerPath'  */
	fields: MetadataField[];
}

type AnnotatedField = {
	/** How to display the field in the interface (optional) */
	displayName?: string;
	/** How to describe the field in the interface (optional) */
	description?: string;

	/** Xpath: What element (relative to documentPath) contains this field's contents? (If omitted, entire document is used.) */
	containerPath?: string;
	/** XPath: What are our word tags (relative to containerPath) */
	wordPath: string;
	/** Xpath: Store an id with every token (wordpath), so you can index standoff annotations referring to this id later. (relative to wordPath) */
	tokenIdPath?: string;
	/** Xpath: punctuation between words. */
	punctPath?: string;
	/**
	 * What annotation can each word have? How do we index them?
	 * (annotations are also called "(word) properties" in BlackLab)
	 * (valuePaths relative to wordPath)
	 * NOTE: forEachPath is NOT allowed for annotations, because we need to know all annotations before indexing,
	 *     and with forEachPath you could run in to an unknown new annotation mid-way through.
	 */
	annotations: Annotation[];
	/**
	 * Standoff annotations are annotations that are specified in a different part of the document.
	 * See https://inl.github.io/BlackLab/guide/how-to-configure-indexing.html#standoff-annotations
	 */
	standoffAnnotations?: StandoffAnnotation[];
	/** What tags occurring between the word tags do we wish to index? (relative to containerPath) */
	inlineTags?: InlineTag[];
}

type InlineTag = {
	/** Xpath: relative to parent AnnotatedField's containerPath */
	path: string;
	/** Xpath: Store an id with this inline tag ('path'), so you can index standoff annotations referring to this id later. */
	tokenIdPath?: string;
	/** E.g. "xml:id": Don't index Unique ids unless you need them; they slow down indexing and searching and increase index size */
	excludeAttributes?: string[];
	/** Acts as attribute whitelist: Only index these attributes. */
	includeAttributes?: string[];
	/** Css class to give these tags in the automatic xslt generation */
	displayAs?: string;
}

type AnnotationBase = {
	/** Name of the annotation */
	name: string;
	/** Name of the annotation in the interface. Defaults to the regular name. */
	displayName?: string;
	/** Description of the annotation in the interface. */
	description?: string;

	/** Xpath: what element contains the value of this annotation */
	valuePath: string;
	/**
	 * Xpath: Store some xpath results before evaluating valuePath,
	 * the stored results can now be used in valuePath.
	 * E.g. valuePath="/some/dynamic/path/$1/",
	 * BlackLab will replace $1 with the result of the first captureValuePaths entry.
	 */
	captureValuePaths?: string[];
	/**
	 * What alternatives are indexed determines how specifically you can specify the desired sensitivity when searching. Each alternative increases index size.
	 * Defaults to 'insensitive'
	 */
	sensitivity?: 'sensitive_insensitive'|'sensitive'|'insensitive'|'s'|'i'|'si'|'all';

	// subannotations?: SubAnnotation[];

	/**
	 * Autocomplete/combobox: show a dropdown list with live search. The user can also type in a custom value.<br>
	 *
	 * Select/dropdown: show a dropdown list with predefined values. The user can't type in a custom value.<br>
	 *
	 * Text: show a text input.<br>
	 *
	 * Pos: show a special part-of-speech editor. You will need to configure it further using custom js, see the README.<br>
	 *
	 * Lexicon: show a special autocomplete that matches alternative spellings and synonyms. You will need to configure it further using custom js, see the README.<br>
	 *
	 * Leaving this empty will default to 'dropdown' if all values are known and 'autocomplete' otherwise.
	 */
	uiType?: 'dropdown'|'select'|'autocomplete'|'combobox'|'lexicon'|'pos'|'text';

	/**
	 * Whether to store the contents of this field in the forward index.
	 * This reduces the size of the index, but disables some features (grouping, sorting, displaying) for this annotation.
	 * Defaults to true.
	 */
	forwardIndex?: boolean;
	/** Defaults to false. */
	multipleValues?: boolean;
	/**
	 * Filter out duplicate values at the same token during indexing?
	 * Not doing this can result in "double hits" where the same token is matched twice in a query.
	 * Defaults to false.
	 */
	allowDuplicateValues?: boolean;
	/** Store the xml instead of the text when 'valuePath' results in an xml element. */
	captureXml?: boolean;
	/** Hides the field in various parts of the corpus-frontend. Not used by blacklab. Defaults to false. */
	isInternal?: boolean;

	/** Post-process values. Every process entry is evaluated in order with the output of the previous one as input. */
	process?: Process[];
}

type SubAnnotationForEach = {
	forEachPath: string;
	namePath: string;
	valuePath: string;
}

type SubAnnotationEnrichment = Omit<AnnotationBase, 'valuePath'>;
/**
 * SubAnnotations can be either a normal annotation declaration,
 * or a special for-each, in which the remaining properties are ignored.
 * or they can be an enrichment for a target of the for-each annotation.
 */
type SubAnnotation = SubAnnotationForEach|SubAnnotationEnrichment|AnnotationBase;

type Annotation = AnnotationBase&{
	/**
	 * Sub annotations can be a special annotation contianing a forEachPath,
	 * or just regular annotations,
	 * or blocks without a valuePath, that set options for annotations generated by the another forEachPath
	 */
	subannotations?: SubAnnotation[];
}

type StandoffAnnotation= StandoffAnnotationRegular | StandoffAnnotationMultipleTokens | StandoffAnnotationDependencyRelation;
type StandoffAnnotationRegular = {
	/** Xpath: where to find the standoff. */
	path: string;
	/**
	 * Xpath: What token position(s) to index these values at. Relative to 'path'.
	 * may have multiple matches; values will be indexed at all those tokens
	 */
	tokenRefPath: string;

	/** What new annotations to store in the referenced tokens. Relative to 'path'. */
	annotations: Annotation[];
}

/** See https://inl.github.io/BlackLab/guide/how-to-configure-indexing.html#standoff-annotations */
type StandoffAnnotationMultipleTokens = {
	/** Xpath: where to find the standoff. */
	path: string;
	/** See https://inl.github.io/BlackLab/guide/how-to-configure-indexing.html#standoff-annotations */
	spanStartPath: string;
	/** See https://inl.github.io/BlackLab/guide/how-to-configure-indexing.html#standoff-annotations */
	spanEndPath: string;
	/** See https://inl.github.io/BlackLab/guide/how-to-configure-indexing.html#standoff-annotations */
	spanEndIsInclusive: boolean;
	/** See https://inl.github.io/BlackLab/guide/how-to-configure-indexing.html#standoff-annotations */
	spanNamePath: string;
	annotations: Annotation[];
}
type StandoffAnnotationDependencyRelation = {
	type: 'relation';
	valuePath: string;
	sourcePath: string;
	targetPath: string;
}

type MetadataField= MetadataFieldSingle | MetadataFieldForEach;
type MetadataFieldSingle = {
	/** Name of the metadata field in BlackLab */
	name: string;
	/** Name that will be displayed in the interface */
	displayName?: string;
	/** Description that will be displayed in the interface */
	description?: string;

	/** Xpath for the value of this metadata. Relative to metadata.containerPath */
	valuePath?: string;
	/** Hardcoded value for this metadata field. Will replace 'valuePath' with the string value. */
	value?: string;
	/** Can this metadata field have multiple values? Useful for things like Authors. Defaults to true. */
	multipleValues?: boolean;
	/** Should metadata be split into words/tokens, or it a number (changes sorting, leading zeroes matching, etc.). Defaults to 'tokenized'. The pidField (see specialFields) should be untokenized usually, or viewing documents in corpus-frontend might not work when the document id contains spaces. */
	type?: 'untokenized'|'tokenized'|'numeric';
	// leave extra line breaks or they won't appear in the monaco editor :(
	/**
	 * Autocomplete/combobox: show a dropdown list with live search. The user can also type in a custom value.
	 *
	 * Range: show two inputs for a min and max value.
	 *
	 * Select/dropdown: show a dropdown list with predefined values. The user can't type in a custom value.
	 *
	 * Checkbox: show a checkbox for every value. Multiple values can be selected.
	 *
	 * Radio: show a radio button for every value. Only one value can be selected.
	 *
	 * Date: show a date picker. The format of values is expected to be yyyymmdd. For example '20210101'.
	 *
	 * Text: show a text input.
	 *
	 * Leaving this empty will default to 'dropdown' if all values are known and 'autocomplete' otherwise.
	 */
	uiType?: 'autocomplete'|'combobox'|'range'|'select'|'dropdown'|'checkbox'|'radio'|'date'|'text';
	/** Post-process values. Every process entry is evaluated in order with the output of the previous one as input. */
	process?: Process[];
	/** Replace values with other values. Takes effect AFTER processing. */
	mapValues?: {[originalValue: string]: string}

	/** When to replace value with default (or ignore it altogether). Defaults to 'never' */
	unknownCondition?: 'never'|'missing'|'empty'|'missing_or_empty';
	/** Default value when the field doesn't have one according to 'unknownCondition' */
	unknownValue?: string;

	analyzer?: string;
	/** Sort values when there are multiple? Useful when sorting or grouping results, as [a,b] and [b,a] could otherwise be different groups. */
	sortValues?: boolean;
}

/** A for-each version of the metadata field, that will loop over the for-each path, and create a field for every match. Further settings should be in the named metadata entry. */
type MetadataFieldForEach = {
	/** Xpath that can match multiple elements. The namePath and valuePath will be evaluated at every position. */
	forEachPath: string;
	/** Xpath for the name of the current metadata field. */
	namePath: string;
	/** Xpath for the value(s) of the current metadata field. */
	valuePath: string;
}

type LinkedDocument = {
	/**
	 * Should we store the linked document in our index?
	 * in this case, a field metadataCid will be created that contains a content
	 * store id, allowing you to fetch the original content of the document later).
	 * Defaults to true.
	 */
	store: boolean;

	/** Xpath: list of xpaths to perform for value substitutions in the inputFile property. */
	linkValues?: Array<{valuePath: string, process: Process[]}>

	/**
	 * How to fetch the linked input file containing the linked document.
	 * File or http(s) reference. May contain $x (x = 1-9), which will be replaced with linkValue
	 * E.G. "https://example.com/$1.xml" where $1 is the result of the first linkValue.
	 */
	inputFile: string;

	/** If the linked input file is an archive, the path inside it. Is interpolated just like 'inputFile'. */
	pathInsideArchive?: string;
	/** Defaults to 'fail' */
	ifLinkPathMissing?: 'ignore'|'warn'|'fail';

	/** Id of the format to use for indexing the linked file. */
	inputFormat: string;

	/** (Optional)
	 * XPath to the (single) linked document to process.
	 * If omitted, the entire file is processed, and must contain only one document.
	 * May contain $x (x = 1-9), which will be replaced with (processed) linkValue.
	 * E.g. /root/metadata[@docId = $2]
	 */
    documentPath?: string;
}

/** Metadata not used by BlackLab directly, but useful for configuring the corpus-frontend search interface. */
type CorpusConfig = {
	/** Corpus display name in the user interface */
	displayName?: string;
	/** Corpus description in the user interface */
	description?: string;
	/** Is the user allowed to view whole documents? [false]. Can also be specified per-document by creating a metadata field with this name containing a boolean. */
	contentViewable?: boolean;
	/** Defaults to 'ltr' */
	textDirection?: 'ltr'|'rtl';

	specialFields?: {
		/** Defaults to 'id' */
		pidField?: string;
		/** Defaults to 'title' */
		titleField?: string;
		/** Defaults to 'author' */
		authorField?: string;
		/** Defaults to 'date' */
		dateField?: string;
	}

	/** How to group together metadata fields in the corpus-frontend search interface. */
	metadataFieldGroups?: MetadataFieldGroup[];
	annotationGroups?: { [annotatedField: string]: AnnotationGroup[]; }

}

type AnnotationGroup = {
	/** Group name */
	name: string;
	/** IDs of annotations in this group. */
	annotations: string[];
	/**
	 * Add all annotations not in any other group. Only one group should have this. Defaults to false.
	 * If you have no group that defines this, BlackLab will make one for you.
	 */
	addRemainingAnnotations?: boolean;
}

/** How to group together metadata fields in the corpus-frontend search interface. */
type MetadataFieldGroup = {
	/** Group name */
	name: string;
	/** Metadata fields in this group */
	fields: string[];
	/**
	 * Add all annotations not in any other group. Only one group should have this. Defaults to false.
	 * If you have no group that defines this, BlackLab will make one for you.
	 */
	addRemainingFields?: boolean;
}



/**
 * @title Regex replace part of the value
 * @description Replace a part of the value with another value, optionally also keeping the original.
 */
type ProcessReplace = {
	action: 'replace';
	/** Regex to find. All matches are processed. */
	find: string;
	/** String to replace with, capture group references ($1) are supported */
	replace: string;
	/** keep both before and after. For this, 'multipleValues' must be true. */
	keep?: 'all';
}
/**
 * @title Default value
 * @description Set a default value if there is none. The default value can be hardcoded, or retrieved from another metadata field.
 */
type ProcessDefaultValue = {
	action: 'default';
	/** Default value to use if the value is empty. */
	value: string;
}
/**
 * @title Default value from another field
 * @description Set a default value if there is none. The default value can be retrieved from another metadata field.
 */
type ProcessDefaultField = {
	action: 'default';
	/** Metadata Field to take the default value from. Make sure this field is further up in the configuration file, so it's already been indexed. */
	field: string;
}
/**
 * @title Append value
 * @description Append a string to all values.
 */
type ProcessAppendValue = {
	action: 'append';
	/** String to append to the value. */
	value: string;
	separator?: string;
}
/**
 * @title Append value from another field
 * @description Append a value of another metadata field to all values.
 */
type ProcessAppendField = {
	action: 'append';
	/** Metadata Field to take the value to append from. Make sure this field is further up in the configuration file, so it's already been indexed. */
	field: string;
	separator?: string;
}
/**
 * @title Split values
 * @description Split the values and keep one or more parts.
 */
type ProcessSplit = {
	action: 'split';
	/** Regex to split on. Defaults to ';' */
	separator?: string;
	/** Which value(s) to keep. A 1-based integer. Defaults to the first value. Special value 'all' will keep all split values. Special value 'both' will keep all split values as well as the input values(s). For 'all' and 'both' to work, the field should have 'multipleValues=true'. */
	keep?: number|'all'|'both';
}
/**
 * @title strip characters
 * @description Strip specific characters from the start and end of values.
 */
type ProcessStrip = {
	action: 'strip';
	/** List of characters to strip from beginning and end.. */
	chars: string;
}
/**
 * @title Parse part of speech
 * @description parse common part of speech expressions of the form A(b=c,d=e)
 * where A is the main part of speech (e.g. 'N' for noun), and b=c is a part of speech feature
 * such as number=plural, etc.
 * If you don't specify field (or specify an underscore _ for field),
 * the main part of speech is extracted.
 * If you specify a feature name (e.g. "number"), that feature is extracted.
 */
type ProcessParsePos = {
	action: 'parsePos';
	/** Field to extract. If omitted or '_', extract the main feature. Eg for NOU(a=b,c=d), the NOU portion. */
	field: string;
}

/**
 * @title Convert CHAT format age to months
 * @description convert age as reported in CHAT format to number of months
 */
type ProcessChatFormatAgeToMonths = {
	action: 'chatFormatAgeToMonths';
}
/**
 * @title Concatenate date fields
 * @description Concatenate multiple other metadata fields for year/month/day into a single value in the format yyyymmdd, so they can be sorted and grouped on, and searched using a range-query.
 */
type ProcessConcatDate = {
	action: 'concatDate';
	/** Name of the other field containing the year. Ensure this is defined before this one, or if won't have been indexed yet. */
	yearField: string;
	/** Name of the other field containing the month. Ensure this is defined before this one, or if won't have been indexed yet. */
	monthField: string;
	/** Name of the other field containing the day. Ensure this is defined before this one, or if won't have been indexed yet. */
	dayField: string;
	/** If the month is missing, 'start' fills with 01 (januari), 'end' fills with 12 (december). If the day is missing, 'start' fills with 01, 'end' fills with the last day of the month (28-31 depending, takes into account leap years.). */
	autofill?: 'start'|'end';
}

type Process = ProcessReplace|ProcessDefaultValue|ProcessDefaultField|ProcessAppendValue|ProcessAppendField|ProcessSplit|ProcessStrip|ProcessParsePos|ProcessChatFormatAgeToMonths|ProcessConcatDate;
