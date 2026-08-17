/**
 * EXTERNAL CUSTOMIZATION API
 *
 * This is the only entry point exposed to corpus customization scripts. The
 * declaration build bundles it and its type-only imports into one standalone
 * package. Frontend-only implementation belongs in ../internal or ../shared
 * and must not be exported here.
 */

import type { ContainerPresentation, FieldPresentation, FormNodeKind, FormValue, QueryCombineMode, RangeMode } from '@/features/form/model/types/form-primitives';
import type { Corpus as InternalCorpus, DeepReadonly, NormalizedIndex as InternalNormalizedIndex } from '@/types/apptypes';
import type { BLDoc, BLDocInfo, BLHitGroup, BLHitInContext, BLHitSnippetPart, BLMatchInfo, BLSearchResultsStatsV5, BLSearchSummaryV5 } from '@/types/blacklabtypes';

/** Identifies one of the four ways users can enter a text query. */
export type SearchPatternMode = 'simple' | 'extended' | 'advanced' | 'expert';

/** Identifies the document grouping, N-gram, or frequency Explore form. */
export type ExploreFormMode = 'corpora' | 'ngram' | 'frequency';

/** Identifies whether an item belongs to Search or Explore. */
export type SearchFormSection = 'search' | 'explore';

/** Visual styles supported by form fields. */
/** @materialize */
export type SearchFormFieldPresentation = FieldPresentation;

/** Visual styles supported by form containers. */
/** @materialize */
export type SearchFormContainerPresentation = ContainerPresentation;

/** Text shown in the form, supplied directly or through a function. */
/** @materialize */
export type SearchFormText = FormValue<string>;

/** One selectable value in a form control. */
export type SearchFormOption = {
	/** Value stored and submitted when this choice is selected. */
	value: string;
	/** Text shown to the user. The value is shown when omitted. */
	label?: SearchFormText;
	/** Tooltip shown for this choice. */
	title?: SearchFormText | null;
	/** Prevents the user from selecting this choice. */
	disabled?: boolean;
};

/** Selectable values displayed together under one heading. */
export type SearchFormOptionGroup = {
	/** Heading shown for the group. */
	label?: SearchFormText;
	/** Tooltip shown for the group heading. */
	title?: SearchFormText | null;
	/** Prevents the user from selecting choices in this group. */
	disabled?: boolean;
	/** Choices contained in the group. */
	options: Array<string | SearchFormOption>;
};

/** Selectable values accepted by choice controls. */
export type SearchFormOptions = Array<string | SearchFormOption | SearchFormOptionGroup>;

/** Read-only information returned by BlackLab for an index. */
export type NormalizedIndex = DeepReadonly<InternalNormalizedIndex>;

/** Read-only information about the current corpus. */
export type Corpus = DeepReadonly<InternalCorpus>;

/** An annotation available in the current corpus. */
/** @materialize */
export type SearchFormAnnotation = Corpus['allAnnotations'][number];

/** An annotated field available in the current corpus. */
/** @materialize */
export type SearchFormAnnotatedField = Corpus['allAnnotatedFields'][number];

/** A metadata field available in the current corpus. */
/** @materialize */
export type SearchFormMetadataField = Corpus['allMetadataFields'][number];

/** A configured group of annotations. */
/** @materialize */
export type SearchFormAnnotationGroup = Corpus['annotationGroups'][number];

/** A configured group of metadata fields. */
/** @materialize */
export type SearchFormMetadataGroup = Corpus['metadataGroups'][number];

/** Relation and XML element information for the current corpus. */
export type CorpusRelationInfo = Corpus['relations'];
type CorpusSpan = NonNullable<CorpusRelationInfo['spans']>[string];

/** An attribute of an XML element, including its known values. */
/** @materialize */
export type CorpusSpanAttribute = NonNullable<CorpusSpan['attributes']>[string];

/** Kinds of item that can appear in a search form. */
/** @materialize */
export type SearchFormNodeKind = FormNodeKind;

/** Prevent plain objects from masquerading as nodes created by this API. */
declare const searchFormNodeHandle: unique symbol;

/** Common information and identity for a field, form, container, or display-only item. */
export interface SearchFormNode {
	readonly [searchFormNodeHandle]: true;
	/** Unique ID used to find and place this item. */
	readonly id: string;
	/** Whether this item is an input field, display-only item, container, or form. */
	readonly kind: SearchFormNodeKind;
	/** Group name used when displaying this item in query summaries. */
	readonly groupId?: string;
	/** Heading or tab label shown for this item. */
	readonly title?: SearchFormText;
}

/** A search form item that accepts user input. */
export interface SearchFormFieldNode extends SearchFormNode {
	readonly kind: 'field';
}

/** A search form item that displays content without accepting input. */
export interface SearchFormViewNode extends SearchFormNode {
	readonly kind: 'view';
}

/** A search form item or its ID. */
export type SearchFormNodeReference = SearchFormNode | string;

