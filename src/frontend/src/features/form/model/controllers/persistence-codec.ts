/**
 * Small composable codecs for storing typed field state in one URL parameter.
 *
 * Wire-format examples (assuming an arbitrary `context`):
 *
 *   scalar().encode('lemma', context)                         // 'lemma'
 *   array(scalar()).encode(['noun', 'verb'], context)         // 'noun,verb'
 *   record(scalar()).encode({ tense: 'past' }, context)       // 'tense:past'
 *   object({
 *     value: scalar().atRoot(),
 *     caseSensitive: bool().default(false).at('c'),
 *   }).encode({ value: 'Water', caseSensitive: true }, context) // 'Water;c=1'
 *
 * Structured children are brace-framed, so delimiters remain unambiguous:
 *
 *   object({ values: array(scalar()).at('v') })
 *     .encode({ values: ['one', 'two'] }, context)            // 'v={one,two}'
 *
 * Reserved delimiters and backslashes in scalar values are escaped automatically
 * when the scalar is embedded. Callers should compose codecs rather than parse or
 * escape these strings themselves.
 */

/** The error */
class PersistenceCodecError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PersistenceCodecError';
	}
}

type Encoded = string | null;
type DefaultValue<T, Context> = T | ((context: Context) => T);
// Placement only has meaning when this codec is used as an object property.
type Placement = { kind: 'key'; key?: string } | { kind: 'root' };
type CodecMeta = { placement: Placement; scope?: string };

type CodecFunctions<T, Context> = {
	encode: (value: T, context: Context, meta: CodecMeta) => Encoded;
	decode: (payload: Encoded, context: Context, meta: CodecMeta) => T;
};

function codecError(message: string): never {
	throw new PersistenceCodecError(message);
}

/**
 * Simple equality for json-like structures.
 * More "equivalence" than equality, as we ignore object identity and only check structure and values.
 * Intentionally don't handle complex things like functions, date, symbols etc.
 * Arrays must have the same order of elements to be considered equal.
 * @returns true if the structures are equivalent, false otherwise.
 */
function equalPlain(left: unknown, right: unknown): boolean {
	// Defaults are plain state values, so structural equality is sufficient and
	// avoids serializing a value merely because its object identity changed.
	if (Object.is(left, right)) return true;
	if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => equalPlain(value, right[index]));
	if (left && right && typeof left === 'object' && typeof right === 'object') {
		const leftEntries = Object.entries(left);
		const rightEntries = Object.entries(right);
		return (
			leftEntries.length === rightEntries.length && leftEntries.every(([key, value]) => Object.prototype.hasOwnProperty.call(right, key) && equalPlain(value, (right as Record<string, unknown>)[key]))
		);
	}
	return false;
}

function resolveDefault<T, Context>(value: DefaultValue<T, Context>, context: Context): T {
	// Never hand the codec's stored default object/array to mutable form state.
	return structuredClone(typeof value === 'function' ? (value as (context: Context) => T)(context) : value);
}

function validateKey(key: string, label: string): void {
	if (!key) codecError(`${label} cannot be empty.`);
	if (/[\\;=:,{}]/.test(key)) codecError(`${label} '${key}' contains a reserved persistence character.`);
}

function escapeBoundary(value: string, reserved: string): string {
	let output = '';
	for (const char of value) output += char === '\\' || reserved.includes(char) ? `\\${char}` : char;
	return output;
}

function splitBoundary(value: string, separator: string): string[] {
	// Separators inside escaped values or brace-framed child codecs are data, not
	// boundaries belonging to the current codec.
	const parts: string[] = [];
	let current = '';
	let depth = 0;
	for (let index = 0; index < value.length; index += 1) {
		const char = value[index];
		if (char === '\\') {
			if (index + 1 >= value.length) codecError('Persisted value ends with an incomplete escape.');
			current += char + value[++index];
		} else if (char === '{') {
			depth += 1;
			current += char;
		} else if (char === '}') {
			if (depth === 0) codecError('Persisted value contains an unmatched closing brace.');
			depth -= 1;
			current += char;
		} else if (char === separator && depth === 0) {
			parts.push(current);
			current = '';
		} else {
			current += char;
		}
	}
	if (depth !== 0) codecError('Persisted value contains an unclosed structured value.');
	parts.push(current);
	return parts;
}

