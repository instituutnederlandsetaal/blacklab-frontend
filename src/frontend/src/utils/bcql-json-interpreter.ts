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
 * https://blacklab.ivdnt.org/server/rest-api/corpus/parse-pattern/get.html#json-query-structure
 */

import * as api from '@/api';

export type XmlTag = {
	type: 'xml';
	/** xml token name excluding namespace, brackets, attributes etc */
	name: string;
	isClosingTag: boolean;
};

export type Condition = {
	type: 'condition';
	/** A word property(/annotatedField) id, such as lemma, pos, word, etc... */
	name: string;
	/** Comparison type, usually '=' or '!=' */
	operator: '='|'!=';
	/** Regex to compare the attribute to */
	value: string;
};

export type BooleanOp = {
	type: 'booleanOp';
	/** typically 'OR', 'AND', '|', '&' */
	operator: '|'|'&';
	left: BooleanOp|Condition;
	right: BooleanOp|Condition;
};

export type Token = {
	leadingXmlTag?: XmlTag;
	trailingXmlTag?: XmlTag;
	expression?: BooleanOp|Condition;
	optional: boolean;
	repeats?: {
		min: number;
		/** When null, maximum repetitions is unbounded */
		max: number|null;
	};
};

/** The result of interpreting a BCQL query */
export type Result = {
	/** The (partial) BCQL query (only set for source and target queries, for expert/advanced) */
	query?: string;
	/** Tokens parsed from the query; undefined means "could not parse for simple/extended/advanced" */
	tokens?: Token[];
	/** Any within clauses on this query. Usually in the form of {[]} */
	withinClauses?: Record<string, Record<string, string|{ low: string; high: string }>>;
	/** The span returned by the Advanced builder's `<tag/> containing ...` query. */
	containing?: string;
	/** Target version for this query, or undefined if this is the source query */
	targetVersion?: string;
	/** Relation type for this (target) query, or undefined if this is the source query */
	relationType?: string;
	/** Whether alignment relation target is optional */
	optional?: boolean;
};

// TODO proper typing of the JSON structure for parsed queries.
// For now - some ad-hoc types to get linting working.
type BLTextPatternValue = {
	type: 'string'|'number'|'boolean';
	value: string|number|boolean;
}|{
	type: 'int-range';
	min: number;
	max: number;
}


