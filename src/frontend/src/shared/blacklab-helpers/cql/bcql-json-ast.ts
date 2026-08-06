/**
 * TypeScript definitions for the JSON AST emitted by
 * nl.inl.blacklab.search.textpattern.TextPatternSerializerJson.
 *
 * These types follow the current Java serializer implementation, including
 * Java-side defaults that are omitted from JSON.
 *
 * Where the Java evaluator imposes stronger constraints than the raw
 * deserializer, those constraints are reflected here as well. In other words,
 * this file describes BCQL trees that are intended to evaluate
 * successfully, not every broader shape that Jackson could deserialize before
 * later runtime validation fails.
 */

type NonEmptyArray<T> = [T, ...T[]];

type Pair<T> = [T, T];

type MatchSensitivityCode = 's' | 'i' | 'ci' | 'di';

type RelationDirectionCode = 'root' | 'forward' | 'backward' | 'both';

type RelationSpanModeCode = 'source' | 'target' | 'full' | 'all';

type NonDefaultRelationDirectionCode = Exclude<RelationDirectionCode, 'both'>;

type NonDefaultRelationSpanModeCode = Exclude<RelationSpanModeCode, 'source'>;

type PositionFilterOperation = 'containing' | 'containing_at_start' | 'containing_at_end' | 'within' | 'starts_at' | 'ends_at' | 'matches' | 'has_overlap';

type CompareOperation = '=' | '!=' | '<' | '>' | '<=' | '>=';

type TagsAdjust = 'full_tag' | 'leading_edge' | 'trailing_edge';

type LookWhere = 'ahead' | 'behind';

type OverlappingOperation = 'overlap';

interface BCQLTextPatternBase<TType extends string> {
	bcqlFragment: string;
	type: TType;
}

export interface BCQLAndNode extends BCQLTextPatternBase<'and'> {
	clauses: NonEmptyArray<BCQLQueryNode> | Pair<BCQLConstraintNode>;
}

interface BCQLAnyTokenNode extends BCQLTextPatternBase<'anytoken'> {
	min: number;
	max?: number;
}

interface BCQLCaptureNode extends BCQLTextPatternBase<'capture'> {
	clause: BCQLQueryNode;
	capture: string;
}

export interface BCQLCompareNode extends BCQLTextPatternBase<'compare'> {
	clauses: Pair<BCQLTextPatternNode>;
	operation: CompareOperation;
}

interface BCQLConstrainedNode extends BCQLTextPatternBase<'constrained'> {
	clause: BCQLQueryNode;
	constraint: BCQLConstraintNode;
}

interface BCQLDefaultValueNode extends BCQLTextPatternBase<'defval'> {}

interface BCQLLookNode extends BCQLTextPatternBase<'look'> {
	where: LookWhere;
	negate: boolean;
	clause: BCQLQueryNode;
}

interface BCQLImplicationNode extends BCQLTextPatternBase<'implication'> {
	clauses: Pair<BCQLQueryNode> | Pair<BCQLConstraintNode>;
}

interface BCQLNotNode extends BCQLTextPatternBase<'not'> {
	clause: BCQLTextPatternNode;
}

export interface BCQLOrNode extends BCQLTextPatternBase<'or'> {
	clauses: NonEmptyArray<BCQLQueryNode> | Pair<BCQLConstraintNode>;
}

export interface BCQLPositionFilterNode extends BCQLTextPatternBase<'posfilter'> {
	producer: BCQLQueryNode;
	filter: BCQLQueryNode;
	operation: PositionFilterOperation;
	invert?: true;
	adjustLeading?: number;
	adjustTrailing?: number;
}

interface BCQLOverlappingNode extends BCQLTextPatternBase<'overlapping'> {
	clauses: Pair<BCQLQueryNode>;
	operation: OverlappingOperation;
}

interface BCQLFunctionCallNode extends BCQLTextPatternBase<'callfunc'> {
	name: string;
	args: BCQLTextPatternNode[];
}

export interface BCQLRegexNode extends BCQLTextPatternBase<'regex'> {
	value: string;
	annotation?: string;
	sensitivity?: MatchSensitivityCode;
}

interface BCQLRelationTargetBase extends BCQLTextPatternBase<'reltarget'> {
	relType: string;
	clause: BCQLQueryNode;
	spanMode?: NonDefaultRelationSpanModeCode;
	direction?: NonDefaultRelationDirectionCode;
	capture?: string;
	targetVersion?: string;
}

interface BCQLRegularRelationTargetNode extends BCQLRelationTargetBase {
	negate?: true;
	alignment?: never;
	optional?: never;
}