function findBoundary(value: string, separator: string): number {
	let depth = 0;
	for (let index = 0; index < value.length; index += 1) {
		if (value[index] === '\\') {
			if (index + 1 >= value.length) codecError('Persisted value ends with an incomplete escape.');
			index += 1;
		} else if (value[index] === '{') {
			depth += 1;
		} else if (value[index] === '}') {
			if (depth === 0) codecError('Persisted value contains an unmatched closing brace.');
			depth -= 1;
		} else if (value[index] === separator && depth === 0) {
			return index;
		}
	}
	if (depth !== 0) codecError('Persisted value contains an unclosed structured value.');
	return -1;
}

function unescapeBoundary(value: string, reserved: string): string {
	let output = '';
	for (let index = 0; index < value.length; index += 1) {
		const char = value[index];
		if (char !== '\\') {
			if (reserved.includes(char)) codecError(`Persisted value contains unescaped reserved character '${char}'.`);
			output += char;
			continue;
		}
		const escaped = value[++index];
		if (escaped == null) codecError('Persisted value ends with an incomplete escape.');
		if (escaped !== '\\' && !reserved.includes(escaped)) codecError(`Persisted value contains invalid escape '\\${escaped}'.`);
		output += escaped;
	}
	return output;
}

function withPath(error: unknown, path: string): never {
	if (error instanceof PersistenceCodecError) codecError(`${path}: ${error.message}`);
	throw error;
}

function encodeEmbedded(codec: PersistenceCodec<any, any>, encoded: string, reserved: string): string {
	// Braces identify a complete structured child; scalar children only need the
	// delimiters reserved by their parent escaped.
	return codec._structured ? `{${encoded}}` : escapeBoundary(encoded, reserved + '{}');
}

function decodeEmbedded<T, Context>(codec: PersistenceCodec<T, Context>, payload: Encoded, context: Context, reserved: string): T {
	if (payload == null) return codec.decode(null, context);
	if (codec._structured) {
		if (!payload.startsWith('{') || !payload.endsWith('}')) codecError('Expected a brace-framed structured value.');
		return codec.decode(payload.slice(1, -1), context);
	}
	return codec.decode(unescapeBoundary(payload, reserved + '{}'), context);
}

export class PersistenceCodec<T, Context = any> {
	/** @internal Composition metadata used by parent codecs. */
	readonly _meta: CodecMeta;
	/** @internal Whether this codec needs braces when embedded in another codec. */
	readonly _structured: boolean;
	private readonly functions: CodecFunctions<T, Context>;
	private readonly defaultValue?: DefaultValue<T, Context>;
	private readonly omitPredicate?: (value: T, context: Context) => boolean;
	private readonly restFactory?: (codec: PersistenceCodec<any, Context>) => PersistenceCodec<any, Context>;

	constructor(
		functions: CodecFunctions<T, Context>,
		options: {
			meta?: CodecMeta;
			defaultValue?: DefaultValue<T, Context>;
			omitPredicate?: (value: T, context: Context) => boolean;
			restFactory?: (codec: PersistenceCodec<any, Context>) => PersistenceCodec<any, Context>;
			structured?: boolean;
		} = {},
	) {
		this.functions = functions;
		this._meta = options.meta ?? { placement: { kind: 'key' } };
		this._structured = options.structured ?? false;
		this.defaultValue = options.defaultValue;
		this.omitPredicate = options.omitPredicate;
		this.restFactory = options.restFactory;
	}