/** A form or container that can hold other form items. Use these methods to place items created by `SearchFormNodeConstructors`. */
export interface SearchFormContainerNode extends SearchFormNode {
	readonly kind: 'container' | 'form';
	/** Items currently contained here, in display order. */
	readonly children: readonly SearchFormNode[];
	/** Adds an item before all current children and returns it. */
	prependChild<Child extends SearchFormNode>(child: Child): Child;
	/** Adds an item immediately before another child and returns the added item. */
	insertBefore<Child extends SearchFormNode>(newChild: Child, referenceChild: SearchFormNodeReference): Child;
	/** Replaces a child and returns the removed item. */
	replaceChild<Child extends SearchFormNode>(newChild: Child, oldChild: SearchFormNodeReference): SearchFormNode;
	/** Removes a child and returns it. */
	removeChild(child: SearchFormNodeReference): SearchFormNode;
	/** Adds items to the end of this container. Null and undefined values are ignored. */
	addChildren(...children: Array<SearchFormNode | null | undefined>): this;
}

/** Finds and changes form items. Use `SearchFormIds` to obtain the IDs of standard items. */
export interface SearchFormGraph {
	/** Returns the top-level form container. */
	getRoot(): SearchFormContainerNode;
	/** Returns whether an item with this ID exists. */
	hasNode(id: string): boolean;
	/** Returns an item by ID, or null when it does not exist. */
	getNode(id: string): SearchFormNode | null;
	/** Returns the containers that directly contain an item. */
	getParents(nodeOrId: SearchFormNodeReference): SearchFormContainerNode[];
	/** Returns whether one item contains another at any depth. */
	contains(ancestor: SearchFormNodeReference, descendant: SearchFormNodeReference): boolean;
	/** Returns an input field by ID, or null when it does not exist or is another kind of item. */
	getField(id: string): SearchFormFieldNode | null;
	/** Returns a display-only item by ID, or null when it does not exist or is another kind of item. */
	getView(id: string): SearchFormViewNode | null;
	/** Returns a form by ID, or null when it does not exist or is another kind of item. */
	getForm(id: string): SearchFormContainerNode | null;
	/** Returns a container by ID, or null when it does not exist or is another kind of item. */
	getContainer(id: string): SearchFormContainerNode | null;
	/** Replaces an item by ID and returns the removed item. The replacement must use the same ID. */
	replaceNode(id: string, replacement: SearchFormNode): SearchFormNode;
	/** Removes an item by ID and returns it. */
	removeNode(id: string): SearchFormNode;
	/** Removes and returns registered items that are no longer part of the form. */
	pruneDetachedNodes(): SearchFormNode[];
	/** All registered form items. */
	readonly nodeList: SearchFormNode[];
	/** All registered containers and forms. */
	readonly containerList: SearchFormContainerNode[];
	/** All registered forms, in registration order. */
	readonly formsList: SearchFormContainerNode[];
	/** Registered forms indexed by ID. */
	readonly formsMap: Record<string, SearchFormContainerNode>;
}

/** Controls the identity, grouping, and appearance of a new form item. */
export type SearchFormNodeOptions<Extra extends object = object> = {
	/** Unique ID used to find and place the new item. Use an ID from `SearchFormIds` when replacing a standard item. */
	id: string;
	/** Group name used when displaying this field in query summaries. */
	groupId?: string;
	/** Visual style applied by the field component. */
	variant?: SearchFormFieldPresentation | SearchFormFieldPresentation[];
	/** Whether the field's label is shown beside its input. */
	showLabel?: boolean;
} & Extra;

/** An annotation ID, optionally paired with its annotated field ID. */
export type SearchFormAnnotationReference =
	| string
	| {
			/** Annotation ID within the annotated field. */
			id: string;
			/** Annotated field containing the annotation. Required when IDs are not unique across fields. */
			annotatedFieldId: string;
	  };

/** Names and describes a metadata field used by a custom control. */
export type SearchFormMetadataDescriptor = {
	/** ID used for translations and as the metadata field ID unless the constructor overrides it. */
	id: string;
	/** Label used when no translation is available. */
	defaultDisplayName?: string;
	/** Help text used when no translation is available. */
	defaultDescription?: string;
};
/** A metadata field ID or a custom metadata field description. */
export type SearchFormMetadataReference = string | SearchFormMetadataDescriptor;

/** Describes an XML attribute used by a within filter. */
export type SearchFormWithinTarget = {
	/** ID used for translations and query summaries. */
	id: string;
	/** Name of the XML element containing the attribute. */
	elementName: string;
	/** Name of the XML attribute to search. */
	attributeName: string;
	/** Label used when no translation is available. */
	defaultDisplayName?: string;
	/** Help text used when no translation is available. */
	defaultDescription?: string;
};
/** `strict` requires a stored range to fall fully inside the entered range; `permissive` also accepts partial overlap. */
/** @materialize */
export type SearchFormRangeMode = RangeMode;

