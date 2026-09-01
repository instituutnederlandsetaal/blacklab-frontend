import { compileCql, compileFilter } from '@/features/form/model/compile/query-artifact';
import type { CollocationParams, FormOverrides, FormParams, SearchParams } from '@/features/form/model/types/blacklab-params';
import { isCollocationContext, parseCollocationContext, type CollocationContext, type FormEmission, type FormIssue, type FormOutputName } from '@/features/form/model/types/form-output';

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

function restoredString(value: string, output: FormOutputName, issues: FormIssue[]): string | undefined {
	const normalized = value.trim() || undefined;
	if (!normalized) issues.push({ severity: 'warning', message: `Restored override '${output}' is empty after normalization; ignoring it.` });
	return normalized;
}

export function createSearchTarget(options: SearchTargetOptions = {}): FormTarget<typeof SEARCH_OUTPUTS, SearchParams> {
	const requiredOutputs = new Set(options.requiredOutputs ?? []);
	const defaultSearchfield = options.defaultSearchfield?.trim() || undefined;
	return {
		acceptedOutputs: SEARCH_OUTPUTS,
		targetView: options.targetView,
		supportedEndpoints: options.supportedEndpoints ?? ['hits', 'docs', 'hits-grouped', 'docs-grouped'],
		compile(emissions, issues, overrides) {
			let patt: string | undefined;
			let filter: string | undefined;
			let searchfield: string | undefined;
			let withspans: true | undefined;
			let groupSeen = false;
			let sortSeen = false;
			const group: string[] = [];
			const sort: string[] = [];

			for (const emission of emissions) {
				switch (emission.name) {
					case 'patt': {
						const value = compileCql(emission.value);
						if (!value) break;
						if (patt !== undefined) conflict(issues, 'patt');
						else patt = value;
						break;
					}
					case 'filter': {
						const value = compileFilter(emission.value);
						if (!value) break;
						if (filter !== undefined) conflict(issues, 'filter');
						else filter = value;
						break;
					}
					case 'searchfield': {
						const value = emission.value.trim();
						if (!value) break;
						if (searchfield !== undefined) conflict(issues, 'searchfield');
						else searchfield = value;
						break;
					}
					case 'group':
						groupSeen = true;
						group.push(...(emission.value?.map(item => item.trim()).filter(Boolean) ?? []));
						break;
					case 'sort':
						sortSeen = true;
						sort.push(...(emission.value?.map(item => item.trim()).filter(Boolean) ?? []));
						break;
					case 'withspans':
						withspans = true;
						break;
				}
			}

			if (overrides?.patt !== undefined) patt = restoredString(overrides.patt, 'patt', issues);
			if (overrides?.filter !== undefined) filter = restoredString(overrides.filter, 'filter', issues);
			if (overrides?.searchfield !== undefined) searchfield = restoredString(overrides.searchfield, 'searchfield', issues);
			if (overrides?.withspans !== undefined) withspans = overrides.withspans;
			searchfield ??= defaultSearchfield;
			const params: SearchParams = {
				...(patt !== undefined ? { patt } : {}),
				...(filter !== undefined ? { filter } : {}),
				...(searchfield !== undefined ? { searchfield } : {}),
				...(groupSeen ? { group: group.length ? group.join(',') : null } : {}),
				...(sortSeen ? { sort: sort.length ? sort.join(',') : null } : {}),
				...(withspans !== undefined ? { withspans } : {}),
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

export const COLLOCATION_OUTPUTS = ['patt', 'collpatt', 'filter', 'searchfield', 'colltype', 'context', 'within', 'reltype', 'annotation', 'sensitive', 'scorertype', 'sort'] as const;

export function createCollocationTarget(defaultAnnotation: string): FormTarget<typeof COLLOCATION_OUTPUTS, CollocationParams> {
	const fallbackAnnotation = defaultAnnotation.trim();
	return {
		acceptedOutputs: COLLOCATION_OUTPUTS,
		targetView: 'hits',
		supportedEndpoints: ['collocations'],
		compile(emissions, issues, overrides) {
			let patt: string | undefined;
			let collpatt: string | undefined;
			let filter: string | undefined;
			let searchfield: string | undefined;
			let colltype: CollocationParams['colltype'] | undefined;
			let context: CollocationContext | undefined;
			let within: string | undefined;
			let reltype: string | undefined;
			let annotation: string | undefined;
			let sensitive: boolean | undefined;
			let scorertype: CollocationParams['scorertype'] | undefined;
			let sortSeen = false;
			const sort: string[] = [];

			for (const emission of emissions) {
				switch (emission.name) {
					case 'patt': {
						const value = compileCql(emission.value);
						if (!value) break;
						if (patt !== undefined) conflict(issues, 'patt');
						else patt = value;
						break;
					}
					case 'collpatt': {
						const value = compileCql(emission.value);
						if (!value) break;
						if (collpatt !== undefined) conflict(issues, 'collpatt');
						else collpatt = value;
						break;
					}
					case 'filter': {
						const value = compileFilter(emission.value);
						if (!value) break;
						if (filter !== undefined) conflict(issues, 'filter');
						else filter = value;
						break;
					}
					case 'searchfield': {
						const value = emission.value.trim();
						if (!value) break;
						if (searchfield !== undefined) conflict(issues, 'searchfield');
						else searchfield = value;
						break;
					}
					case 'colltype':
						if (colltype !== undefined) conflict(issues, 'colltype');
						else colltype = emission.value;
						break;
					case 'context':
						if (context !== undefined) conflict(issues, 'context');
						else context = emission.value;
						break;
					case 'within': {
						const value = emission.value.trim();
						if (!value) break;
						if (within !== undefined) conflict(issues, 'within');
						else within = value;
						break;
					}
					case 'reltype': {
						const value = emission.value.trim();
						if (!value) break;
						if (reltype !== undefined) conflict(issues, 'reltype');
						else reltype = value;
						break;
					}
					case 'annotation': {
						const value = emission.value.trim();
						if (!value) break;
						if (annotation !== undefined) conflict(issues, 'annotation');
						else annotation = value;
						break;
					}
					case 'sensitive':
						if (sensitive !== undefined) conflict(issues, 'sensitive');
						else sensitive = emission.value;
						break;
					case 'scorertype': {
						const value = emission.value.trim();
						if (!value) break;
						if (scorertype !== undefined) conflict(issues, 'scorertype');
						else scorertype = value;
						break;
					}
					case 'sort':
						sortSeen = true;
						sort.push(...(emission.value?.map(item => item.trim()).filter(Boolean) ?? []));
						break;
				}
			}

			let invalidContextOverride = false;
			if (overrides?.patt !== undefined) patt = restoredString(overrides.patt, 'patt', issues);
			if (overrides?.collpatt !== undefined) collpatt = restoredString(overrides.collpatt, 'collpatt', issues);
			if (overrides?.filter !== undefined) filter = restoredString(overrides.filter, 'filter', issues);
			if (overrides?.searchfield !== undefined) searchfield = restoredString(overrides.searchfield, 'searchfield', issues);
			if (overrides?.colltype !== undefined) colltype = overrides.colltype;
			if (overrides?.context !== undefined) {
				const value = typeof overrides.context === 'number' ? (isCollocationContext(overrides.context) ? overrides.context : null) : parseCollocationContext(overrides.context);
				if (value === null) {
					context = undefined;
					invalidContextOverride = true;
					issues.push({ severity: 'error', message: `Restored override 'context' must be a safe non-negative integer or before:after pair.` });
				} else context = value;
			}
			if (overrides?.within !== undefined) within = restoredString(overrides.within, 'within', issues);
			if (overrides?.reltype !== undefined) reltype = restoredString(overrides.reltype, 'reltype', issues);
			if (overrides?.annotation !== undefined) annotation = restoredString(overrides.annotation, 'annotation', issues);
			if (overrides?.sensitive !== undefined) sensitive = overrides.sensitive;
			if (overrides?.scorertype !== undefined) scorertype = restoredString(overrides.scorertype, 'scorertype', issues);

			colltype ??= 'proximity';
			annotation ??= fallbackAnnotation;
			sensitive ??= false;
			scorertype ??= 'coll-dice';
			if (colltype === 'proximity' && !invalidContextOverride) context ??= 5;

			if (!patt) issues.push({ severity: 'error', message: "Required output 'patt' is missing." });
			if (colltype === 'proximity') {
				if (reltype) {
					issues.push({ severity: 'error', message: "Output 'reltype' is not valid for proximity collocations; ignoring it." });
					reltype = undefined;
				}
				if (invalidContextOverride) patt = undefined;
			} else {
				issues.push({ severity: 'error', message: `Collocation type '${colltype}' is not supported yet.` });
				if (context !== undefined) issues.push({ severity: 'error', message: "Output 'context' is not valid for relation collocations; ignoring it." });
				if (within) issues.push({ severity: 'error', message: "Output 'within' is not valid for relation collocations; ignoring it." });
				context = undefined;
				within = undefined;
				patt = undefined;
			}

			const params: CollocationParams = { colltype, annotation, sensitive, scorertype };
			if (patt !== undefined) params.patt = patt;
			if (collpatt !== undefined) params.collpatt = collpatt;
			if (filter !== undefined) params.filter = filter;
			if (searchfield !== undefined) params.searchfield = searchfield;
			if (context !== undefined) params.context = typeof context === 'number' ? context : `${context[0]}:${context[1]}`;
			if (within !== undefined) params.within = within;
			if (reltype !== undefined) params.reltype = reltype;
			if (sortSeen) params.sort = sort.length ? sort.join(',') : null;
			return params;
		},
	};
}