	private copy<Next = T>(
		options: {
			functions?: CodecFunctions<Next, Context>;
			meta?: CodecMeta;
			defaultValue?: DefaultValue<Next, Context>;
			omitPredicate?: (value: Next, context: Context) => boolean;
			restFactory?: (codec: PersistenceCodec<any, Context>) => PersistenceCodec<any, Context>;
			structured?: boolean;
		} = {},
	): PersistenceCodec<Next, Context> {
		// All fluent modifiers are immutable: a base codec can safely be reused in
		// several shapes with different defaults, placements, or refinements.
		return new PersistenceCodec<Next, Context>(options.functions ?? (this.functions as unknown as CodecFunctions<Next, Context>), {
			meta: options.meta ?? this._meta,
			defaultValue: options.defaultValue,
			omitPredicate: options.omitPredicate,
			restFactory: options.restFactory ?? this.restFactory,
			structured: options.structured ?? this._structured,
		});
	}

	encode(value: T, context: Context): Encoded {
		return this.encodeWithMeta(value, context, this._meta);
	}

	private encodeWithMeta(value: T, context: Context, meta: CodecMeta): Encoded {
		// `null` means "omit this value", never an encoded null literal.
		if (this.defaultValue !== undefined) {
			const fallback = resolveDefault(this.defaultValue, context);
			if (equalPlain(value, fallback) || this.omitPredicate?.(value, context)) return null;
		}
		return this.functions.encode(value, context, meta);
	}

	decode(payload: Encoded, context: Context): T {
		return this.decodeWithMeta(payload, context, this._meta);
	}

	private decodeWithMeta(payload: Encoded, context: Context, meta: CodecMeta): T {
		if (payload == null && this.defaultValue !== undefined) return resolveDefault(this.defaultValue, context);
		return this.functions.decode(payload, context, meta);
	}

	default(value: DefaultValue<T, Context>): PersistenceCodec<T, Context> {
		// Defaults serve both directions: omit them while encoding and restore them
		// when a parent object has no payload for this child.
		return this.copy({ defaultValue: value });
	}

	omitWhen(predicate: (value: T, context: Context) => boolean): PersistenceCodec<T, Context> {
		// An omitted value decodes as the configured default, which is why this is
		// intentionally unavailable without default().
		if (this.defaultValue === undefined) codecError('omitWhen() requires a default value.');
		return this.copy({ defaultValue: this.defaultValue, omitPredicate: predicate });
	}

	at(key: string): PersistenceCodec<T, Context> {
		// Rename this property on the wire without changing its state-object key.
		validateKey(key, 'Persistence key');
		return this.copy({ defaultValue: this.defaultValue, omitPredicate: this.omitPredicate, meta: { ...this._meta, placement: { kind: 'key', key } } });
	}

	atRoot(): PersistenceCodec<T, Context> {
		// Store this property as the object's unnamed leading value. Object codecs
		// allow at most one root property.
		return this.copy({ defaultValue: this.defaultValue, omitPredicate: this.omitPredicate, meta: { ...this._meta, placement: { kind: 'root' } } });
	}

	scoped(prefix: string): PersistenceCodec<T, Context> {
		// Prefix an object's wire keys; a root property becomes the prefix itself.
		validateKey(prefix, 'Persistence scope');
		return this.copy({ defaultValue: this.defaultValue, omitPredicate: this.omitPredicate, meta: { ...this._meta, scope: prefix } });
	}

	transform<Outer>(mapping: { encode: (value: Outer, context: Context) => T; decode: (value: T, context: Context) => Outer }): PersistenceCodec<Outer, Context> {
		// Preserve the inner codec's placement and framing while exposing another
		// state type to callers.
		const encodeInner = this.encodeWithMeta.bind(this);
		const decodeInner = this.decodeWithMeta.bind(this);
		return new PersistenceCodec<Outer, Context>(
			{
				encode: (value, context, meta) => encodeInner(mapping.encode(value, context), context, meta),
				decode: (payload, context, meta) => mapping.decode(decodeInner(payload, context, meta), context),
			},
			{ meta: this._meta, structured: this._structured },
		);
	}