interface BCQLAlignedRelationTargetNode extends BCQLRelationTargetBase {
	alignment: true;
	negate?: never;
	optional?: true;
	direction?: Exclude<NonDefaultRelationDirectionCode, 'root'>;
}

type BCQLRootRelationTargetNode = BCQLRegularRelationTargetNode & {
	direction: 'root';
};

type BCQLRelationTargetNode = BCQLRegularRelationTargetNode | BCQLAlignedRelationTargetNode;

interface BCQLRootRelationMatchNode extends BCQLTextPatternBase<'relmatch'> {
	parent?: never;
	children: NonEmptyArray<BCQLRootRelationTargetNode>;
}

interface BCQLRegularRelationMatchNode extends BCQLTextPatternBase<'relmatch'> {
	parent: BCQLQueryNode;
	children: NonEmptyArray<BCQLRegularRelationTargetNode>;
}

interface BCQLAlignedRelationMatchNode extends BCQLTextPatternBase<'relmatch'> {
	parent: BCQLQueryNode;
	children: NonEmptyArray<BCQLAlignedRelationTargetNode>;
}

type BCQLRelationMatchNode = BCQLRootRelationMatchNode | BCQLRegularRelationMatchNode | BCQLAlignedRelationMatchNode;

interface BCQLRepeatNode extends BCQLTextPatternBase<'repeat'> {
	clause: BCQLQueryNode;
	min: number;
	max?: number;
}

interface BCQLSequenceNode extends BCQLTextPatternBase<'sequence'> {
	clauses: BCQLQueryNode[];
}

interface BCQLSettingsNode extends BCQLTextPatternBase<'settings'> {
	clause: BCQLQueryNode;
	settings: Record<string, string>;
}

interface BCQLTagsNode extends BCQLTextPatternBase<'tags'> {
	name: string;
	attributes?: Record<string, BCQLTagAttributeExpressionNode>;
	adjust?: Exclude<TagsAdjust, 'full_tag'>;
	capture?: string;
}

interface BCQLTermNode extends BCQLTextPatternBase<'term'> {
	value: string;
	annotation?: string;
	sensitivity?: MatchSensitivityCode;
}

interface BCQLStringValueNode extends BCQLTextPatternBase<'string'> {
	value: string;
}

interface BCQLBooleanValueNode extends BCQLTextPatternBase<'boolean'> {
	value: boolean;
}

interface BCQLIntegerValueNode extends BCQLTextPatternBase<'integer'> {
	value: number;
}

interface BCQLIntRangeValueNode extends BCQLTextPatternBase<'int-range'> {
	min: number;
	max: number;
}

interface BCQLSymbolValueNode extends BCQLTextPatternBase<'symbol'> {
	value: string;
}

interface BCQLUndefinedValueNode extends BCQLTextPatternBase<'undefined'> {}

interface BCQLPropertySelectNode extends BCQLTextPatternBase<'prop-selector'> {
	capture: BCQLSymbolValueNode;
	annotation: BCQLSymbolValueNode;
}

type BCQLValueNode = BCQLStringValueNode | BCQLBooleanValueNode | BCQLIntegerValueNode | BCQLIntRangeValueNode | BCQLSymbolValueNode | BCQLUndefinedValueNode;

export type BCQLTagAttributeExpressionNode = Exclude<BCQLValueNode, BCQLSymbolValueNode> | BCQLFunctionCallNode;

/**
 * Nodes that can appear where Java evaluation calls toMatchFilter().
 */
type BCQLConstraintNode = BCQLAndNode | BCQLCompareNode | BCQLFunctionCallNode | BCQLImplicationNode | BCQLNotNode | BCQLOrNode | BCQLValueNode | BCQLPropertySelectNode;

/**
 * Nodes that can appear where Java evaluation calls toQuery().
 */
export type BCQLQueryNode =
	| BCQLAndNode
	| BCQLAnyTokenNode
	| BCQLCaptureNode
	| BCQLCompareNode
	| BCQLConstrainedNode
	| BCQLDefaultValueNode
	| BCQLFunctionCallNode
	| BCQLImplicationNode
	| BCQLLookNode
	| BCQLNotNode
	| BCQLOrNode
	| BCQLPositionFilterNode
	| BCQLOverlappingNode
	| BCQLRegexNode
	| BCQLRelationMatchNode
	| BCQLRepeatNode
	| BCQLSequenceNode
	| BCQLSettingsNode
	| BCQLTagsNode
	| BCQLTermNode;

export type BCQLTextPatternNode = BCQLQueryNode | BCQLConstraintNode;

export type BCQLTextPatternStruct = BCQLTextPatternNode | BCQLRelationTargetNode;
