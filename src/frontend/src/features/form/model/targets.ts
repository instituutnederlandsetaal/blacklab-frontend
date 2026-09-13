import { compileCql, compileFilter } from '@/features/form/model/compile/query-artifact';
import { COLLOCATION_STRING_PARAMS, SEARCH_STRING_PARAMS, type CollocationParams, type FormOverrides, type FormParams, type SearchParams } from '@/features/form/model/types/blacklab-params';
import type { FormEmission, FormIssue, FormOutputName } from '@/features/form/model/types/form-output';

export type ViewName = 'hits' | 'docs';
type BlackLabEndpointName = 'hits' | 'docs' | 'hits-grouped' | 'docs-grouped' | 'collocations';

export type FormTarget<Accepted extends readonly FormOutputName[], Params extends FormParams = FormParams> = {
	readonly acceptedOutputs: Accepted;
	readonly targetView?: ViewName;
	readonly supportedEndpoints: readonly BlackLabEndpointName[];
	compile(emissions: readonly FormEmission<Accepted[number]>[], issues: FormIssue[], overrides?: Readonly<FormOverrides>): Params;
};

export type AnyFormTarget = FormTarget<readonly FormOutputName[], FormParams>;

export const SEARCH_OUTPUTS = ['patt', 'filter', 'searchfield', 'group', 'sort', 'withspans'] as const;
export type SearchOutputName = (typeof SEARCH_OUTPUTS)[number];

export type SearchTargetOptions = {
	targetView?: ViewName;
	supportedEndpoints?: readonly Exclude<BlackLabEndpointName, 'collocations'>[];
	requiredOutputs?: readonly SearchOutputName[];
	defaultSearchfield?: string;
};

function retainFirst<T>(current: T | undefined, candidate: T | null | undefined, output: FormOutputName, issues: FormIssue[]): T | undefined {
	if (candidate == null) return current;
	if (current === undefined) return candidate;
	issues.push({ severity: 'warning', message: `Ignoring repeated non-empty output '${output}'.` });
	return current;
}

function applyStringOverrides(draft: FormOverrides, overrides: Readonly<FormOverrides>, keys: readonly (typeof COLLOCATION_STRING_PARAMS)[number][], issues: FormIssue[]): void {
	for (const key of keys) {
		const value = overrides[key];
		if (value === undefined) continue;
		draft[key] = value.trim() || undefined;
		if (!draft[key]) issues.push({ severity: 'warning', message: `Restored override '${key}' is empty after normalization; ignoring it.` });
	}
}

function compileEmissions(emissions: readonly FormEmission[], issues: FormIssue[]): FormOverrides & Pick<SearchParams, 'group' | 'sort'> {
	const draft: FormOverrides & Pick<SearchParams, 'group' | 'sort'> = {};
	for (const emission of emissions) {
		switch (emission.name) {
			case 'patt':
			case 'collpatt':
				draft[emission.name] = retainFirst(draft[emission.name], compileCql(emission.value), emission.name, issues);
				break;
			case 'filter':
				draft.filter = retainFirst(draft.filter, compileFilter(emission.value), 'filter', issues);
				break;
			case 'searchfield':
			case 'within':
			case 'reltype':
			case 'annotation':
				draft[emission.name] = retainFirst(draft[emission.name], emission.value.trim() || undefined, emission.name, issues);
				break;
			case 'colltype':
				draft.colltype = retainFirst(draft.colltype, emission.value, 'colltype', issues);
				break;
			case 'context': {
				const context = emission.value;
				draft.context = retainFirst(draft.context, typeof context === 'number' ? context : context.join(':'), 'context', issues);
				break;
			}
			case 'sensitive':
				draft.sensitive = retainFirst(draft.sensitive, emission.value, 'sensitive', issues);
				break;
			case 'group':
			case 'sort':
				draft[emission.name] = [draft[emission.name], ...(emission.value?.map(item => item.trim()) ?? [])].filter(Boolean).join(',') || null;
				break;
			case 'withspans':
				draft.withspans = true;
				break;
		}
	}
	return draft;
}