	refine(check: (value: T, context: Context) => boolean | string | void): PersistenceCodec<T, Context> {
		// Validate on both encode and decode so invalid runtime state cannot produce
		// a URL that this same codec would reject when restored.
		const encodeInner = this.encodeWithMeta.bind(this);
		const decodeInner = this.decodeWithMeta.bind(this);
		const validate = (value: T, context: Context) => {
			const result = check(value, context);
			if (result === false) codecError('Persisted value failed validation.');
			if (typeof result === 'string') codecError(result);
			return value;
		};
		return new PersistenceCodec<T, Context>(
			{
				encode: (value, context, meta) => encodeInner(validate(value, context), context, meta),
				decode: (payload, context, meta) => validate(decodeInner(payload, context, meta), context),
			},
			{ meta: this._meta, structured: this._structured },
		);
	}

	mapped<const Map extends Readonly<Record<string, string>>>(mapping: Map): PersistenceCodec<keyof Map & string, Context> {
		// Compact a closed set of string values while retaining their literal type.
		const reverse = new Map<string, keyof Map & string>();
		for (const [input, output] of Object.entries(mapping)) {
			if (reverse.has(output)) codecError(`Persistence value mapping is not bijective: '${output}' is mapped more than once.`);
			reverse.set(output, input);
		}
		return (this as unknown as PersistenceCodec<string, Context>).transform<keyof Map & string>({
			encode(value) {
				const encoded = mapping[value];
				if (encoded == null) codecError(`Cannot encode unmapped value '${value}'.`);
				return encoded;
			},
			decode(value) {
				const decoded = reverse.get(value);
				if (decoded == null) codecError(`Cannot decode unmapped value '${value}'.`);
				return decoded;
			},
		});
	}

	mapKeys<const Map extends Readonly<Record<string, string>>, Value>(
		this: PersistenceCodec<Record<string, Value>, Context>,
		mapping: Map,
	): PersistenceCodec<Partial<Record<keyof Map & string, Value>>, Context> {
		// mapKeys is the record-key counterpart of mapped(); both reject ambiguous
		// reverse mappings at construction time.
		const reverse = new Map<string, keyof Map & string>();
		for (const [input, output] of Object.entries(mapping)) {
			if (reverse.has(output)) codecError(`Persistence key mapping is not bijective: '${output}' is mapped more than once.`);
			reverse.set(output, input);
		}
		return this.transform<Partial<Record<keyof Map & string, Value>>>({
			encode(value) {
				const encoded: Record<string, Value> = {};
				for (const [key, child] of Object.entries(value) as Array<[keyof Map & string, Value]>) {
					const mapped = mapping[key];
					if (mapped == null) codecError(`Cannot encode unmapped key '${key}'.`);
					encoded[mapped] = child;
				}
				return encoded;
			},
			decode(value) {
				const decoded: Partial<Record<keyof Map & string, Value>> = {};
				for (const [key, child] of Object.entries(value) as Array<[string, Value]>) {
					const mapped = reverse.get(key);
					if (mapped == null) codecError(`Cannot decode unmapped key '${key}'.`);
					decoded[mapped] = child;
				}
				return decoded;
			},
		});
	}

	restProperties<Value>(codec: PersistenceCodec<Value, Context>): PersistenceCodec<T & Record<string, Value>, Context> {
		// Fixed object properties keep precedence; this codec handles every other key.
		if (!this.restFactory) codecError('restProperties() is only supported by object codecs.');
		return this.restFactory(codec) as PersistenceCodec<T & Record<string, Value>, Context>;
	}
}

type CodecState<Codec> = Codec extends PersistenceCodec<infer State, any> ? State : never;
type CodecShape = Readonly<Record<string, PersistenceCodec<any, any>>>;
type ShapeState<Shape extends CodecShape> = { [Key in keyof Shape]: CodecState<Shape[Key]> };