/** Text accepted by a range input. */
export type SearchFormRangeValue = SearchFormText;

/** Control shown for an annotation. `auto` uses the corpus configuration and available values. */
export type SearchFormAnnotationControl = 'auto' | 'text' | 'autocomplete' | 'select' | 'pos' | 'lexicon';

/**
 * Creates input fields for the search form. A new field is shown only after it is added to a `SearchFormContainerNode`
 * or passed to a replacement method on `SearchFormGraph`. Use `SearchFormIds` to find standard containers and fields.
 */
export interface SearchFormNodeConstructors {
	/** Creates an annotation field using the control configured for that annotation. */
	annotation(annotation: SearchFormAnnotationReference, options: SearchFormNodeOptions): SearchFormFieldNode;
	/** Creates a text field for an annotation. */
	annotationText(annotation: SearchFormAnnotationReference, options: SearchFormNodeOptions): SearchFormFieldNode;
	/** Creates a text field with term suggestions for an annotation. */
	annotationAutocomplete(annotation: SearchFormAnnotationReference, options: SearchFormNodeOptions): SearchFormFieldNode;
	/** Creates a multiple-choice field for an annotation. */
	annotationSelect(
		annotation: SearchFormAnnotationReference,
		options: SearchFormNodeOptions<{
			/** Choices shown by the field. By default, the annotation's known values are used. */
			options?: SearchFormOptions;
		}>,
	): SearchFormFieldNode;
	/** Creates a part-of-speech field for an annotation. */
	annotationPos(annotation: SearchFormAnnotationReference, options: SearchFormNodeOptions): SearchFormFieldNode;
	/** Creates a lexicon lookup field for an annotation. */
	annotationLexicon(annotation: SearchFormAnnotationReference, options: SearchFormNodeOptions): SearchFormFieldNode;
	/** Creates a metadata field using the control configured for that field. */
	metadata(fieldId: string, options: SearchFormNodeOptions): SearchFormFieldNode;
	/** Creates a text field for metadata. */
	metadataText(
		field: SearchFormMetadataReference,
		options: SearchFormNodeOptions<{
			/** Indexed metadata field searched by this control. Defaults to `field`. */
			metadataFieldId?: string;
		}>,
	): SearchFormFieldNode;
	/** Creates a text field with value suggestions for metadata. */
	metadataAutocomplete(
		field: SearchFormMetadataReference,
		options: SearchFormNodeOptions<{
			/** Indexed metadata field searched and used for suggestions. Defaults to `field`. */
			metadataFieldId?: string;
		}>,
	): SearchFormFieldNode;
	/** Creates a multiple-choice dropdown for metadata. */
	metadataSelect(
		field: SearchFormMetadataReference,
		options: SearchFormNodeOptions<{
			/** Indexed metadata field searched by this control. Defaults to `field`. */
			metadataFieldId?: string;
			/** Choices shown by the dropdown. */
			options?: SearchFormOptions;
		}>,
	): SearchFormFieldNode;
	/** Creates a checkbox group for metadata. */
	metadataCheckbox(
		field: SearchFormMetadataReference,
		options: SearchFormNodeOptions<{
			/** Indexed metadata field searched by this control. Defaults to `field`. */
			metadataFieldId?: string;
			/** Choices shown as checkboxes. */
			options?: SearchFormOption[];
		}>,
	): SearchFormFieldNode;
	/** Creates a radio-button group for metadata. */
	metadataRadio(
		field: SearchFormMetadataReference,
		options: SearchFormNodeOptions<{
			/** Indexed metadata field searched by this control. Defaults to `field`. */
			metadataFieldId?: string;
			/** Choices shown as radio buttons. */
			options?: SearchFormOption[];
		}>,
	): SearchFormFieldNode;
	/** Creates a numeric or text range field for metadata. */
	metadataRange(
		field: SearchFormMetadataReference,
		options: SearchFormNodeOptions<{
			/** Indexed metadata field searched by this control. Defaults to `field`. */
			metadataFieldId?: string;
			/** Browser input type used for both bounds. */
			inputType?: 'text' | 'number';
			/** Placeholder shown in the lower-bound input. */
			lowPlaceholder?: SearchFormRangeValue;
			/** Placeholder shown in the upper-bound input. */
			highPlaceholder?: SearchFormRangeValue;
			/** Fixed matching behavior. Use null to let the user choose when `showMode` is enabled. */
			mode?: SearchFormRangeMode | null;
			/** Shows a selector for strict or permissive matching. */
			showMode?: boolean;
		}>,
	): SearchFormFieldNode;
	/** Creates a date or date-range field for metadata. */
	metadataDate(
		field: SearchFormMetadataReference,
		options: SearchFormNodeOptions<{
			/** Indexed metadata field searched by this control. Defaults to `field`. */
			metadataFieldId?: string;
			/** Earliest date accepted by the input, as `YYYYMMDD`, `YYYY-MM-DD`, or a Date. */
			min?: string | Date;
			/** Latest date accepted by the input, as `YYYYMMDD`, `YYYY-MM-DD`, or a Date. */
			max?: string | Date;
			/** Fixed strict or permissive matching behavior. */
			mode?: SearchFormRangeMode;
			/** Shows start and end date inputs instead of one date input. */
			range?: boolean;
		}>,
	): SearchFormFieldNode;
	/** Creates a range field backed by separate lower-bound and upper-bound metadata fields. */
	metadataMultiFieldRange(
		field: SearchFormMetadataReference,
		options: SearchFormNodeOptions<{
			/** Metadata field containing each document's lower bound. */
			fromField: string;
			/** Metadata field containing each document's upper bound. */
			toField: string;
			/** Browser input type used for both bounds. */
			inputType?: 'text' | 'number';
			/** Placeholder shown in the lower-bound input. */
			lowPlaceholder?: SearchFormRangeValue;
			/** Placeholder shown in the upper-bound input. */
			highPlaceholder?: SearchFormRangeValue;
			/** Fixed matching behavior. Use null to let the user choose when `showMode` is enabled. */
			mode?: SearchFormRangeMode | null;
			/** Shows a selector for strict or permissive matching. Defaults to true for a two-field range. */
			showMode?: boolean;
		}>,
	): SearchFormFieldNode;
	/** Creates a date range backed by separate start-date and end-date metadata fields. */
	metadataMultiFieldDate(
		field: SearchFormMetadataReference,
		options: SearchFormNodeOptions<{
			/** Metadata field containing each document's start date. */
			fromField: string;
			/** Metadata field containing each document's end date. */
			toField: string;
			/** Earliest date accepted by the input, as `YYYYMMDD`, `YYYY-MM-DD`, or a Date. */
			min?: string | Date;
			/** Latest date accepted by the input, as `YYYYMMDD`, `YYYY-MM-DD`, or a Date. */
			max?: string | Date;
			/** Fixed strict or permissive matching behavior. */
			mode?: SearchFormRangeMode;
			/** Shows start and end date inputs instead of one date input. */
			range?: boolean;
		}>,
	): SearchFormFieldNode;
	/** Creates an XML attribute filter using the supplied control. */
	withinAttribute(
		attribute: SearchFormWithinTarget,
		options: SearchFormNodeOptions<{
			/** Text, range, or dropdown control used for the attribute. */
			control: SearchFormResolvedWithinControl;
		}>,
	): SearchFormFieldNode;
	/** Creates a text filter for an XML attribute. */
	withinText(attribute: SearchFormWithinTarget, options: SearchFormNodeOptions): SearchFormFieldNode;
	/** Creates a multiple-choice filter for an XML attribute. */
	withinSelect(
		attribute: SearchFormWithinTarget,
		options: SearchFormNodeOptions<{
			/** Attribute values shown by the dropdown. */
			options?: SearchFormOptions;
		}>,
	): SearchFormFieldNode;
	/** Creates a numeric or text range filter for an XML attribute. */
	withinRange(
		attribute: SearchFormWithinTarget,
		options: SearchFormNodeOptions<{
			/** Browser input type used for both bounds. */
			inputType?: 'text' | 'number';
			/** Placeholder shown in the lower-bound input. */
			lowPlaceholder?: SearchFormRangeValue;
			/** Placeholder shown in the upper-bound input. */
			highPlaceholder?: SearchFormRangeValue;
			/** Fixed matching behavior. Use null to let the user choose when `showMode` is enabled. */
			mode?: SearchFormRangeMode | null;
			/** Shows a selector for strict or permissive matching. */
			showMode?: boolean;
		}>,
	): SearchFormFieldNode;
}

