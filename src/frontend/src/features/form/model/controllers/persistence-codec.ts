import type { EncodedFieldValue } from '@/features/form/model/types/form-controllers';

const ESCAPED_CHARS = /[\\;,=]/g;

export function firstEncodedValue(payload: EncodedFieldValue): string {
	return Array.isArray(payload) ? (payload[0] ?? '') : payload;
}

export function escapePersistValue(value: string): string {
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

export function encodePersistObject(values: Record<string, string | null | undefined | boolean>): string | null {
	const parts = Object.entries(values)
		.filter(([, value]) => value != null && value !== '' && value !== false)
		.map(([key, value]) => `${key}=${escapePersistValue(value === true ? '1' : String(value))}`);
	return parts.length ? parts.join(';') : null;
}

export function decodePersistObject(payload: EncodedFieldValue): Record<string, string> {
	const value = firstEncodedValue(payload);
	const result: Record<string, string> = {};
	for (const part of splitPersistValue(value, ';')) {
		if (!part) continue;
		const index = part.indexOf('=');
		if (index === -1) result.value = part;
		else result[part.slice(0, index)] = part.slice(index + 1);
	}
	return result;
}
