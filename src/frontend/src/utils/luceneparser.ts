import luceneQueryParser from 'lucene-query-parser';

import type { FilterValue } from '@/types/apptypes';
import { debugLog } from '@/utils/debug';

/** Parse the expression into an array of filter fields for easy displaying. Throws error if the query is too complex or contains errors. */
export default (luceneQuery?: string): FilterValue[] => {
	if (!luceneQuery) {
		return [];
	}

	debugLog('parsing filter string', luceneQuery);

	/**
	 * Since the parsed query is a tree-like structure (to allow expression like 'field:("value1" OR ("value3" OR "value4"))' )
	 * We need to recurse to extract all the values.
	 * To simplify keeping track of what part of the query we're parsing, we store the current field here.
	 */
	let context: FilterValue | null = null;
	/** Once we're done with a field, we store it here and clear the context. */
	const parsedValues: FilterValue[] = [];

	/**
	 * Process a Node. A Field object is always contained within a Node (as far as I can tell).
	 * So for a simple query like 'field:value', the library returns a structure like:
	 * ```javascript
	 * { // Node
	 *   field: 'field',
	 *   left: { // Field
	 *     field: '<implicit>', // referring to property 'field' in the enclosing Node structure
	 *     term: 'value'
	 *    }
	 * }
	 * ```
	 * So if the Node contains a 'field' property we know all children will be Field instances defining the values
	 * and we can open a new context that we can store the values in later parsing steps.
	 */
	function node(val: luceneQueryParser.ASTNode | null) {
		if (val == null) {
			return;
		}

		let createdContext = false;
		if (val.field) {
			// if there is no context yet, the field can still be <implicit>, in this case we'd expect that the left node
			// defines the field name, this is the case with range expression, so we will define the context when processing the left node.
			if (context == null && val.field && val.field !== '<implicit>') {
				context = {
					id: val.field,
					values: [],
				};
				createdContext = true;
			} else if (context != null && val.field && val.field !== '<implicit>') {
				// this is weird, and it should probably never happen
				// it would mean we're going to define terms for a field while we're already inside the term list expression for another field
				debugLog('Got a node with a field, but already have context, ignoring.', context);
				return;
			}
		}

		let cur = val.left; // left always present
		if ('left' in cur) {
			node(cur);
		} else if ('term' in cur) {
			field(cur);
		} else if ('term_min' in cur) {
			range(cur);
		}

		/**
		 * We need to know what the right side contains if we're to handle it.
		 * - If have a context, that means both left and right are values for a specific field (or Nodes containg a subtree of multiple values).
		 * The current Node is the OR/AND token in a query like 'field:("value" OR "value2")'
		 * The interface can only handle OR'ing all values for a field, so check that the query doesn't specify AND,
		 * and if it does then skip processing the right side of the tree.
		 * - If we _don't_ have a context, then left and right define the Fields themselves
		 * The current Node is then the OR/AND token in a query like 'field1:value1 AND field2:value2'
		 * In thise case, the interface can only handle AND'ing all the different fields, so check that too.
		 */
		if (
			val.right &&
			((context == null && !(val.operator === 'OR' || val.operator === '<implicit>')) || // implicit operator between field means OR
				(context != null && !(val.operator === 'AND')))
		) {
			cur = val.right;
			if ('left' in cur) {
				node(cur);
			} else if ('term' in cur) {
				field(cur);
			} else if ('term_min' in cur) {
				range(cur);
			}
		}

		if (createdContext) {
			if (context == null) {
				debugLog("We started a context but didn't end with one, some other function pushed it, that shouldn't happen...");
			} else {
				parsedValues.push(context);
				context = null;
			}
		}
		// else we're already inside inside an existing context and are just recursing over the values
	}

	function field(val: luceneQueryParser.ASTField | null) {
		if (val == null) {
			return;
		}

		let createdContext = false;
		if (context == null) {
			if (val.field === '<implicit>') {
				// default field name, query only specifies a value but no field, such as the query 'value', interface can't display this
				return;
			}

			context = {
				id: val.field,
				values: [],
			};
			createdContext = true;
		} else if (context != null && val.field && val.field !== '<implicit>') {
			debugLog('Got field', field, ' with an explicit name, but we already have a context?');
			return;
		} // else have context and field is implicit, just add the term value to the list

		context.values.push(val.term);
		if (createdContext) {
			parsedValues.push(context);
			context = null;
		}
	}

	function range(val: luceneQueryParser.ASTRange) {
		if (val == null) {
			return;
		}

		if (context != null) {
			// mixed terms and ranges for the same field, can't handle.
			debugLog('Entered a range expression, but context is not null, might happen? cannot handle in interface');
			return;
		}
		if (val.field === '<implicit>') {
			// default value, basically parsing "[from TO to]" without the name of field to which to apply the range, interface can't handle this
			return;
		}

		// Ignore in/exclusivity
		parsedValues.push({
			id: val.field,
			values: [val.term_min, val.term_max],
		});
	}

	const results = luceneQueryParser.parse(luceneQuery);
	node(results);
	return parsedValues;
};
