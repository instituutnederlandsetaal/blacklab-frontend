import { NormalizedAnnotation, OptGroup, Option } from '@/types/apptypes';
import { Condition, BooleanOp, type Result as CqlParseResult  } from '@/utils/bcql-json-interpreter';

// Updated types for the Vue implementation of CQL Query Builder

export type CqlAnnotationValueComparator = '=' | '!=' | 'startsWith' | 'endsWith';
export type CqlAnnotationCombinator = '&' | '|';

export interface CqlTokenProperties {
	optional: boolean;
	minRepeats: number;
	maxRepeats: number;
	beginOfSentence: boolean;
	endOfSentence: boolean;
}

export interface CqlAttributeData {
	id: string;
	annotationId: string;
	comparator: CqlAnnotationValueComparator;
	values: string[];
	caseSensitive: boolean;
	uploadedValue?: string;
}

// Union type for mixed array entries
export type CqlGroupEntry = CqlAttributeData | CqlAttributeGroupData;

export interface CqlAttributeGroupData {
	id: string;
	operator: CqlAnnotationCombinator;
	entries: CqlGroupEntry[];
}

// Helper functions to distinguish between entry types
export function isCqlAttributeData(entry: CqlGroupEntry): entry is CqlAttributeData {
	return 'annotationId' in entry;
}

export function isCqlAttributeGroupData(entry: CqlGroupEntry): entry is CqlAttributeGroupData {
	return 'entries' in entry;
}

export interface CqlTokenData {
	id: string;
	properties: CqlTokenProperties;
	rootAttributeGroup: CqlAttributeGroupData;
}

export interface CqlQueryBuilderData {
	tokens: CqlTokenData[];
	within: string;
	withinAttributes: Record<string, string>;
}

export const COMPARATORS: CqlAnnotationValueComparator[][]= [
	['=', '!='],
	['startsWith', 'endsWith']
];

export const OPERATORS: CqlAnnotationCombinator[] = ['&','|'];

// Options type for CQL Query Builder - contains all precomputed store data
export interface CqlQueryBuilderOptions {
	// Store-derived values (language-agnostic)
	defaultAnnotationId: string;
	// searchAnnotationIds: string[];
	textDirection: 'ltr' | 'rtl';
	allAnnotationsMap: Record<string, NormalizedAnnotation>;

	// Precomputed options (language-agnostic)
	annotationOptions: (Option|OptGroup)[];

	// Default configurations (always the same)
	operatorOptions: Option[];
	comparatorOptions: OptGroup[];
}

function rootCql(data: CqlQueryBuilderData): string | null {
	if (data.tokens.length === 0) return null;

	const tokenCqlParts: string[] = [];
	data.tokens.map(tokenCql).forEach(cql => cql && tokenCqlParts.push(cql));
	if (tokenCqlParts.length === 0) return null;
	let result = tokenCqlParts.join(' ');
	if (data.within) {
		result = `<${data.within}/> containing ${result}`;
	}
	return result;
}

function tokenCql(token: CqlTokenData): string {
	const parts: string[] = [];

	if (token.properties.beginOfSentence) {
		parts.push('<s>');
	}

	parts.push('[');
	parts.push(groupCql(token.rootAttributeGroup));
	parts.push(']');

	// Handle repeats
	const { minRepeats, maxRepeats, optional } = token.properties;
	if (!isNaN(minRepeats) || !isNaN(maxRepeats)) {
		if (minRepeats === maxRepeats) {
			if (minRepeats !== 1) {
				parts.push(`{${minRepeats}}`);
			}
		} else {
			const min = isNaN(minRepeats) ? '' : minRepeats.toString();
			const max = isNaN(maxRepeats) ? '' : maxRepeats.toString();
			parts.push(`{${min},${max}}`);
		}
	}

	if (optional && minRepeats !== 0) {
		parts.push('?');
	}

	if (token.properties.endOfSentence) {
		parts.push('</s>');
	}

	return parts.join('');
}

function groupCql(group: CqlAttributeGroupData): string {
	const parts: string[] = [];

	// Process all entries (both attributes and nested groups)
	for (const entry of group.entries) {
		if (isCqlAttributeData(entry)) {
			// Handle attribute entry
			const attrCql = attributeCql(entry);
			if (attrCql) {
				parts.push(attrCql);
			}
		} else if (isCqlAttributeGroupData(entry)) {
			// Handle nested group entry
			const groupCqlStr = groupCql(entry);
			if (groupCqlStr) {
				parts.push(`(${groupCqlStr})`);
			}
		}
	}

	return parts.join(` ${group.operator} `);
}

function attributeCql({ values, caseSensitive, comparator, annotationId }: CqlAttributeData): string | null {
	switch (comparator) {
		case 'startsWith':
			return annotationId + ' = "' + (caseSensitive ? '(?-i)' : '') + values.join('|') + '.*"';
		case 'endsWith':
			return annotationId + ' = "' + (caseSensitive ? '(?-i)' : '') + '.*' + values.join('|') + '"';
		default:
			return annotationId + ' ' + comparator + ' "' + (caseSensitive ? '(?-i)' : '') + values.join('|') + '"';
	}
}

