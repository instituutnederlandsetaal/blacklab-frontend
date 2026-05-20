import type { PersistableFormState } from '@/features/form/model/types/form-query';
import type { FormState } from '@/features/form/model/types/form-state';

export type EncodedPersistableFormState = {
	v: string;
	form: string;
	state: string;
	cql?: string;
	filter?: string;
	searchField?: string;
	resultPreset?: string;
};

export function encodeSubmittedForm(snapshot: PersistableFormState): EncodedPersistableFormState {
	return {
		v: snapshot.schemaVersion,
		form: snapshot.formId,
		state: JSON.stringify(snapshot.state),
		cql: snapshot.cql ?? undefined,
		filter: snapshot.filter ?? undefined,
		searchField: snapshot.searchField ?? undefined,
	};
}

export function decodeSubmittedSnapshot(encoded: EncodedPersistableFormState): PersistableFormState | null {
	try {
		const state = JSON.parse(encoded.state) as FormState;
		return {
			formId: encoded.form,
			state,
			cql: encoded.cql ?? null,
			filter: encoded.filter ?? null,
			searchField: encoded.searchField ?? null,
			schemaVersion: encoded.v,
		};
	} catch {
		return null;
	}
}
