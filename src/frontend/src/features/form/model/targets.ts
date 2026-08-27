import { compileCql, compileFilter } from '@/features/form/model/compile/query-artifact';
import type { FormParams, SearchParams } from '@/features/form/model/types/blacklab-params';
import type { FormEmission, FormIssue, FormOutputName } from '@/features/form/model/types/form-output';

export type ViewName = 'hits' | 'docs';
export type BlackLabEndpointName = 'hits' | 'docs' | 'hits-grouped' | 'docs-grouped' | 'collocations';

export type FormTarget<Accepted extends readonly FormOutputName[], Params extends FormParams = FormParams> = {
	readonly acceptedOutputs: Accepted;
	readonly targetView?: ViewName;
	readonly supportedEndpoints: readonly BlackLabEndpointName[];
	compile(emissions: readonly FormEmission<Accepted[number]>[], issues: FormIssue[]): Params;
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

function conflict(issues: FormIssue[], output: SearchOutputName): void {
	issues.push({
		stage: 'target',
		code: 'conflicting-output',
		output,
		message: `Ignoring repeated non-empty output '${output}'.`,
	});
}

export function createSearchTarget(options: SearchTargetOptions = {}): FormTarget<typeof SEARCH_OUTPUTS, SearchParams> {
	const requiredOutputs = new Set(options.requiredOutputs ?? []);
	const defaultSearchfield = options.defaultSearchfield?.trim() || undefined;
	return {
		acceptedOutputs: SEARCH_OUTPUTS,
		targetView: options.targetView,
		supportedEndpoints: options.supportedEndpoints ?? ['hits', 'docs', 'hits-grouped', 'docs-grouped'],
		compile(emissions, issues) {
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
						if (withspans !== undefined) conflict(issues, 'withspans');
						else withspans = true;
						break;
				}
			}

			searchfield ??= defaultSearchfield;
			const present = new Set<SearchOutputName>();
			if (patt !== undefined) present.add('patt');
			if (filter !== undefined) present.add('filter');
			if (searchfield !== undefined) present.add('searchfield');
			if (groupSeen) present.add('group');
			if (sortSeen) present.add('sort');
			if (withspans !== undefined) present.add('withspans');
			for (const output of requiredOutputs) {
				if (present.has(output)) continue;
				issues.push({
					stage: 'target',
					code: 'missing-output',
					output,
					message: `Required output '${output}' is missing.`,
				});
			}

			return {
				...(patt !== undefined ? { patt } : {}),
				...(filter !== undefined ? { filter } : {}),
				...(searchfield !== undefined ? { searchfield } : {}),
				...(groupSeen ? { group: group.length ? group.join(',') : null } : {}),
				...(sortSeen ? { sort: sort.length ? sort.join(',') : null } : {}),
				...(withspans !== undefined ? { withspans } : {}),
			};
		},
	};
}

export const searchTarget = createSearchTarget();
export const hitsSearchTarget = createSearchTarget({ targetView: 'hits', supportedEndpoints: ['hits', 'hits-grouped'], requiredOutputs: ['patt'] });
export const docsSearchTarget = createSearchTarget({ targetView: 'docs', supportedEndpoints: ['docs', 'docs-grouped'] });