/** Returns stable IDs for standard form items. Pass these IDs to `SearchFormGraph` and `SearchFormContainerNode` methods instead of writing IDs by hand. */
export interface SearchFormIds {
	/** Returns the ID of the top-level container. */
	root(): string;
	/** Returns the ID of the Search section. */
	searchSection(): string;
	/** Returns the ID of the Search section heading. */
	searchSectionHeading(): string;
	/** Returns the ID of the container holding all search modes. */
	searchFormsContainer(): string;
	/** Returns the ID of a search mode form. */
	searchForm(mode: SearchPatternMode): string;
	/** Returns the ID of the Explore section. */
	exploreSection(): string;
	/** Returns the ID of the Explore section heading. */
	exploreSectionHeading(): string;
	/** Returns the ID of the container holding all Explore forms. */
	exploreFormsContainer(): string;
	/** Returns the ID of an Explore form. */
	exploreForm(mode: ExploreFormMode): string;
	/** Returns the ID of the within control. */
	withinField(): string;
	/** Returns the ID of the area containing shared filters and their summary. */
	sharedFiltersRegion(): string;
	/** Returns the ID of the shared filters heading. */
	sharedFiltersHeading(): string;
	/** Returns the ID of the shared filters container. */
	sharedFilters(): string;
	/** Returns the ID of the shared filters summary. */
	sharedFiltersSummary(): string;
	/** Returns the ID of a filter tab. */
	filterTab(group: string | { id: string }): string;
	/** Returns the ID of a metadata filter. */
	metadataFilter(field: string | { id: string }): string;
	/** Returns the ID of an XML attribute filter. */
	withinFilter(element: string | { id: string }, attribute: string | { id: string }): string;
	/** Returns the ID of the annotation tabs container. */
	annotationTabs(): string;
	/** Returns the ID of an annotation tab. */
	annotationTab(group: string | { id: string }): string;
	/** Returns the ID of an annotation field. */
	annotationField(area: string | { id: string }, annotatedField: string | { id: string }, annotation: string | { id: string }): string;
	/** Returns the ID of the query area for a search mode. */
	queryRegion(mode: SearchPatternMode): string;
	/** Returns the ID of the query heading for a search mode. */
	queryHeading(mode: SearchPatternMode): string;
	/** Returns the ID of the query field for a search mode. */
	queryField(mode: SearchPatternMode): string;
	/** Returns the ID of the reusable query field for a parallel corpus search mode. */
	queryFieldTemplate(mode: SearchPatternMode): string;
	/** Returns the ID of the controls for an Explore form. */
	exploreControls(mode: ExploreFormMode): string;
	/** Returns the ID of the source-field selector for a parallel corpus Explore form. */
	exploreParallelSource(mode: Exclude<ExploreFormMode, 'corpora'>): string;
	/** Returns the ID of the Explore corpora result settings. */
	exploreCorporaResultPreset(): string;
	/** Returns the ID of the Explore corpora grouping field. */
	exploreCorporaGroupBy(): string;
	/** Returns the ID of the Explore corpora display-mode field. */
	exploreCorporaGroupDisplayMode(): string;
	/** Returns the ID of the n-gram grouping field. */
	exploreNgramGroupBy(): string;
	/** Returns the ID of the n-gram token fields. */
	exploreNgramTokens(): string;
	/** Returns the ID of the frequency annotation field. */
	exploreFrequencyAnnotation(): string;
	/** Identifies whether a form ID belongs to Search or Explore. */
	formKind(formId: string): SearchFormSection | null;
}