export function scalar<Context = any>(): PersistenceCodec<string, Context> {
	return new PersistenceCodec({
		encode: value => {
			if (typeof value !== 'string') codecError('Expected a string value.');
			return value;
		},
		decode: payload => {
			if (payload == null) codecError('Missing required string value.');
			return payload;
		},
	});
}

export function stringPersistenceCodec<Context = unknown>(defaultValue: DefaultValue<string, Context> = ''): PersistenceCodec<string, Context> {
	return scalar<Context>().default(defaultValue);
}

export function bool<Context = any>(): PersistenceCodec<boolean, Context> {
	return new PersistenceCodec({
		encode: value => {
			if (typeof value !== 'boolean') codecError('Expected a boolean value.');
			return value ? '1' : '0';
		},
		decode: payload => {
			if (payload === '1') return true;
			if (payload === '0') return false;
			codecError(`Expected boolean value '1' or '0', received '${payload ?? ''}'.`);
		},
	});
}

export function number<Context = any>(): PersistenceCodec<number, Context> {
	return new PersistenceCodec({
		encode: value => {
			if (typeof value !== 'number' || !Number.isFinite(value)) codecError('Expected a finite number value.');
			return String(value);
		},
		decode: payload => {
			if (payload == null || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(payload)) codecError(`Expected a number, received '${payload ?? ''}'.`);
			const value = Number(payload);
			if (!Number.isFinite(value)) codecError(`Expected a finite number, received '${payload}'.`);
			return value;
		},
	});
}

export function array<Item, Context = any>(item: PersistenceCodec<Item, Context>): PersistenceCodec<Item[], Context> {
	return new PersistenceCodec(
		{
			encode: (values, context) => {
				if (!Array.isArray(values)) codecError('Expected an array value.');
				return values
					.map((value, index) => {
						const encoded = item.encode(value, context);
						if (encoded == null) codecError(`Cannot omit array item ${index}.`);
						return encodeEmbedded(item, encoded, ',');
					})
					.join(',');
			},
			decode: (payload, context) => {
				if (payload == null) codecError('Missing required array value.');
				if (payload === '') return [];
				return splitBoundary(payload, ',').map((value, index) => {
					try {
						return decodeEmbedded(item, value, context, ',');
					} catch (error) {
						withPath(error, `[${index}]`);
					}
				});
			},
		},
		{ structured: true },
	); // Arrays require framing when nested because they own `,`.
}

export function record<Value, Context = any>(valueCodec: PersistenceCodec<Value, Context>): PersistenceCodec<Record<string, Value>, Context> {
	return new PersistenceCodec(
		{
			encode: (values, context) => {
				if (!values || Array.isArray(values) || typeof values !== 'object') codecError('Expected a record value.');
				const entries: string[] = [];
				for (const [key, value] of Object.entries(values)) {
					const encoded = valueCodec.encode(value, context);
					if (encoded == null) continue;
					entries.push(`${escapeBoundary(key, ';:{}')}:${encodeEmbedded(valueCodec, encoded, ';')}`);
				}
				return entries.join(';');
			},
			decode: (payload, context) => {
				if (payload == null) codecError('Missing required record value.');
				const result = new Map<string, Value>();
				if (payload === '') return {};
				for (const entry of splitBoundary(payload, ';')) {
					const separator = findBoundary(entry, ':');
					if (separator < 1) codecError(`Invalid record entry '${entry}'.`);
					const key = unescapeBoundary(entry.slice(0, separator), ';:{}');
					if (result.has(key)) codecError(`Duplicate record key '${key}'.`);
					try {
						result.set(key, decodeEmbedded(valueCodec, entry.slice(separator + 1), context, ';'));
					} catch (error) {
						withPath(error, key);
					}
				}
				return Object.fromEntries(result);
			},
		},
		{ structured: true },
	); // Records require framing when nested because they own `;` and `:`.
}

