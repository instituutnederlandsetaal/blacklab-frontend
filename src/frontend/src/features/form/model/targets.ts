import { compileCql, compileFilter } from '@/features/form/model/compile/query-artifact';
import type { CollocationParams, FormOverrides, FormParams, SearchParams } from '@/features/form/model/types/blacklab-params';
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

function conflict(issues: FormIssue[], output: FormOutputName): void {
	issues.push({
		severity: 'warning',
		message: `Ignoring repeated non-empty output '${output}'.`,
	});
}

function retainFirst<T>(current: T | undefined, candidate: T | null | undefined, output: FormOutputName, issues: FormIssue[]): T | undefined {
	if (candidate == null) return current;
	if (current === undefined) return candidate;
	conflict(issues, output);
	return current;
}

function nonBlank(value?: string): string | undefined {
	return value?.trim() || undefined;
}

function restoredString(value: string, output: FormOutputName, issues: FormIssue[]): string | undefined {
	const normalized = nonBlank(value);
	if (!normalized) issues.push({ severity: 'warning', message: `Restored override '${output}' is empty after normalization; ignoring it.` });
	return normalized;
}

type StringOverrideName = 'patt' | 'collpatt' | 'filter' | 'searchfield' | 'within' | 'reltype' | 'annotation';

/** Copy one typed override while preserving the correlation between its key and value. */
function copyOverride<Key extends keyof FormOverrides>(draft: FormOverrides, overrides: Readonly<FormOverrides>, key: Key): void {
	draft[key] = overrides[key];
}

function applyStringOverrides(draft: FormOverrides, overrides: Readonly<FormOverrides> | undefined, keys: readonly StringOverrideName[], issues: FormIssue[]): void {
	if (!overrides) return;
	for (const key of keys) {
		const value = overrides[key];
		if (value !== undefined) draft[key] = restoredString(value, key, issues);
	}
}

function applyDefinedOverrides(draft: FormOverrides, overrides: Readonly<FormOverrides> | undefined, keys: readonly (keyof FormOverrides)[]): void {
	if (!overrides) return;
	for (const key of keys) if (overrides[key] !== undefined) copyOverride(draft, overrides, key);
}

export function createSearchTarget(options: SearchTargetOptions = {}): FormTarget<typeof SEARCH_OUTPUTS, SearchParams> {
	const requiredOutputs = new Set(options.requiredOutputs ?? []);
	const defaultSearchfield = options.defaultSearchfield?.trim() || undefined;
	return {
		acceptedOutputs: SEARCH_OUTPUTS,
		targetView: options.targetView,
		supportedEndpoints: options.supportedEndpoints ?? ['hits', 'docs', 'hits-grouped', 'docs-grouped'],
		compile(emissions, issues, overrides) {
			const draft: FormOverrides = {};
			let groupSeen = false;
			let sortSeen = false;
			const group: string[] = [];
			const sort: string[] = [];

			for (const emission of emissions) {
				switch (emission.name) {
					case 'patt':
						draft.patt = retainFirst(draft.patt, compileCql(emission.value), 'patt', issues);
						break;
					case 'filter':
						draft.filter = retainFirst(draft.filter, compileFilter(emission.value), 'filter', issues);
						break;
					case 'searchfield':
						draft.searchfield = retainFirst(draft.searchfield, nonBlank(emission.value), 'searchfield', issues);
						break;
					case 'group':
						groupSeen = true;
						group.push(...(emission.value?.map(item => item.trim()).filter(Boolean) ?? []));
						break;
					case 'sort':
						sortSeen = true;
						sort.push(...(emission.value?.map(item => item.trim()).filter(Boolean) ?? []));
						break;
					case 'withspans':
						draft.withspans = true;
						break;
				}
			}

			applyStringOverrides(draft, overrides, ['patt', 'filter', 'searchfield'], issues);
			applyDefinedOverrides(draft, overrides, ['withspans']);
			draft.searchfield ??= defaultSearchfield;
			const params: SearchParams = {
				...(draft.patt !== undefined ? { patt: draft.patt } : {}),
				...(draft.filter !== undefined ? { filter: draft.filter } : {}),
				...(draft.searchfield !== undefined ? { searchfield: draft.searchfield } : {}),
				...(groupSeen ? { group: group.length ? group.join(',') : null } : {}),
				...(sortSeen ? { sort: sort.length ? sort.join(',') : null } : {}),
				...(draft.withspans !== undefined ? { withspans: draft.withspans } : {}),
			};
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
		compile(emissions, issues, overrides) {
			const draft: FormOverrides = {};
			let sortSeen = false;
			const sort: string[] = [];

			for (const emission of emissions) {
				switch (emission.name) {
					case 'patt':
						draft.patt = retainFirst(draft.patt, compileCql(emission.value), 'patt', issues);
						break;
					case 'collpatt':
						draft.collpatt = retainFirst(draft.collpatt, compileCql(emission.value), 'collpatt', issues);
						break;
					case 'filter':
						draft.filter = retainFirst(draft.filter, compileFilter(emission.value), 'filter', issues);
						break;
					case 'searchfield':
						draft.searchfield = retainFirst(draft.searchfield, nonBlank(emission.value), 'searchfield', issues);
						break;
					case 'colltype':
						draft.colltype = retainFirst(draft.colltype, emission.value, 'colltype', issues);
						break;
					case 'context': {
						const context = emission.value;
						draft.context = retainFirst(draft.context, typeof context === 'number' ? context : `${context[0]}:${context[1]}`, 'context', issues);
						break;
					}
					case 'within':
						draft.within = retainFirst(draft.within, nonBlank(emission.value), 'within', issues);
						break;
					case 'reltype':
						draft.reltype = retainFirst(draft.reltype, nonBlank(emission.value), 'reltype', issues);
						break;
					case 'annotation':
						draft.annotation = retainFirst(draft.annotation, nonBlank(emission.value), 'annotation', issues);
						break;
					case 'sensitive':
						draft.sensitive = retainFirst(draft.sensitive, emission.value, 'sensitive', issues);
						break;
					case 'sort':
						sortSeen = true;
						sort.push(...(emission.value?.map(item => item.trim()).filter(Boolean) ?? []));
						break;
				}
			}

			applyStringOverrides(draft, overrides, ['patt', 'collpatt', 'filter', 'searchfield', 'within', 'reltype', 'annotation'], issues);
			applyDefinedOverrides(draft, overrides, ['colltype', 'context', 'sensitive']);
			if (draft.context === null) issues.push({ severity: 'error', message: `Restored override 'context' must be a safe non-negative integer or before:after pair.` });

			draft.colltype ??= 'proximity';
			draft.annotation ??= fallbackAnnotation;
			draft.sensitive ??= false;
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
			if (draft.patt !== undefined) params.patt = draft.patt;
			if (draft.collpatt !== undefined) params.collpatt = draft.collpatt;
			if (draft.filter !== undefined) params.filter = draft.filter;
			if (draft.searchfield !== undefined) params.searchfield = draft.searchfield;
			if (draft.context != null) params.context = draft.context;
			if (draft.within !== undefined) params.within = draft.within;
			if (draft.reltype !== undefined) params.reltype = draft.reltype;
			if (sortSeen) params.sort = sort.length ? sort.join(',') : null;
			return params;
		},
	};
}