/** An XML element offered by the within control. `value` contains the indexed element name. */
export type SearchFormWithinElement = SearchFormOption;

/** A chosen control and, when needed, its selectable values. */
export type SearchFormResolvedWithinControl =
	| 'text'
	| 'range'
	| {
			/** Creates a dropdown control. */
			type: 'select';
			/** Attribute values shown by the dropdown. */
			options: SearchFormOption[];
	  };

/** Settings for a filter that searches an attribute of an XML element. */
export type SearchFormSpanFilter = {
	/** XML element name, such as `speech`. */
	elementName: string;
	/** Attribute name on the XML element, such as `speaker`. */
	attributeName: string;
	/** Input shown for the attribute. `auto` uses a dropdown when BlackLab provides all values, and a text field otherwise. */
	control?: 'auto' | 'text' | 'range' | 'select';
	/** Metadata group or custom filter tab in which the filter is shown. */
	groupId?: string;
	/** ID of the filter before which this filter is inserted. */
	insertBefore?: string;
	/** Label used when no translation is available. */
	defaultDisplayName?: string;
	/** Help text used when no translation is available. */
	defaultDescription?: string;
	/** Choices shown by a `select` control. By default, known values from BlackLab are used. */
	options?: SearchFormOption[];
};

/** Controls whether Advanced search is available and which annotations its query builder uses. */
export type SearchFormAdvancedConfiguration = {
	/** Shows or hides the Advanced search tab. */
	enabled?: boolean;
	/** Annotations available in the Advanced query builder's annotation selector. */
	annotationIds?: readonly string[];
	/** Annotation selected initially in the Advanced query builder. An unavailable value falls back to the first available annotation. */
	defaultAnnotationId?: string;
};

/** Controls whether users can limit searches to XML elements and filter on their attributes. */
export type SearchFormWithinConfiguration = {
	/** Shows or hides the within control in Extended, Advanced, and Expert search. */
	enabled?: boolean;
	/** XML elements offered by the within control, with their labels and tooltips. Indexed elements are used when this is omitted or empty. */
	elements?: readonly SearchFormWithinElement[];
	/** Chooses which indexed XML elements may be offered by the within control. Elements are included by default. */
	includeElement?: (elementName: string) => boolean;
	/** Chooses which attributes may be selected for an XML element in the within control. Attributes are excluded by default. */
	includeAttribute?: (elementName: string, attributeName: string) => boolean;
};

/** Controls the alignment relation users can choose when searching a parallel corpus. */
export type SearchFormAlignByConfiguration = {
	/** Shows or hides the alignment selector in parallel search forms. */
	enabled?: boolean;
	/** Alignment relation types offered to the user, such as word or sentence alignment. Corpus relation types are used by default. */
	elements?: readonly SearchFormOption[];
	/** Alignment relation type selected for a new search. An unavailable value falls back to the first available relation type. */
	defaultValue?: string;
};

