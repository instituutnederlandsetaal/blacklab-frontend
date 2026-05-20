import type { ResultPreset } from '@/features/form/model/types';
import type { FormState } from '@/features/form/model/types/form-state';

export type QueryTokenClauseNode = {
	type: 'equals' | 'regex';
	annotationId: string;
	value: string;
	caseSensitive?: boolean;
};

export type QueryPatternNode =
	| { type: 'sequence'; children: QueryPatternNode[] }
	| { type: 'token'; clauses: QueryTokenClauseNode[] }
	| { type: 'boolean'; operator: 'and' | 'or'; children: QueryPatternNode[] }
	| { type: 'parallel'; source: QueryPatternNode; targets: QueryParallelTargetNode[] }
	| { type: 'raw'; cql: string };

export type QueryParallelTargetNode = {
	fieldId: string;
	pattern: QueryPatternNode | null;
};

export type QueryFilterNode =
	| { type: 'term'; field: string; values: string[] }
	| { type: 'range'; field: string; low?: string; high?: string }
	| { type: 'boolean'; operator: 'and' | 'or'; children: QueryFilterNode[] }
	| { type: 'raw'; lucene: string };

export type QueryWrapper =
	| {
			type: 'within';
			element: string;
			attributes: Record<string, QueryFilterNode | string>;
	  }
	| {
			type: 'with-spans';
			enabled: boolean;
	  };

export type CompilableQuery = {
	pattern: QueryPatternNode | null;
	filter: QueryFilterNode | null;
	wrappers: QueryWrapper[];
	searchField: string | null;
	summaries: SummaryEntry[];
};

/**
 * A human-readable summary for a field in the form.
 * The ID maps to the field that generated it.
 * The Label is the localized name of the field,
 * the value is the human-readable value of the field.
 * This might need some more fine-tuning because we'd be putting filters, span-filters, and other things in the same collection.
 * That might make the summary UI confusing.
 */
export type SummaryEntry = {
	id: string;
	label: string;
	value: string;
	group?: string;
};

export type CompiledFormState = {
	filter: string | null;
	cql: string | null;
	searchField: string | null;
};
export type PersistableFormState = CompiledFormState & {
	formId: string;
	state: FormState;
	schemaVersion: string;
};
export type SubmittableFormState = CompiledFormState & {
	resultPreset: Partial<ResultPreset>;
	summaries: SummaryEntry[];
};
export type PersistableSubmittableFormState = PersistableFormState & SubmittableFormState;
