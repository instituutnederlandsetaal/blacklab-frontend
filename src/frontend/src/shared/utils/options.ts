export type SimpleOption = string;

/** Generic object to represent an option in a dropdown multiple-choice, checkbox list, etc. */
export type Option<T extends string = string> = {
	value: T;
	label?: string;
	title?: string | null;
	disabled?: boolean;
};
/** Generic object to represent a group of Options in a dropdown multiple-choide, checkbox list, etc. */
export type OptGroup = {
	label?: string;
	title?: string | null;
	disabled?: boolean;
	options: Array<string | Option>;
};
export type Options = Array<SimpleOption | Option | OptGroup>;
export type OptionsList = Array<SimpleOption | Option>;
type IterOptions = Iterable<SimpleOption | Option | OptGroup>;
export function isSimpleOption(e: any): e is SimpleOption {
	return typeof e === 'string';
}
export function isOption(e: any): e is Option {
	return e && isSimpleOption(e.value);
}
export function isOptGroup(e: any): e is OptGroup {
	return e && typeof e.label === 'string' && Array.isArray(e.options);
}

export function* eachOption(options: IterOptions): Generator<Option | SimpleOption, void, never> {
	for (const o of options)
		if (isOptGroup(o)) yield* eachOption(o.options);
		else yield o;
}

export function optionsMap(options: IterOptions): Map<string, Option | SimpleOption> {
	return eachOption(options).reduce((m, o) => m.set(optionValue(o), o), new Map<string, Option | SimpleOption>());
}
export function findOption(options: IterOptions, value: string): Option | SimpleOption | null {
	return eachOption(options).find(option => optionValue(option) === value) ?? null;
}
export function optionValue(option: SimpleOption | Option): string {
	return isSimpleOption(option) ? option : option.value;
}
export function optionLabel(option: SimpleOption | Option): string {
	return isSimpleOption(option) ? option : (option.label ?? option.value);
}
export function optionTitle(option: SimpleOption | Option): string {
	return isSimpleOption(option) ? option : (option.title ?? option.label ?? option.value);
}
export function optionDisabled(option: SimpleOption | Option): boolean {
	return isSimpleOption(option) ? false : !!option.disabled;
}
export function optionValues(options: IterOptions): string[] {
	return Array.from(eachOption(options), optionValue);
}
export function optionLabels(options: IterOptions, values: Iterable<string>): string[] {
	const { matched, unknown } = filterOptions(options, values);
	return Array.from(eachOption([...matched, ...unknown]), optionLabel);
}

/**
 * Keep only the options whose values are in the 'find' set. Optgroups are kept if they contain at least one matching option, returned OptGroups will have non-matching options removed.
 * The returned object contains the matched options, the unmatched options, and the unknown values (values in 'find' that were not found in the options).
 */
export function filterOptions<T extends Option | OptGroup | SimpleOption>(options: Iterable<T>, _find: Iterable<string>): { matched: T[]; unmatched: T[]; unknown: string[] } {
	const find = _find instanceof Set ? _find : new Set(_find);

	const keptOptions: T[] = [];
	const removedOptions: T[] = [];
	const seen = new Set<string>();
	for (const option of options) {
		if (isSimpleOption(option)) {
			if (find.has(option)) {
				keptOptions.push(option);
			} else {
				removedOptions.push(option);
			}
			seen.add(optionValue(option));
		} else if (isOption(option)) {
			if (find.has(option.value)) {
				keptOptions.push(option);
			} else {
				removedOptions.push(option);
			}
			seen.add(optionValue(option));
		} else if (isOptGroup(option)) {
			const { matched: kept, unmatched: removed } = filterOptions(option.options, find);
			if (kept.length > 0) {
				(keptOptions as Options).push({ ...option, options: kept });
			}
			if (removed.length > 0) {
				(removedOptions as Options).push({ ...option, options: removed });
			}
		}
	}
	const unknown = find.difference(seen);
	return { matched: keptOptions, unmatched: removedOptions, unknown: [...unknown.values()] };
}
