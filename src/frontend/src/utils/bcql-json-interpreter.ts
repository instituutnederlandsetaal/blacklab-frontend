/** BCQL JSON INTERPRETER:
 *
 * Takes the JSON tree structure returned by BlackLab's /parse-pattern endpoint and
 * interprets it for use in the frontend.
 *
 * This means we don't have to implement a full parser for the BCQL language in the
 * frontend as well, but just rely on BlackLab's parser.
 *
 * Obviously, that means the JSON tree structure returned by BlackLab's parser must
 * be stable. The documentation can be found here:
 * https://inl.github.io/BlackLab/server/rest-api/corpus/parse-pattern/get.html#json-query-structure
 */

import * as api from '@/api';

export const DEFAULT_ANNOTATION = '__default__';

export type XmlTag = {
	type: 'xml';
	/** xml token name excluding namespace, brackets, attributes etc */
	name: string;
	isClosingTag: boolean;
};

export type Attribute = {
	type: 'attribute';
	/** A word property(/annotatedField) id, such as lemma, pos, word, etc... */
	name: string;
	/** Comparison type, usually '=' or '!=' */
	operator: '='|'!=';
	/** Regex to compare the attribute to */
	value: string;
};

export type BinaryOp = {
	type: 'binaryOp';
	/** typically 'OR', 'AND', '|', '&' */
	operator: string;
	left: BinaryOp|Attribute;
	right: BinaryOp|Attribute;
};

export type Token = {
	leadingXmlTag?: XmlTag;
	trailingXmlTag?: XmlTag;
	expression?: BinaryOp|Attribute;
	optional: boolean;
	repeats?: {
		min: number;
		/** When null, maximum repetitions is unbounded */
		max: number|null;
	};
};

export type Result = {
	query?: string; // the (partial) BCQL query (only set for source and target queries, for expert/advanced)
	tokens?: Token[];
	/** xml token name excluding namespace, brackets, attributes etc */
	within?: string;
	/** any attribute filters on the within xml token */
	withinAttributes?: Record<string, string>;
	targetVersion?: string; // target version for this query, or undefined if this is the source query
	relationType?: string; // relation type for this (target) query, or undefined if this is the source query
	optional?: boolean; // whether alignment relation target is optional
};