type RestConfig<Context> = { codec: PersistenceCodec<any, Context> } | undefined;

function createObjectCodec<Shape extends CodecShape, Context>(shape: Shape, rest: RestConfig<Context>): PersistenceCodec<ShapeState<Shape>, Context> {
	// Validate the shape once at construction instead of rediscovering collisions
	// during every encode/decode operation.
	const knownStateKeys = new Set(Object.keys(shape));
	const wireKeys = new Set<string>();
	let rootProperties = 0;
	for (const [stateKey, child] of Object.entries(shape)) {
		const placement = child._meta.placement;
		if (placement.kind === 'root') {
			rootProperties += 1;
			continue;
		}
		const wireKey = placement.key ?? stateKey;
		validateKey(wireKey, 'Persistence key');
		if (wireKeys.has(wireKey)) codecError(`Object persistence key '${wireKey}' is mapped more than once.`);
		wireKeys.add(wireKey);
	}
	if (rootProperties > 1) codecError('An object codec can only define one root property.');
	const functions: CodecFunctions<ShapeState<Shape>, Context> = {
		encode(value, context, meta) {
			if (!value || Array.isArray(value) || typeof value !== 'object') codecError('Expected an object value.');
			const entries: Array<{ root: boolean; key?: string; value: string; codec: PersistenceCodec<any, Context> }> = [];
			for (const [stateKey, child] of Object.entries(shape)) {
				let encoded: Encoded;
				try {
					encoded = child.encode((value as Record<string, unknown>)[stateKey], context);
				} catch (error) {
					withPath(error, stateKey);
				}
				if (encoded == null) continue;
				const placement = child._meta.placement;
				const root = placement.kind === 'root';
				const childKey = placement.kind === 'key' ? (placement.key ?? stateKey) : undefined;
				const key = meta.scope ? (root ? meta.scope : `${meta.scope}.${childKey}`) : childKey;
				entries.push({ root: root && !meta.scope, key, value: encoded, codec: child });
			}
			if (rest) {
				for (const [stateKey, stateValue] of Object.entries(value)) {
					if (knownStateKeys.has(stateKey)) continue;
					if (!stateKey) codecError('Rest property key cannot be empty.');
					if (wireKeys.has(stateKey)) codecError(`Rest property key '${stateKey}' collides with a fixed object persistence key.`);
					const encoded = rest.codec.encode(stateValue, context);
					if (encoded == null) continue;
					const key = meta.scope ? `${meta.scope}.${escapeBoundary(stateKey, ';={}')}` : escapeBoundary(stateKey, ';={}');
					entries.push({ root: false, key, value: encoded, codec: rest.codec });
				}
			}
			const rootEntries = entries.filter(entry => entry.root);
			if (rootEntries.length > 1) codecError('An object codec can only encode one root property.');
			return entries
				.sort((left, right) => Number(right.root) - Number(left.root))
				.map(entry => (entry.root ? encodeEmbedded(entry.codec, entry.value, ';=') : `${entry.key}=${encodeEmbedded(entry.codec, entry.value, ';')}`))
				.join(';');
		},
		decode(payload, context, meta) {
			if (payload == null) codecError('Missing required object value.');
			const named = new Map<string, string>();
			let root: string | null = null;
			if (payload !== '') {
				for (const entry of splitBoundary(payload, ';')) {
					const separator = findBoundary(entry, '=');
					if (separator === -1) {
						if (root != null) codecError('Duplicate root object value.');
						root = entry;
						continue;
					}
					const key = unescapeBoundary(entry.slice(0, separator), ';={}');
					if (!key) codecError('Persisted object key cannot be empty.');
					if (named.has(key)) codecError(`Duplicate object key '${key}'.`);
					named.set(key, entry.slice(separator + 1));
				}
			}

			// Parse first, then let each child claim its payload. This makes duplicate,
			// missing, and unsupported keys deterministic regardless of shape order.
			const result = new Map<string, unknown>();
			const consumed = new Set<string>();
			let acceptsRoot = false;
			for (const [stateKey, child] of Object.entries(shape)) {
				const placement = child._meta.placement;
				const isRoot = placement.kind === 'root';
				acceptsRoot ||= isRoot && !meta.scope;
				const childKey = placement.kind === 'key' ? (placement.key ?? stateKey) : undefined;
				const key = meta.scope ? (isRoot ? meta.scope : `${meta.scope}.${childKey}`) : childKey;
				const childPayload = isRoot && !meta.scope ? root : named.get(key!);
				if (key && named.has(key)) consumed.add(key);
				try {
					result.set(stateKey, decodeEmbedded(child, childPayload ?? null, context, isRoot && !meta.scope ? ';=' : ';'));
				} catch (error) {
					withPath(error, stateKey);
				}
			}
			if (root != null && !acceptsRoot) codecError('Object contains an unsupported root value.');
			for (const [key, value] of named) {
				if (consumed.has(key)) continue;
				const restPrefix = meta.scope ? `${meta.scope}.` : '';
				if (!rest || (restPrefix && !key.startsWith(restPrefix))) codecError(`Unsupported object key '${key}'.`);
				const stateKey = restPrefix ? key.slice(restPrefix.length) : key;
				if (!stateKey) codecError(`Unsupported object key '${key}'.`);
				if (knownStateKeys.has(stateKey) || wireKeys.has(stateKey)) codecError(`Rest property key '${stateKey}' collides with a fixed object property.`);
				try {
					result.set(stateKey, decodeEmbedded(rest.codec, value, context, ';'));
				} catch (error) {
					withPath(error, stateKey);
				}
			}
			return Object.fromEntries(result) as ShapeState<Shape>;
		},
	};
	return new PersistenceCodec(functions, {
		// Keep the original fixed shape when restProperties() adds a catch-all codec.
		restFactory: codec => createObjectCodec(shape, { codec }),
		structured: true,
	});
}

