import type { ViewName } from '../targets';
import type { FormParams } from './blacklab-params';
import type { FormIssue, ResultPreset, SummaryEntry } from './form-output';

export type ScopedFormQuery = Record<string, string | string[]>;

export type CompiledFormResult<Params extends FormParams = FormParams> = {
	formId: string;
	params: Params;
	summaries: SummaryEntry[];
	encoded: ScopedFormQuery;
	issues: FormIssue[];
	targetView?: ViewName;
	resultPreset?: ResultPreset;
};

export type CompiledFormSummary<Params extends FormParams = FormParams> = Pick<CompiledFormResult<Params>, 'params' | 'summaries'>;