export const CqlGenerator = {
	rootCql,
	tokenCql,
	groupCql,
	attributeCql
};




export function getQueryBuilderStateFromParsedQuery(queries: CqlParseResult[]): {
	query: CqlQueryBuilderData,
	targetQueries: CqlQueryBuilderData[],
} {
	// Find source query (no targetVersion) and target queries (with targetVersion)
	const sourceQuery = queries.find(q => !q.targetVersion);
	const targetQueries = queries.filter(q => !!q.targetVersion);

	const parseQuery = (parsedQuery: CqlParseResult): CqlQueryBuilderData => {
		let nextId = 0;
		const generateId = () => `generated_${nextId++}`;

		const tokens = parsedQuery.tokens || [];
		const withinClauses = parsedQuery.withinClauses || {};

		// Extract within element and attributes
		const withinElements = Object.keys(withinClauses);
		const within = withinElements.length > 0 ? withinElements[0] : '';
		const withinAttributes: Record<string, string> = within ? withinClauses[within] || {} : {};

		const parsedTokens = tokens.map(token => {
			const tokenData: CqlTokenData = {
				id: generateId(),
				properties: {
					optional: token.optional || false,
					minRepeats: token.repeats?.min ?? 1,
					maxRepeats: token.repeats?.max ?? 1,
					beginOfSentence: !!token.leadingXmlTag && token.leadingXmlTag.name === 's',
					endOfSentence: !!token.trailingXmlTag && token.trailingXmlTag.name === 's'
				},
				rootAttributeGroup: {
					id: generateId(),
					operator: '&', // default operator
					entries: []
				}
			};

			// Parse the token expression into the root attribute group
			if (token.expression) {
				parseExpression(token.expression, tokenData.rootAttributeGroup, generateId);
			}

			return tokenData;
		});

		return {
			tokens: parsedTokens,
			within,
			withinAttributes
		};
	};

	// Parse expression tree into CQL entries
	const parseExpression = (
		expression: BooleanOp|Condition,
		targetGroup: CqlAttributeGroupData,
		generateId: () => string
	): void => {
		if (!expression) return;

		if (expression.type === 'booleanOp') {
			// Set the group operator based on the binary operation
			targetGroup.operator = expression.operator;

			// Parse left and right operands
			const leftEntries: CqlGroupEntry[] = [];
			const rightEntries: CqlGroupEntry[] = [];

			// Create temporary groups to collect entries
			const leftGroup: CqlAttributeGroupData = {
				id: generateId(),
				operator: expression.operator,
				entries: leftEntries
			};
			const rightGroup: CqlAttributeGroupData = {
				id: generateId(),
				operator: expression.operator,
				entries: rightEntries
			};

			parseExpression(expression.left, leftGroup, generateId);
			parseExpression(expression.right, rightGroup, generateId);

			// Add entries to target group
			// If the child group has the same operator and only contains attributes, flatten it
			if (leftGroup.entries.length === 1 && leftGroup.operator === targetGroup.operator) {
				targetGroup.entries.push(...leftGroup.entries);
			} else if (leftGroup.entries.length > 0) {
				targetGroup.entries.push(leftGroup);
			}

			if (rightGroup.entries.length === 1 && rightGroup.operator === targetGroup.operator) {
				targetGroup.entries.push(...rightGroup.entries);
			} else if (rightGroup.entries.length > 0) {
				targetGroup.entries.push(rightGroup);
			}
		} else if (expression.type === 'condition') {
			// Parse attribute value for case sensitivity and special operators
			let value = expression.value;
			let caseSensitive = false;
			let operator = expression.operator;

			// Check for case sensitivity flags
			if (value.indexOf('(?-i)') === 0) {
				caseSensitive = true;
				value = value.substr(5);
			} else if (value.indexOf('(?c)') === 0) {
				caseSensitive = true;
				value = value.substr(4);
			}

			// decode starts-with / ends-with from value regex
			let comparator: CqlAnnotationValueComparator = '=';
			if (operator === '=' && value.startsWith('.*')) { comparator = 'endsWith'; }
			else if (operator === '=' && value.endsWith('.*')) { comparator = 'startsWith'; }
			else { comparator = operator as CqlAnnotationValueComparator; }

			// Split values on pipe character for multi-value attributes
			const values = value.split('|');

			const attributeData: CqlAttributeData = {
				id: generateId(),
				annotationId: expression.name,
				comparator,
				values,
				caseSensitive
			};

			targetGroup.entries.push(attributeData);
		}
	};

	// Parse source query or create empty state
	const query = sourceQuery ? parseQuery(sourceQuery) : {
		tokens: [],
		within: '',
		withinAttributes: {}
	};

	// Parse target queries
	const parsedTargetQueries = targetQueries.map(parseQuery);

	return {
		query,
		targetQueries: parsedTargetQueries
	};
}