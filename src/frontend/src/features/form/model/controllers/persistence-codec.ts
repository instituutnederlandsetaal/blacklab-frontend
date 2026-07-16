import type { EncodedFieldValue } from '@/features/form/model/types';

import { findOption, type Options } from '@/shared/utils/options';

const ESCAPED_CHARS = /[\\;,=]/g;

export function singleEncodedValue(payload: EncodedFieldValue, label = 'value'): string {
	if (Array.isArray(payload)) {
		if (payload.length !== 1) throw new Error(`Cannot restore ${label} from multiple URL values.`);
		return payload[0] ?? '';
	}
	return payload;
}

function escapePersistValue(value: string): string {
	return value.replace(ESCAPED_CHARS, char => `\\${char}`);
}

export function unescapePersistValue(value: string): string {
	let output = '';
	let escaping = false;
	for (const char of value) {
		if (escaping) {
			output += char;
			escaping = false;
		} else if (char === '\\') {
			escaping = true;
		} else {
			output += char;
		}
	}
	if (escaping) output += '\\';
	return output;
}

export function splitPersistValue(value: string, separator: ',' | ';' = ','): string[] {
	const parts: string[] = [];
	let current = '';
	let escaping = false;
	for (const char of value) {
		if (escaping) {
			current += `\\${char}`;
			escaping = false;
		} else if (char === '\\') {
			escaping = true;
		} else if (char === separator) {
			parts.push(unescapePersistValue(current));
			current = '';
		} else {
			current += char;
		}
	}
	if (escaping) current += '\\';
	parts.push(unescapePersistValue(current));
	return parts;
}

export function joinPersistValues(values: string[], separator: ',' | ';' = ','): string {
	return values.map(escapePersistValue).join(separator);
}

export function decodePersistSelection(payload: EncodedFieldValue): string[] {
	const encoded = Array.isArray(payload) ? payload : [payload];
	return encoded.flatMap(value => splitPersistValue(value)).filter(Boolean);
}

export function decodePersistSingleSelection(payload: EncodedFieldValue): string {
	const values = decodePersistSelection(payload);
	if (values.length > 1) throw new Error('Cannot restore a single-choice field from multiple selected values.');
	return values[0] ?? '';
}

export function assertKnownOptions(values: string[], options: Options): void {
	const unknown = values.filter(value => !findOption(options, value));
	if (unknown.length) throw new Error(`Cannot restore values no longer present in the current options: ${unknown.join(', ')}.`);
}

export function encodePersistObject(values: Record<string, string | null | undefined | boolean>): string | null {
	const parts = Object.entries(values)
		.filter(([, value]) => value != null && value !== '' && value !== false)
		.map(([key, value]) => `${key}=${escapePersistValue(value === true ? '1' : String(value))}`);
	return parts.length ? parts.join(';') : null;
}

export function decodePersistObject(payload: EncodedFieldValue): Record<string, string> {
	const value = singleEncodedValue(payload, 'structured value');
	const result: Record<string, string> = {};
	const seen = new Set<string>();
	for (const part of splitPersistValue(value, ';')) {
		if (!part) continue;
		const index = part.indexOf('=');
		const key = index === -1 ? 'value' : part.slice(0, index);
		if (seen.has(key)) throw new Error(`Cannot restore structured value with duplicate key '${key}'.`);
		seen.add(key);
		result[key] = index === -1 ? part : part.slice(index + 1);
	}
	return result;
}

export function decodePersistRecord(
	payload: EncodedFieldValue,
	expectedKeys: readonly string[],
	label: string,
	options: { allowUnknownKeys?: boolean | ((key: string) => boolean) } = {},
): Record<string, string> {
	const restored = decodePersistObject(payload);
	if (!Object.keys(restored).some(key => expectedKeys.includes(key))) {
		throw new Error(`Cannot restore ${label} from an incompatible persisted value.`);
	}
	if (options.allowUnknownKeys !== true) {
		const allowsKey = typeof options.allowUnknownKeys === 'function' ? options.allowUnknownKeys : (key: string) => expectedKeys.includes(key);
		const unknown = Object.keys(restored).filter(key => !allowsKey(key));
		if (unknown.length) throw new Error(`Cannot restore ${label} with unsupported persisted keys: ${unknown.join(', ')}.`);
	}
	return restored;
}

export function decodePersistRangeMode(value: string | undefined): 'strict' | 'permissive' | undefined {
	if (value == null || value === '') return undefined;
	if (value === 'strict' || value === 'permissive') return value;
	throw new Error(`Cannot restore unknown range mode '${value}'.`);
}
