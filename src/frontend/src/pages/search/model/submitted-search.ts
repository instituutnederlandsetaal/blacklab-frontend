import { shallowReadonly, shallowRef, type Ref } from 'vue';

import type { BLCollocationType } from '@/types/blacklabtypes';

export type SubmittedQuery = {
	patt?: string;
	filter?: string;
	searchfield?: string;
	withspans?: boolean;
	pattgapdata?: string;
	colltype?: BLCollocationType;
	collpatt?: string;
	context?: number | string | null;
	within?: string;
	reltype?: string;
	annotation?: string;
	sensitive?: boolean;
};

export type SubmittedSearch = {
	readonly params: Readonly<SubmittedQuery>;
	readonly form: Readonly<Record<string, string | null | readonly (string | null)[]>>;
	/** Older saved searches use this field for export labels. */
	readonly legacyInterface?: string;
};

export type SubmittedSearchState = {
	current: Readonly<Ref<SubmittedSearch | undefined>>;
	replace(snapshot: SubmittedSearch): void;
	reset(): void;
};

export function createSubmittedSearch(): SubmittedSearchState {
	const current = shallowRef<SubmittedSearch>();
	return {
		current: shallowReadonly(current),
		replace(snapshot: SubmittedSearch) {
			const form = { ...snapshot.form };
			for (const [key, value] of Object.entries(form)) {
				if (Array.isArray(value)) form[key] = Object.freeze([...value]);
			}
			current.value = Object.freeze({ ...snapshot, params: Object.freeze({ ...snapshot.params }), form: Object.freeze(form) });
		},
		reset() {
			current.value = undefined;
		},
	};
}