/** Controls the annotation and metadata selectors in the Corpora, N-gram, and Frequency Explore forms. */
export type SearchFormExploreConfiguration = {
	/** Annotations offered by each token selector in the N-gram form. */
	searchAnnotationIds?: readonly string[];
	/** Annotation selected initially by the token selectors in the N-gram form. Null or an unavailable value uses the first available annotation. */
	defaultSearchAnnotationId?: string | null;
	/** Annotations offered by the N-gram type and Frequency list type selectors. Each annotation must have a forward index. */
	groupAnnotationIds?: readonly string[];
	/** Annotation selected initially by the N-gram type and Frequency list type selectors. Null or an unavailable value uses the first available annotation. */
	defaultGroupAnnotationId?: string | null;
	/** Shows the annotation group beside choices in the N-gram type and Frequency list type selectors. */
	annotationGroupLabelsVisible?: boolean;
	/** Changes the metadata selector in the Corpora Explore form. */
	corpora?: {
		/** Metadata fields offered by the Group documents by metadata selector. */
		groupMetadataIds?: readonly string[];
		/** Metadata field selected initially by the Group documents by metadata selector. Null or an unavailable value uses the first available field. */
		defaultGroupMetadataId?: string | null;
		/** Shows the metadata group beside choices in the Group documents by metadata selector. */
		metadataGroupLabelsVisible?: boolean;
	};
};

/** Configures the standard search form before its items are created. */
export interface SearchFormConfigurationApi {
	/** Read-only information about the corpus being configured. */
	readonly corpus: Corpus;
	/** Chooses the annotation used by simple search. */
	setSimpleAnnotation(annotationId: string): void;
	/** Chooses the annotations shown in extended search. */
	setExtendedAnnotations(annotationIds: readonly string[]): void;
	/** Chooses the control used for an annotation everywhere or in one annotated field. */
	setAnnotationControl(annotationId: string, control: SearchFormAnnotationControl, annotatedFieldId?: string): void;
	/** Changes the Advanced tab's visibility, available annotations, or initial annotation. */
	configureAdvanced(configuration: SearchFormAdvancedConfiguration): void;
	/** Chooses the metadata fields shown as search filters. */
	setMetadataFilters(metadataFieldIds: readonly string[]): void;
	/** Chooses which metadata fields are available in search and Explore forms. */
	filterMetadataFields(include: (field: SearchFormMetadataField) => boolean): void;
	/** Changes the within control's visibility and available XML elements and attributes. */
	configureWithin(configuration: SearchFormWithinConfiguration): void;
	/** Changes the available alignment relation types and initial selection for parallel corpora. */
	configureAlignBy(configuration: SearchFormAlignByConfiguration): void;
	/** Changes annotation and metadata choices and their initial selections in Explore. */
	configureExplore(configuration: SearchFormExploreConfiguration): void;
	/** Chooses the lexicon service database used by lexicon controls. */
	configureLexicon(configuration: {
		/** Lexicon service database name, such as `lexiconservice_mnw_wnt`. */
		database: string;
	}): void;
	/** Adds or replaces an XML attribute filter and returns the ID used to find it with `SearchFormGraph` after the form is created. */
	addSpanFilter(filter: SearchFormSpanFilter): string;
}

/** Translation helpers for labels and descriptions shown in the search form. */
export interface SearchFormTranslate {
	/** Translates a frontend message key. */
	$t(key: string, values?: Record<string, unknown>): string;
	/** Returns the translated display name of an annotation. */
	$tAnnotDisplayName(annotation: SearchFormAnnotation): string;
	/** Returns the translated description of an annotation. */
	$tAnnotDescription(annotation: SearchFormAnnotation): string;
	/** Returns the translated display name of a metadata field. */
	$tMetaDisplayName(field: SearchFormMetadataField | SearchFormMetadataDescriptor): string;
	/** Returns the translated description of a metadata field, when available. */
	$tMetaDescription(field: SearchFormMetadataField | SearchFormMetadataDescriptor): string | undefined;
}

/** Controls the heading, layout, CSS class, and query behavior of a new container. */
export type SearchFormContainerNodeOptions = {
	/** CSS class added to the rendered container. */
	class?: string;
	/** How queries from child fields are joined. */
	combine?: SearchFormCombineMode;
	/** Heading or tab label shown for the container. */
	title?: SearchFormText;
	/** Visual layout used to display the container and its children. */
	variant?: SearchFormContainerPresentation | SearchFormContainerPresentation[];
};

/** How child queries are joined: all (`and`), any (`or`), or adjacent pattern fields in order (`sequence`). */
/** @materialize */
export type SearchFormCombineMode = QueryCombineMode;

/**
 * Changes the completed search form. Use `ids` to identify standard items, `graph` to find or replace them,
 * and the constructor methods together with container methods to add fields.
 */
