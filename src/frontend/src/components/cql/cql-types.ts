import { NormalizedAnnotation } from '@/types/apptypes';

// Updated types for the Vue implementation of CQL Query Builder

export interface CqlComparator {
	value: string;
	label: string;
}

export interface CqlOperator {
	operator: string;
	label: string;
}

export interface CqlAttributeValue {
	/** Unique ID of the annotation */
	id: string;
	/** Raw value */
	value: string;
	/** Should match using case sensitivity */
	caseSensitive: boolean;
}

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
	operator: string;
	values: string[];
	caseSensitive: boolean;
	uploadedValue?: string;
}

// Union type for mixed array entries
export type CqlGroupEntry = CqlAttributeData | CqlAttributeGroupData;

export interface CqlAttributeGroupData {
	id: string;
	operator: string; // '&' for AND, '|' for OR
	entries: CqlGroupEntry[];
}

// Helper functions to distinguish between entry types
export function isCqlAttributeData(entry: CqlGroupEntry): entry is CqlAttributeData {
	return 'annotationId' in entry;
}

export function isCqlAttributeGroupData(entry: CqlGroupEntry): entry is CqlAttributeGroupData {
	return 'entries' in entry;
}

export interface QueryBuilderData {
	tokens: CqlTokenData[];
	within: string;
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

// Default configurations
export const DEFAULT_COMPARATORS: CqlComparator[][] = [
	[
		{ value: '=', label: '=' },
		{ value: '!=', label: '≠' }
	],
	[
		{ value: 'starts with', label: 'starts with' },
		{ value: 'ends with', label: 'ends with' }
	]
];

export const DEFAULT_OPERATORS: CqlOperator[] = [
	{ operator: '&', label: 'AND' },
	{ operator: '|', label: 'OR' }
];


export const DEFAULT_CQL_GENERATOR = (
	annotation: string, 
	comparator: string, 
	caseSensitive: boolean, 
	values: string[]
): string => {
	switch (comparator) {
		case 'starts with':
			return annotation + ' = "' + (caseSensitive ? '(?-i)' : '') + values.join('|') + '.*"';
		case 'ends with':
			return annotation + ' = "' + (caseSensitive ? '(?-i)' : '') + '.*' + values.join('|') + '"';
		default:
			return annotation + ' ' + comparator + ' "' + (caseSensitive ? '(?-i)' : '') + values.join('|') + '"';
	}
};


export const CqlGenerator = {
	rootCql(data: CqlQueryBuilderData): string|null {
		if (data.tokens.length === 0) return null;

		const tokenCqlParts: string[] = [];
		data.tokens.map(this.tokenCql).forEach(cql => cql && tokenCqlParts.push(cql));
		if (tokenCqlParts.length === 0) return null;
		let result = tokenCqlParts.join(' ');
		if (data.within) {
			result = `<${data.within}/> containing ${result}`;
		}
		return result;
	},
	tokenCql(token: CqlTokenData): string {
		const parts: string[] = [];

		if (token.properties.beginOfSentence) {
			parts.push('<s>');
		}

		parts.push('[');
		parts.push(this.groupCql(token.rootAttributeGroup));
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
	},
	groupCql(group: CqlAttributeGroupData): string {
		const parts: string[] = [];

		// Process all entries (both attributes and nested groups)
		for (const entry of group.entries) {
			if (isCqlAttributeData(entry)) {
				// Handle attribute entry
				const attrCql = this.attributeCql(entry);
				if (attrCql) {
					parts.push(attrCql);
				}
			} else if (isCqlAttributeGroupData(entry)) {
				// Handle nested group entry
				const groupCql = this.groupCql(entry);
				if (groupCql) {
					parts.push(`(${groupCql})`);
				}
			}
		}

		return parts.join(` ${group.operator} `);
	},
	attributeCql({values, caseSensitive, operator, annotationId}: CqlAttributeData): string|null {
		switch (operator) {
			case 'starts with':
				return annotationId + ' = "' + (caseSensitive ? '(?-i)' : '') + values.join('|') + '.*"';
			case 'ends with':
				return annotationId + ' = "' + (caseSensitive ? '(?-i)' : '') + '.*' + values.join('|') + '"';
			default:
				return annotationId + ' ' + operator + ' "' + (caseSensitive ? '(?-i)' : '') + values.join('|') + '"';
		}
	}
}