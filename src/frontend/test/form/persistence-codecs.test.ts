import { describe, expect, test } from 'vitest';

import { array, bool, object, record, scalar } from '@/features/form/model/controllers/persistence-codec';

describe('persistence codec primitives', () => {
	test('object codecs omit defaults and round-trip escaped record values', () => {
		const codec = object({
			value: scalar().default('').atRoot(),
			caseSensitive: bool().default(false).at('c'),
			values: record(scalar()).default({}).at('v'),
		});
		const state = { value: '', caseSensitive: true, values: { a: 'b', c: 'd;e', escaped: 'x\\y' } };
		const encoded = codec.encode(state, undefined);

		expect(encoded).toBe('c=1;v={a:b;c:d\\;e;escaped:x\\\\y}');
		expect(codec.decode(encoded, undefined)).toEqual(state);
	});

	test('object codecs encode a root property before named properties regardless of shape order', () => {
		const codec = object({ named: scalar().at('n'), root: scalar().atRoot() });
		const state = { named: 'named', root: 'root' };

		expect(codec.encode(state, undefined)).toBe('root;n=named');
		expect(codec.decode('root;n=named', undefined)).toEqual(state);
	});

	test('escaped arrays round-trip reserved characters successfully', () => {
		const codec = array(scalar());
		const state = ['plain', 'comma,value', 'semi;value', 'equals=value', 'brace{value}', 'slash\\value'];
		const encoded = codec.encode(state, undefined);

		expect(codec.decode(encoded, undefined)).toEqual(state);
	});

	test('mapped scalar codecs decode values and reject ambiguous mappings', () => {
		expect(scalar().mapped({ strict: 's', permissive: 'p' }).decode('p', undefined)).toBe('permissive');
		expect(() => scalar().mapped({ one: 'x', two: 'x' })).toThrow("Persistence value mapping is not bijective: 'x' is mapped more than once.");
	});

	test('record codecs preserve an own __proto__ property without mutating the prototype', () => {
		const prototypeRecord = Object.fromEntries([['__proto__', 'value']]);
		const restoredPrototypeRecord = record(scalar()).decode(record(scalar()).encode(prototypeRecord, undefined), undefined);
		expect(restoredPrototypeRecord).toEqual(prototypeRecord);
		expect(Object.getPrototypeOf(restoredPrototypeRecord)).toBe(Object.prototype);
		expect(Object.hasOwn(restoredPrototypeRecord, '__proto__')).toBe(true);
	});

	test('codec object defaults are cloned for each decode', () => {
		const defaultValue = { known: '', nested: { value: 'default' } };
		const defaultCodec = object({ known: scalar().default('') })
			.transform<typeof defaultValue>({ encode: value => ({ known: value.known }), decode: value => ({ ...value, nested: { value: 'default' } }) })
			.default(defaultValue);
		const restoredDefault = defaultCodec.decode(null, undefined);
		restoredDefault.nested.value = 'changed';
		expect(defaultCodec.decode(null, undefined).nested.value).toBe('default');
	});

	test('custom and contextual defaults are omitted and restored', () => {
		const defaultValue = { known: '', nested: { value: 'default' } };
		const defaultCodec = object({ known: scalar().default('') })
			.transform<typeof defaultValue>({ encode: value => ({ known: value.known }), decode: value => ({ ...value, nested: { value: 'default' } }) })
			.default(defaultValue)
			.omitWhen(value => !value.known.trim());
		expect(defaultCodec.encode({ known: '  ', nested: { value: 'changed' } }, undefined)).toBeNull();
		const contextual = scalar<{ fallback: string }>().default(({ fallback }) => fallback);
		expect(contextual.encode('configured', { fallback: 'configured' })).toBeNull();
		expect(contextual.decode(null, { fallback: 'configured' })).toBe('configured');
	});

	test('strict object codecs reject duplicate and unsupported keys', () => {
		expect(() => object({ value: scalar().at('v') }).decode('v=one;v=two', undefined)).toThrow("Duplicate object key 'v'.");
		expect(() => object({ first: scalar().at('v'), second: scalar().at('v') })).toThrow("Object persistence key 'v' is mapped more than once.");
		expect(() => object({ first: scalar().atRoot(), second: scalar().atRoot() })).toThrow('An object codec can only define one root property.');
		expect(() => object({ value: scalar().atRoot() }).decode('one;two', undefined)).toThrow('Duplicate root object value.');
		expect(() => object({ value: scalar().at('v') }).decode('v=one;unknown=one', undefined)).toThrow("Unsupported object key 'unknown'.");
	});

	test('structured codecs reject reserved characters and incomplete escapes', () => {
		expect(() => object({ value: scalar().at('v') }).decode('v=a{;unknown=x}', undefined)).toThrow("Persisted value contains unescaped reserved character '{'.");
		expect(() => array(scalar()).decode('one\\', undefined)).toThrow('Persisted value ends with an incomplete escape.');
	});
});