export interface SearchFormCustomizationApi extends SearchFormNodeConstructors {
	/** Read-only information about the current corpus. */
	readonly corpus: Corpus;
	/** Access to all current form items. */
	readonly graph: SearchFormGraph;
	/** Stable IDs for items in the standard form. */
	readonly ids: SearchFormIds;
	/** Creates an empty container. Add it to another container to show it in the form. */
	newContainer(id: string, options?: SearchFormContainerNodeOptions): SearchFormContainerNode;
	/** Creates an empty form. Add it to the container identified by `ids.searchFormsContainer()` or `ids.exploreFormsContainer()` to show it. */
	newForm(id: string, options?: Omit<SearchFormContainerNodeOptions, 'combine'>): SearchFormContainerNode;
	/** Translation helpers for form labels and descriptions. */
	readonly translate: SearchFormTranslate;
}

/** Runs before form items are created to change built-in fields, choices, and defaults. */
export type SearchFormConfigurationCallback = (form: SearchFormConfigurationApi) => void;

/** Runs after built-in form items are created to add, remove, replace, or move them. */
export type SearchFormCustomizationCallback = (form: SearchFormCustomizationApi) => void;

/** A search form configuration function, or separate configuration and customization functions. */
export type SearchFormCustomization =
	| SearchFormConfigurationCallback
	| {
			/** Runs before the standard form items are created. */
			configure?: SearchFormConfigurationCallback;
			/** Runs after the standard form items are created. */
			customize?: SearchFormCustomizationCallback;
	  };

/** Highlight behavior: never (`none`), always (`static`), or only while the user points at the hit (`hover`). */
export type SearchResultHighlightStyle = 'none' | 'static' | 'hover';

type SearchResultHighlightSectionBase = {
	/** Capture name, with a list index when the capture contains several matches. */
	readonly key: string;
	/** Capture or relation label shown in the results. */
	readonly display: string;
	/** First source token included in the section. */
	readonly sourceStart: number;
	/** First source token after the section. */
	readonly sourceEnd: number;
	/** First target token included in a relation. Equal to `sourceStart` for a capture. */
	readonly targetStart: number;
	/** First target token after a relation. Equal to `sourceEnd` for a capture. */
	readonly targetEnd: number;
	/** Annotated field containing the relation target in a parallel corpus. */
	readonly targetField?: string;
};

/** A captured or related section that can be highlighted in a hit. */
export type SearchResultHighlightSection =
	| (SearchResultHighlightSectionBase & { readonly kind: 'capture' })
	| (SearchResultHighlightSectionBase & {
			readonly kind: 'relation';
			/** Complete BlackLab relation type. */
			readonly relationType: string;
			/** Relation class, such as the class used for parallel alignments. */
			readonly relationClass: string;
	  });

/** Match information returned by BlackLab for a hit. */
/** @materialize */
export type SearchResultMatchInfo = DeepReadonly<BLMatchInfo>;

/** Match information describing a token span. */
export type SearchResultMatchInfoSpan = Extract<SearchResultMatchInfo, { readonly type: 'span' }>;

/** Match information describing an XML element. */
export type SearchResultMatchInfoTag = Extract<SearchResultMatchInfo, { readonly type: 'tag' }>;

/** Match information describing a relation. */
export type SearchResultMatchInfoRelation = Extract<SearchResultMatchInfo, { readonly type: 'relation' }>;

/** A collection of match information items. */
export type SearchResultMatchInfoList = Extract<SearchResultMatchInfo, { readonly type: 'list' }>;

/** Tokens before, inside, or after a hit. */
/** @materialize */
export type SearchResultSnippetPart = DeepReadonly<BLHitSnippetPart>;

/** One hit returned by BlackLab, including its surrounding context. */
/** @materialize */
export type SearchResultHit = DeepReadonly<BLHitInContext>;

/** Metadata and result information for one document. */
/** @materialize */
export type SearchResultDocument = DeepReadonly<Omit<BLDoc, 'docInfo'> & BLDocInfo>;

/** Basic information about the annotated field containing a hit. */
export type SearchResultAnnotatedField = {
	/** Annotated field ID used by BlackLab. */
	readonly id: string;
	/** Localized field name shown to the user. */
	readonly displayName: string;
	/** Shared prefix of a parallel corpus field ID. */
	readonly prefix?: string;
	/** Version name of a parallel corpus field. */
	readonly version?: string;
};

/** Counts and progress information for search results. */
/** @materialize */
export type SearchResultStats = DeepReadonly<BLSearchResultsStatsV5>;

/** BlackLab's summary of a search request and its results. */
/** @materialize */
export type SearchResultSummary = DeepReadonly<BLSearchSummaryV5>;

