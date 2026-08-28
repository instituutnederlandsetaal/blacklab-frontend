import { getAllNodes } from '@/features/form/model/form-utils';
import { getFieldPersistKey, type FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { FormFieldNode, FormNode } from '@/features/form/model/types/form-shape';

export const FORM_QUERY_PREFIX = 'f.';
export const SCOPED_FORM_KEYS = {
	formSelector: 'form',
	tabSelections: 'tab',
} as const;

const RESERVED_KEYS: ReadonlySet<string> = new Set(Object.values(SCOPED_FORM_KEYS));

export type PersistenceSchemaEntry = { field: FormFieldNode; key: string };
type PersistenceSchemaIssue = {
	nodeId: string;
	message: string;
	key?: string;
	kind: 'key-error' | 'invalid-key';
};
export type PersistenceSchema = {
	entries: PersistenceSchemaEntry[];
	keys: ReadonlyMap<FormFieldNode, string>;
	issues: PersistenceSchemaIssue[];
};

export function resolvePersistenceSchema(form: FormNode, context: FormRuntimeContext): PersistenceSchema {
	const claimed = new Map<string, FormFieldNode>();
	const keys = new Map<FormFieldNode, string>();
	const issues: PersistenceSchemaIssue[] = [];
	for (const field of getAllNodes(form, 'field')) {
		let key: unknown;
		try {
			key = getFieldPersistKey(field, context);
		} catch (error) {
			issues.push({ nodeId: field.id, message: error instanceof Error ? error.message : String(error), kind: 'key-error' });
			continue;
		}
		if (typeof key !== 'string' || !key) {
			issues.push({ nodeId: field.id, message: `Field '${field.id}' has an invalid form persistence key.`, ...(typeof key === 'string' ? { key } : {}), kind: 'invalid-key' });
			continue;
		}
		if (RESERVED_KEYS.has(key)) {
			issues.push({ nodeId: field.id, key, message: `Field '${field.id}' uses reserved form persistence key '${key}'.`, kind: 'invalid-key' });
			continue;
		}
		const previous = claimed.get(key);
		if (previous) {
			issues.push({ nodeId: field.id, key, message: `Duplicate form persistence key '${key}' for '${field.id}' and '${previous.id}'.`, kind: 'invalid-key' });
			continue;
		}
		claimed.set(key, field);
		keys.set(field, key);
	}
	return { entries: [...keys].map(([field, key]) => ({ field, key })), keys, issues };
}
