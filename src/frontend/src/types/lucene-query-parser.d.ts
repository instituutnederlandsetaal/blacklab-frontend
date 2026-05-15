declare module 'lucene-query-parser' {
	export type ASTNode = {
		left: ASTNode|ASTField|ASTRange;
		/** Can apparently contain multiple operator (a OR NOT b) though we should never encounter this */
		operator: string;
		right: ASTNode|ASTField|ASTRange;
		/** field name (for field group syntax) not present if top level looks like (field:value OPERATOR field:value) */
		field?: string;
	};

	export type ASTField = {
		field: '<implicit>'|(string&{});
		term: string;
		prefix?: '+'|'-';
		boost?: number;
		/** 0..1 */
		similarity?: number;
		proximity?: number;
	};

	export type ASTRange = {
		field: '<implicit>'|(string&{});
		/** Lower bound */
		term_min: string;
		/** Upper bound */
		term_max: string;
		/** (inclusive_min && inclusive_max) */
		inclusive: boolean;
		/** Is lower bound inclusive */
		inclusive_min: boolean;
		/** Is upper bound inclusive */
		inclusive_max: boolean;
	};

	export function parse(query: string): ASTNode;
}