export function createSearchTarget(options: SearchTargetOptions = {}): FormTarget<typeof SEARCH_OUTPUTS, SearchParams> {
	const requiredOutputs = new Set(options.requiredOutputs ?? []);
	const defaultSearchfield = options.defaultSearchfield?.trim() || undefined;
	return {
		acceptedOutputs: SEARCH_OUTPUTS,
		targetView: options.targetView,
		supportedEndpoints: options.supportedEndpoints ?? ['hits', 'docs', 'hits-grouped', 'docs-grouped'],
		compile(emissions, issues, overrides = {}) {
			const draft = compileEmissions(emissions, issues);

			applyStringOverrides(draft, overrides, SEARCH_STRING_PARAMS, issues);
			draft.withspans = overrides.withspans ?? draft.withspans;
			draft.searchfield ??= defaultSearchfield;
			const params: SearchParams = {
				...(draft.group !== undefined ? { group: draft.group } : {}),
				...(draft.sort !== undefined ? { sort: draft.sort } : {}),
				...(draft.withspans !== undefined ? { withspans: draft.withspans } : {}),
			};
			for (const key of SEARCH_STRING_PARAMS) {
				if (draft[key] !== undefined) params[key] = draft[key];
			}
			for (const output of requiredOutputs) {
				if (output in params) continue;
				issues.push({
					severity: 'error',
					message: `Required output '${output}' is missing.`,
				});
			}
			return params;
		},
	};
}

export const searchTarget = createSearchTarget();
export const hitsSearchTarget = createSearchTarget({ targetView: 'hits', supportedEndpoints: ['hits', 'hits-grouped'], requiredOutputs: ['patt'] });
export const docsSearchTarget = createSearchTarget({ targetView: 'docs', supportedEndpoints: ['docs', 'docs-grouped'] });

export const COLLOCATION_OUTPUTS = ['patt', 'collpatt', 'filter', 'searchfield', 'colltype', 'context', 'within', 'reltype', 'annotation', 'sensitive', 'sort'] as const;

export function createCollocationTarget(defaultAnnotation: string): FormTarget<typeof COLLOCATION_OUTPUTS, CollocationParams> {
	const fallbackAnnotation = defaultAnnotation.trim();
	return {
		acceptedOutputs: COLLOCATION_OUTPUTS,
		targetView: 'hits',
		supportedEndpoints: ['collocations'],
		compile(emissions, issues, overrides = {}) {
			const draft = compileEmissions(emissions, issues);

			applyStringOverrides(draft, overrides, COLLOCATION_STRING_PARAMS, issues);
			if (overrides.context !== undefined) draft.context = overrides.context;
			if (draft.context === null) issues.push({ severity: 'error', message: `Restored override 'context' must be a safe non-negative integer or before:after pair.` });

			draft.colltype = overrides.colltype ?? draft.colltype ?? 'proximity';
			draft.annotation ??= fallbackAnnotation;
			draft.sensitive = overrides.sensitive ?? draft.sensitive ?? false;
			if (draft.colltype === 'proximity' && draft.context === undefined) draft.context = 5;

			if (!draft.patt) issues.push({ severity: 'error', message: "Required output 'patt' is missing." });
			if (draft.colltype === 'proximity') {
				if (draft.reltype) {
					issues.push({ severity: 'error', message: "Output 'reltype' is not valid for proximity collocations; ignoring it." });
					draft.reltype = undefined;
				}
				if (draft.context === null) draft.patt = undefined;
			} else {
				issues.push({ severity: 'error', message: `Collocation type '${draft.colltype}' is not supported yet.` });
				if (draft.context != null) issues.push({ severity: 'error', message: "Output 'context' is not valid for relation collocations; ignoring it." });
				if (draft.within) issues.push({ severity: 'error', message: "Output 'within' is not valid for relation collocations; ignoring it." });
				draft.context = undefined;
				draft.within = undefined;
				draft.patt = undefined;
			}

			const params: CollocationParams = { colltype: draft.colltype, annotation: draft.annotation, sensitive: draft.sensitive, scorertype: 'coll-dice' };
			for (const key of COLLOCATION_STRING_PARAMS) {
				if (draft[key] !== undefined) params[key] = draft[key];
			}
			if (draft.context != null) params.context = draft.context;
			if (draft.sort !== undefined) params.sort = draft.sort;
			return params;
		},
	};
}
