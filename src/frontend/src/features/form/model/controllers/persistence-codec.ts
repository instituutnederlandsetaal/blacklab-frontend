import type { EncodedFieldValue } from '@/features/form/model/types/form-controllers';

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

export function unknownOptionWarnings(values: string[], options: Options): string[] {
	const unknown = values.filter(value => !findOption(options, value));
	return unknown.length ? [`Restored values no longer present in the current options: ${unknown.join(', ')}.`] : [];
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
	for (const part of splitPersistValue(value, ';')) {
		if (!part) continue;
		const index = part.indexOf('=');
		if (index === -1) result.value = part;
		else result[part.slice(0, index)] = part.slice(index + 1);
	}
	return result;
}

export function decodePersistRecord(payload: EncodedFieldValue, expectedKeys: readonly string[], label: string): Record<string, string> {
	const restored = decodePersistObject(payload);
	if (!Object.keys(restored).some(key => expectedKeys.includes(key))) {
		throw new Error(`Cannot restore ${label} from an incompatible persisted value.`);
	}
	return restored;
}

export function decodePersistRangeMode(value: string | undefined): 'strict' | 'permissive' | undefined {
	if (value == null || value === '') return undefined;
	if (value === 'strict' || value === 'permissive') return value;
	throw new Error(`Cannot restore unknown range mode '${value}'.`);
}