function interpretBcqlJson(bcql: string, json: any, defaultAnnotation: string): Result[] {

	function _not(clause: any): Condition {
		const condition = clause.type === 'compare' ? _compare(clause)
			: clause.type === 'regex' ? _regex(clause.annotation, clause.value)
			: null;
		if (!condition) {
			throw new Error('Can only interpret not on a regex or comparison');
		}
		return {
			...condition,
			operator: condition.operator === '=' ? '!=' : '=',
		};
	}

	// BL4 will return [word="de"] as a single regex node
	function _regex(annotation: string | undefined, value: string): Condition {
		return {
			type: 'condition',
			name: annotation || defaultAnnotation,
			operator: '=',
			value
		};
	}
	// BL5 will return [word="de"] as a compare node with symbol and string clauses
	function _compare({ clauses, operation, sensitivity }: any): Condition {
		if (operation !== '=' && operation !== '!=')
			throw new Error('Cannot interpret compare operation: ' + operation);

		const [compareWhat, compareWith] = clauses;

		if (compareWhat.type !== 'defval' && compareWhat.type !== 'symbol')
			throw new Error('Cannot interpret compare left clause of type: ' + compareWhat.type);
		if (compareWith.type !== 'string')
			throw new Error('Cannot interpret compare right clause of type: ' + compareWith.type);
		if (sensitivity != null && sensitivity !== 's' && sensitivity !== 'i')
			throw new Error('Cannot interpret compare sensitivity: ' + sensitivity);
		return {
			name: compareWhat.type === 'defval' ? defaultAnnotation : compareWhat.value,
			operator: operation,
			value: sensitivity === 's' ? '(?-i)' + compareWith.value : compareWith.value,
			type: 'condition',
		};
	}

	function _boolean(type: string, clauses: any[]): BooleanOp|null {
		if (clauses.length === 2) {
			const left = _tokenExpression(clauses[0]);
			const right = _tokenExpression(clauses[1]);
			if (left === null || right === null)
				return null;
			return {
				type: 'booleanOp',
				operator: type === 'and' ? '&' : '|',
				left,
				right
			};
		}

		// More than 2 clauses, create a recursive structure
		const left = _tokenExpression(clauses[0]);
		const right = _boolean(type, clauses.slice(1));
		if (left === null || right === null)
			return null;
		return {
			type: 'booleanOp',
			operator: type === 'and' ? '&' : '|',
			left,
			right
		};
	}

	function _tokenExpression(input: any): BooleanOp|Condition|null {
		switch (input.type) {
		case 'regex':
			return _regex(input.annotation, input.value);
		case 'compare':
			return _compare(input);
		case 'not':
			return _not(input.clause);
		case 'and':
		case 'or':
			return _boolean(input.type, input.clauses);
		}
		//throw new Error('Unknown token expression type: ' + input.type);
		return null; // indicates an error occurred, but we can keep going (for e.g. withinClauses)
	}

	function _sequence(clauses: any[]): Token[]|null {
		const tokens1 = clauses.map(_token);
		if (tokens1.indexOf(null) >= 0)
			return null;
		const tokens: Token[] = tokens1 as Token[];

		// <s> and </s> are still separate "tokens"; join them with the appropriate real token
		for (let i = 0; i < tokens.length - 1; i++) {
			if (tokens[i].leadingXmlTag && !tokens[i].leadingXmlTag?.isClosingTag && tokens[i].repeats?.min === -1) {
				// <s> token followed by a regular [word="..."] token; join with next token
				tokens[i] = {
					...tokens[i + 1],
					leadingXmlTag: tokens[i].leadingXmlTag,
				}
				tokens.splice(i + 1, 1);
				i--;
				continue;
			} else if (tokens[i + 1].leadingXmlTag && tokens[i + 1].leadingXmlTag?.isClosingTag && tokens[i + 1].repeats?.min === -1) {
				// Regular [word="..."] token followed by a </s> token; join with previous token
				tokens[i].trailingXmlTag = tokens[i + 1].leadingXmlTag;
				tokens.splice(i + 1, 1);
				i--;
				continue;
			}
		}

		return tokens;
	}



	function interpretTagsAttributes(attributes: Record<string, BLTextPatternValue>): Record<string, string|{ low: string; high: string }> {
		const r: Record<string, string|{ low: string; high: string }> = {};
		if (!attributes)
			return r;
		for (const [k, v] of Object.entries(attributes)) {
			if (v.type === 'int-range') {
				r[k] = { low: v.min == 0 ? '' : v.min.toString(), high: v.max == 9999 ? '' : v.max.toString() };
			} else if (v.type === 'string' || v.type === 'number' || v.type === 'boolean') {
				r[k] = v.value.toString();
			} else {
				r[k] = v as any;
			}
		}
		return r;
	}

	function _withinTags(input: any): NonNullable<Result['withinClauses']> {
		if (input.type === 'tags')
			return { [input.name]: interpretTagsAttributes(input.attributes) };
		if (input.type === 'overlapping' && input.operation === 'overlap')
			return Object.assign({}, ...input.clauses.map(_withinTags));
		throw new Error('Unsupported within clause type: ' + input.type);
	}

	function _posFilter(input: any): Result {
		const { producer, operation, filter, invert } = input;
		if (invert)
			throw new Error('Cannot interpret inverted posfilter');
		if (operation === 'containing' && producer.type === 'tags' && !producer.attributes && !producer.capture && !producer.adjust) {
			const query = _query(filter);
			if (query.tokens && !query.containing && !query.withinClauses)
				return { ...query, containing: producer.name, query: input.bcqlFragment };
		}
		if (operation !== 'within')
			throw new Error('Unknown posfilter operation: ' + operation);
		const query = _query(producer);
		query.withinClauses = { ...query.withinClauses, ..._withinTags(filter) };
		return query;
	}

	function _repeat(input: any): Token|null {
		const token = _token(input.clause);
		if (token === null)
			return null;
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

	function _token(input: any): Token|null {
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
			const expression = _tokenExpression(input);
			if (expression === null) {
				return null;
			}
			return {
				expression,
				optional: false,
			};
		}
	}

	function _query(input: any): Result {
		switch (input.type) {
		case 'sequence':
			return {
				query: input.bcqlFragment,
				tokens: _sequence(input.clauses) ?? undefined,
			};

		case 'posfilter':
			return _posFilter(input);

		case 'tags':
		case 'overlapping':
			// Standalone span selection, with no token query.
			return {
				query: input.bcqlFragment,
				withinClauses: _withinTags(input),
			};

		default:
			// Must be a single token
			const token = _token(input);
			return {
				query: input.bcqlFragment,
				tokens: token === null ? undefined : [token],
			}
		}
	}

	function _relTarget(input: any): Result {
		if (input.type !== 'reltarget')
			throw new Error('Unknown reltarget type: ' + input.type);
		const clause = input.clause;
		return {
			..._query(clause),
			targetVersion: input.targetVersion,
			relationType: input.relType,
			optional: input.optional,
		};
	}

	function _parallelQuery(bcql: string, input: any): Result[] {
		if (input.type == 'relmatch') {
			const isParallel = input.children.every((c: any) => !!c.targetVersion);
			if (!isParallel)
				throw new Error('Cannot interpret non-parallel relmatch queries in the frontend');
			// Determine what relationtype we're filtering by
			// (must all be the same for the query to be interpretable here)
			let relationType: string|undefined = undefined;
			input.children.forEach((c: any) => {
				if (c.type !== 'reltarget')
					throw new Error('Unknown relmatch child type: ' + c.type);
				if (relationType === undefined)
					relationType = c.relType;
				if (relationType !== c.relType)
					throw new Error('Mismatch in relation types: ' + relationType + ' / ' + c.relType);
			});

			const parent = {
				..._query(input.parent)
			};
			const children: Result[] = input.children.map(_relTarget).map( (r: Result, index: number) => ({
				...r,
				relationType
			}));
			return [parent, ...children];
		}

		return [ { ..._query(input) } ];
	}

	/** Strip the automatically added rspan(..., 'all') call.
	 *  (added for relations queries using adjusthits=yes so hits cover all matched relations)
	 */
	function stripRspanAll(input: any): any {
		if (input.type === 'callfunc') {
			if (input.name === 'rspan' && input.args.length === 2 && input.args[1] === 'all') {
				return input.args[0];
			}
		}
		return input;
	}

	return _parallelQuery(bcql, stripRspanAll(json));
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