export function object<Shape extends CodecShape, Context = any>(shape: Shape): PersistenceCodec<ShapeState<Shape>, Context> {
	return createObjectCodec(shape, undefined);
}

export function variant<State, Context = any>(
	variants: Readonly<Record<string, PersistenceCodec<any, Context>>>,
	select: (value: State, context: Context) => string,
): PersistenceCodec<State, Context> {
	// The tag is deliberately outside the child payload so decoding can select a
	// codec without probing several incompatible formats.
	for (const tag of Object.keys(variants)) validateKey(tag, 'Variant tag');
	return new PersistenceCodec(
		{
			encode(value, context) {
				const tag = select(value, context);
				const codec = variants[tag];
				if (!codec) codecError(`Cannot encode unknown variant '${tag}'.`);
				const encoded = codec.encode(value, context);
				if (encoded == null) codecError(`Cannot omit variant '${tag}'.`);
				return `${tag}:${encodeEmbedded(codec, encoded, '')}`;
			},
			decode(payload, context) {
				if (payload == null) codecError('Missing required variant value.');
				const separator = payload.indexOf(':');
				if (separator < 1) codecError(`Invalid variant value '${payload}'.`);
				const tag = payload.slice(0, separator);
				const codec = variants[tag];
				if (!codec) codecError(`Cannot decode unknown variant '${tag}'.`);
				return decodeEmbedded(codec, payload.slice(separator + 1), context, '') as State;
			},
		},
		{ structured: true },
	);
}

export function lazy<State, Context = any>(factory: () => PersistenceCodec<State, Context>): PersistenceCodec<State, Context> {
	// Resolve once and only on first use, allowing recursive codec declarations.
	let resolved: PersistenceCodec<State, Context> | undefined;
	const get = () => (resolved ??= factory());
	return new PersistenceCodec(
		{
			encode: (value, context) => get().encode(value, context),
			decode: (payload, context) => get().decode(payload, context),
		},
		{ structured: true },
	);
}