function interpretBcqlJson(bcql: string, json: any, defaultAnnotation: string): Result[] {

	function _not(clause: any): Attribute {
		if (clause.type !== 'regex') {
			throw new Error('Can only interpret not on regex');
		}
		return {
			..._regex(clause.annotation, clause.value),
			operator: '!=',
		};
	}

	function _regex(annotation: string, value: string): Attribute {
		return {
			type: 'attribute',
			name: annotation || DEFAULT_ANNOTATION,
			operator: '=',
			value
		};
	}

	function _boolean(type: string, clauses: any[]): BinaryOp {
		if (clauses.length === 2) {
			return {
				type: 'binaryOp',
				operator: type === 'and' ? '&' : '|',
				left: _tokenExpression(clauses[0]),
				right: _tokenExpression(clauses[1])
			};
		}

		// More than 2 clauses, create a recursive structure
		return {
			type: 'binaryOp',
			operator: type === 'and' ? '&' : '|',
			left: _tokenExpression(clauses[0]),
			right: _boolean(type, clauses.slice(1))
		};
	}

	function _tokenExpression(input: any): BinaryOp|Attribute {
		switch (input.type) {
		case 'regex':
			return _regex(input.annotation || defaultAnnotation, input.value);
		case 'not':
			return _not(input.clause);
		case 'and':
		case 'or':
			return _boolean(input.type, input.clauses);
		}
		throw new Error('Unknown token expression type: ' + input.type);
	}

	function _sequence(clauses: any[]): Token[] {
		const tokens = clauses.map(_token);

		// <s> and </s> are still separate "tokens"; join them with the appropriate real token
		for (let i = 0; i < tokens.length - 1; i++) {
			if (tokens[i].leadingXmlTag && !tokens[i].leadingXmlTag?.isClosingTag && tokens[i].repeats?.min || 0 < 0) {
				// <s> token followed by a regular [word="..."] token; join with next token
				tokens[i] = {
					...tokens[i + 1],
					leadingXmlTag: tokens[i].leadingXmlTag,
				}
				tokens.splice(i + 1, 1);
				i--;
				continue;
			} else if (tokens[i + 1].leadingXmlTag && tokens[i + 1].leadingXmlTag?.isClosingTag && tokens[i + 1].repeats?.min || 0 < 0) {
				// Regular [word="..."] token followed by a </s> token; join with previous token
				tokens[i].trailingXmlTag = tokens[i + 1].leadingXmlTag;
				tokens.splice(i + 1, 1);
				i--;
				continue;
			}
		}

		return tokens;
	}

	function _posFilter(producer: any, operation: string, filter: any): Result {
		if (operation !== 'within')
			throw new Error('Unknown posfilter operation: ' + operation);
		if (filter.type !== 'tags')
			throw new Error('Unknown posfilter filter type: ' + filter.type);
		const query = _query(producer);
		query.within = filter.name;
		query.withinAttributes = filter.attributes;
		return query;
	}

	function _repeat(input: any): Token {
		const token = _token(input.clause);
		const min = 'min' in input ? input.min : 1;
		const max = 'max' in input ? input.max : null;
		if (min === 0 && max === 1) {
			token.optional = true;
		} else {
			if (token.repeats)
				throw new Error('Can\'t repeat a repeated token');
			token.repeats = { min, max };
		}
		return token;
	}

	function _tags(input: any): Token {
		if (input.attribute || input.capture)
			throw new Error('Unsupported tags attribute or capture');
		if (input.name !== 's')
			throw new Error('Unsupported tag type: ' + input.name);
		const token: Token = {
			optional: false,
			leadingXmlTag: {
				type: 'xml',
				name: input.name,
				isClosingTag: false,
			},
			repeats: {
				min: -1, // invalid values indicate that we need to join this "token" with the previous or next one
				max: -1,
			},
		};
		switch (input.adjust) {
		case 'leading_edge':
			break;
		case 'trailing_edge':
			token.leadingXmlTag!.isClosingTag = true;
			break;
		default:
			throw new Error('Unsupported tags adjust: ' + input.adjust);
		}
		return token;
	}

	function _token(input: any): Token {
		switch (input.type) {
		case 'anytoken': // [] or []{min,max}
			{
				const min = 'min' in input ? input.min : 1;
				const max = 'max' in input ? input.max : null;
				if (min === 0 && max === 1) {
					return {
						optional: true,
					};
				} else {
					return {
						optional: false,
						repeats: {
							min,
							max,
						},
					};
				}
			}

		case 'defval':   // _, which generally means []*
			return {
				optional: true,
				repeats: {
					min: 0,
					max: null,
				},
			};

		case 'repeat':   // {min,max} or ?, *, +
			return _repeat(input);

		case 'tags':     // <s> or </s>   (and eventually <s/> also)
			return _tags(input);

		default:
			// Excluded any special token-level nodes; must be a token expression
			return {
				expression: _tokenExpression(input),
				optional: false,
			};
		}
	}

	function _query(input: any): Result {
		switch (input.type) {
		case 'sequence':
			return {
				tokens: _sequence(input.clauses),
			};

		case 'posfilter': // (within expression)
			return _posFilter(input.producer, input.operation, input.filter);

		case 'tags':
			// "show me these tags" (not really within, no query given)
			return {
				within: input.name,
				withinAttributes: input.attributes,
			};

		default:
			// Must be a single token
			return {
				tokens: [_token(input)],
			}
		}
	}

	function _relTarget(input: any): Result {
		if (input.type !== 'reltarget')
			throw new Error('Unknown reltarget type: ' + input.type);
		// if (input.relType !== '.*')
		// 	throw new Error('Unsupported reltarget relType: ' + input.relType);

		return {
			..._query(input.clause),
			targetVersion: input.targetVersion,
			relationType: input.relType,
			optional: input.optional,
		};
	}

	function _parallelQuery(bcql: string, input: any): Result[] {
		if (input.type === 'callfunc' && input.name === 'rspan' && input.args.length === 2 &&
			input.args[1] === 'all') {
			// rspan(..., 'all') is added automatically. Ignore here.
			return _parallelQuery(bcql, input.args[0]);
		}

		if (input.type == 'relmatch') {

			// Determine what relationtype we're filtering by
			// (must all be the same for the query to be interpretable here)
			const regex = /\s*=([\w\-]*)=>\w+\??\s*/g;
			let result, relationType: string|undefined = undefined;
			while ((result = regex.exec(bcql)) !== null) {
				const type = result[1] || '';
				if (relationType !== undefined && relationType !== type)
					throw new Error('Mismatch in relation types');
				relationType = type;
			}

			const queries = bcql.split(/;?\s*=[\w\-]*=>\w+\??\s*/); // extract partial queries for advanced/expert view
			const parent = { ..._query(input.parent), query: queries.shift() };
			const children: Result[] = input.children.map(_relTarget).map( (r: Result, index: number) => ({
				...r,
				query: queries.shift(),
				relationType
			}));
			// if (queries.length !== children.length + 1)
			// 	throw new Error('Mismatch in number of queries and children');
			return [parent, ...children];
		}

		return [ { ..._query(input), query: bcql } ];
	}

	const result = _parallelQuery(bcql, json);
	return result;
}

const parsePatternCache: Map<string, Result[]> = new Map();

async function parseBcql(indexId: string, bcql: string, defaultAnnotation: string): Promise<Result[]> {
	const cacheKey = indexId + ':::' + bcql;
	if (parsePatternCache.has(cacheKey))
		return parsePatternCache.get(cacheKey)!;
	const response = await api.blacklab.getParsePattern(indexId, bcql);
	const result = interpretBcqlJson(bcql, response.parsed.json, defaultAnnotation);
	parsePatternCache.set(cacheKey, result);
	return result;
}

export {
	parseBcql
};
