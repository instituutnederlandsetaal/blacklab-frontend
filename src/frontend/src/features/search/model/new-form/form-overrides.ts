import type { FormOverrides } from '@/features/form';
import { type CompiledFormResult, type FormOutputName, type FormParams } from '@/features/form';
import type { BLCollocationType } from '@/types/blacklabtypes';

export type SearchFormOverrides = Partial<{
	patt: string;
	collpatt: string;
	filter: string;
	searchfield: string;
	withspans: true;
	colltype: BLCollocationType;
	within: string;
	reltype: string;
	annotation: string;
	sensitive: boolean;
	scorertype: string;
}>;

function firstNonEmpty(query: Record<string, unknown>, ...keys: string[]): string | null {
	for (const key of keys) {
		const rawValue = query[key];
		const values = Array.isArray(rawValue) ? rawValue.filter((item): item is string => typeof item === 'string') : typeof rawValue === 'string' ? [rawValue] : [];
		const value = values.find(item => item !== '');
		if (value) return value;
	}
	return null;
}

export function extractSearchFormOverrides(query: Record<string, unknown>, parallelCorpus: boolean): SearchFormOverrides {
	const patt = firstNonEmpty(query, 'patt', 'query');
	const collpatt = firstNonEmpty(query, 'collpatt');
	const filter = firstNonEmpty(query, 'filter');
	const searchfield = parallelCorpus ? firstNonEmpty(query, 'searchfield', 'searchField', 'field') : null;
	const withspans = firstNonEmpty(query, 'withspans');
	const rawColltype = firstNonEmpty(query, 'colltype');
	const colltype = rawColltype === 'proximity' || rawColltype === 'relsources' || rawColltype === 'reltargets' ? rawColltype : null;
	const within = firstNonEmpty(query, 'within');
	const reltype = firstNonEmpty(query, 'reltype');
	const annotation = firstNonEmpty(query, 'annotation');
	const rawSensitive = firstNonEmpty(query, 'sensitive');
	const sensitive = rawSensitive === 'true' ? true : rawSensitive === 'false' ? false : undefined;
	const scorertype = firstNonEmpty(query, 'scorertype');
	return {
		...(patt ? { patt } : {}),
		...(collpatt ? { collpatt } : {}),
		...(filter ? { filter } : {}),
		...(searchfield ? { searchfield } : {}),
		...(withspans === 'true' ? { withspans: true as const } : {}),
		...(colltype ? { colltype } : {}),
		...(within ? { within } : {}),
		...(reltype ? { reltype } : {}),
		...(annotation ? { annotation } : {}),
		...(sensitive !== undefined ? { sensitive } : {}),
		...(scorertype ? { scorertype } : {}),
	};
}

function isSearchFormOverride(parameter: string, value: unknown): boolean {
	switch (parameter) {
		case 'patt':
		case 'collpatt':
		case 'filter':
		case 'searchfield':
		case 'within':
		case 'reltype':
		case 'annotation':
		case 'scorertype':
			return typeof value === 'string' && value !== '';
		case 'withspans':
			return value === true;
		case 'colltype':
			return value === 'proximity' || value === 'relsources' || value === 'reltargets';
		case 'sensitive':
			return typeof value === 'boolean';
		default:
			return false;
	}
}

export function applySearchFormOverrides(result: CompiledFormResult, overrides: Readonly<FormOverrides>, acceptedOutputs: readonly FormOutputName[]): CompiledFormResult {
	const accepted = new Set<string>(acceptedOutputs);
	const applicable = Object.fromEntries(Object.entries(overrides).filter(([parameter, value]) => accepted.has(parameter) && isSearchFormOverride(parameter, value)));
	if (!Object.keys(applicable).length) return result;
	return { ...result, params: { ...result.params, ...applicable } as FormParams };
}
