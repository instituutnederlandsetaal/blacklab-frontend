export type SimpleOption = string;

/** Generic object to represent an option in a dropdown multiple-choice, checkbox list, etc. */
export type Option = {
	value: string;
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
export function isSimpleOption(e: any): e is SimpleOption {
	return typeof e === 'string';
}
export function isOption(e: any): e is Option {
	return e && isSimpleOption(e.value);
}
export function isOptGroup(e: any): e is OptGroup {
	return e && typeof e.label === 'string' && Array.isArray(e.options);
}
export function findOption(options: Options, value: string): Option | null {
	for (const option of options) {
		if (isSimpleOption(option)) {
			if (option === value) return { value: option };
		} else if (isOption(option)) {
			if (option.value === value) return option;
		} else if (isOptGroup(option)) {
			const found = findOption(option.options, value);
			if (found) return found;
		}
	}
	return null;
}
export function findOptions(options: Options, values: string[]): Option[] {
	const foundOptions: Option[] = [];
	for (const value of values) {
		const found = findOption(options, value);
		if (found) foundOptions.push(found);
	}
	return foundOptions;
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
export function optionValues(options: Options): string[] {
	const values: string[] = [];
	for (const option of options) {
		if (isSimpleOption(option)) {
			values.push(option);
		} else if (isOption(option)) {
			values.push(option.value);
		} else if (isOptGroup(option)) {
			values.push(...optionValues(option.options));
		}
	}
	return values;
}

export function filterOptions(options: Array<SimpleOption | Option>, keep: Set<string>): [Array<SimpleOption | Option>, Array<SimpleOption | Option>];
export function filterOptions(options: Options, keep: Set<string>): [Options, Options];
export function filterOptions(options: Options, keep: Set<string>): [Options, Options] {
	const keptOptions: Options = [];
	const removedOptions: Options = [];
	for (const option of options) {
		if (isSimpleOption(option)) {
			if (keep.has(option)) {
				keptOptions.push(option);
			} else {
				removedOptions.push(option);
			}
		} else if (isOption(option)) {
			if (keep.has(option.value)) {
				keptOptions.push(option);
			} else {
				removedOptions.push(option);
			}
		} else if (isOptGroup(option)) {
			const [kept, removed] = filterOptions(option.options, keep);
			if (kept.length > 0) {
				keptOptions.push({ ...option, options: kept });
			}
			if (removed.length > 0) {
				removedOptions.push({ ...option, options: removed });
			}
		}
	}
	return [keptOptions, removedOptions];
}