type SearchResultOverviewBase = {
	readonly kind: 'hits' | 'hit-groups';
	/** Whether the results come from a parallel corpus. */
	readonly isParallelCorpus: boolean;
	/** Progress and count reported for processed results. */
	readonly processed: SearchResultStats;
	/** Progress and count reported for fully counted results. */
	readonly counted: SearchResultStats;
	/** BlackLab's complete search summary. */
	readonly summary: SearchResultSummary;
};

/** One group of hits returned by BlackLab. */
/** @materialize */
export type SearchResultHitGroup = DeepReadonly<BLHitGroup>;

/** Search summary plus the hits, documents, or hit groups loaded on the current result page. */
export type SearchResultOverview =
	| (SearchResultOverviewBase & {
			readonly kind: 'hits';
			/** Hits currently loaded on the result page. */
			readonly hits: readonly SearchResultHit[];
			/** Documents for the loaded hits, indexed by document PID. */
			readonly documents: Readonly<Record<string, SearchResultDocument>>;
	  })
	| (SearchResultOverviewBase & {
			readonly kind: 'hit-groups';
			/** Hit groups currently loaded on the result page. */
			readonly groups: readonly SearchResultHitGroup[];
	  });

/** Identifies an attribute of an XML element. */
export type SearchResultSpanAttribute = {
	/** XML element name. */
	readonly elementName: string;
	/** Attribute name on the XML element. */
	readonly attributeName: string;
};

/** The hit, document, field, and matched XML elements passed to `hitInfoColumn.content`. */
export type SearchResultHitInfoContext = {
	/** Read-only information about the current corpus. */
	readonly corpus: Corpus;
	/** Hit for which content is being requested. */
	readonly hit: SearchResultHit;
	/** XML elements matched by the hit, including captured elements. */
	readonly spans: readonly SearchResultMatchInfoTag[];
	/** Annotated field containing the hit. */
	readonly field: SearchResultAnnotatedField;
	/** Document containing the hit. */
	readonly document: SearchResultDocument;
};

/** The query, searched fields, and summary passed to `exportDescription`. */
export type SearchResultExportContext = {
	/** Read-only information about the current corpus. */
	readonly corpus: Corpus;
	/** Annotated field searched by the main query. */
	readonly sourceField: SearchResultAnnotatedField;
	/** Parallel corpus fields searched alongside the source field. */
	readonly targetFields: readonly SearchResultAnnotatedField[];
	/** Final BCQL query, when the search has a pattern. */
	readonly bcql?: string;
	/** BlackLab's complete search summary. */
	readonly summary: SearchResultSummary;
};

/** Optional changes to search requests and result displays. */
export type SearchResultsCustomization = {
	/** Chooses whether BlackLab should return all matching XML elements. Return null to use the default. */
	withSpans?: boolean | ((query: string) => boolean | null);
	/** Chooses whether a metadata field appears in result menus. Return null to use the default. */
	includeMetadataField?: (field: SearchFormMetadataField) => boolean | null;
	/** Chooses how a captured or related section is highlighted. Return null to use the default. */
	highlightStyle?: (section: SearchResultHighlightSection) => SearchResultHighlightStyle | null;
	/** Adds a column before each hit. */
	hitInfoColumn?: {
		/** Chooses when the column is visible. It is visible by default when configured. */
		visible?: boolean | ((overview: SearchResultOverview) => boolean);
		/** Returns the HTML shown for a hit, or null for no content. */
		content: (context: SearchResultHitInfoContext) => string | null;
	};
	/** Returns a description included with exported results, or null for no description. */
	exportDescription?: (context: SearchResultExportContext) => string | null;
	/** Chooses whether an XML attribute is included in exports. Return null to use the default. */
	includeExportSpanAttribute?: (attribute: SearchResultSpanAttribute) => boolean | null;
	/** Changes the choices shown in the sort menu. Return null to keep them unchanged. */
	customizeSorting?: (group: SearchFormOptionGroup) => SearchFormOptionGroup | null;
	/** Chooses whether an XML attribute is available for grouping. Return null to use the default. */
	includeGroupingSpanAttribute?: (attribute: SearchResultSpanAttribute) => boolean | null;
	/** Changes the choices shown in the group menu. Return null to keep them unchanged. */
	customizeGrouping?: (group: SearchFormOptionGroup, translate: SearchFormTranslate) => SearchFormOptionGroup | null;
};

/** Functions available through the global `frontend` object. */
export interface BlackLabFrontendCustomizationApi {
	/** Register a form customization. Returns a function that removes it. */
	customizeSearchForm(customization: SearchFormCustomization): () => void;
	/** Register request/result customizations for the corpus that loaded the script. */
	customizeSearchResults(customization: SearchResultsCustomization): () => void;
	/** @deprecated Use the typed form and result customization APIs instead. */
	customize(callback: (legacyCustomizationApi: any) => void): void;
}

declare global {
	/** Customization functions exposed to corpus scripts. */
	var frontend: BlackLabFrontendCustomizationApi;
	interface Window {
		/** Customization functions exposed to corpus scripts. */
		frontend: BlackLabFrontendCustomizationApi;
	}
}
