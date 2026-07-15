import type { FieldComponentProps, FieldDefinition } from '@/features/form/model/field-component-props';
import type { FieldController, FieldControllerProps, FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { BaseFieldNode } from '@/features/form/model/types/form-shape';
import type { AnyVueComponent } from '@/types/helpers';

import type { Options } from '@/shared/utils/options';

export type TokenSequenceTokenState<ChildState = unknown> = {
	fieldId: string;
	fieldState: ChildState;
};

/** The array contains exactly the currently active tokens, in query order. */
export type TokenSequenceFieldState = TokenSequenceTokenState[];

/** A field rendered and controlled inside a token without becoming a form-graph node. */
export type TokenSequenceChildFieldConfig = {
	id: string;
	controller: FieldController<string, any, any>;
	component: AnyVueComponent;
	config: object;
};

export type TokenSequenceFieldExtraProps = {
	fields: TokenSequenceChildFieldConfig[];
	selectorOptions: Options;
	defaultFieldId: string;
	minLength: number;
	maxLength: number;
	defaultLength: number;
	lengthDisplayName: string;
	selectorDisplayName: string;
	selectorPlaceholder?: string;
	persistKey: string;
};

export type TokenSequenceFieldDefinition = FieldDefinition<TokenSequenceFieldState, TokenSequenceFieldExtraProps>;
export type TokenSequenceFieldConfig = TokenSequenceFieldDefinition['nodeProps'];
/** Materialized for Vue's runtime prop extraction; equivalent to `TokenSequenceFieldDefinition['componentProps']`. */
export type TokenSequenceFieldComponentProps = FieldComponentProps<TokenSequenceFieldState> & TokenSequenceFieldExtraProps;

type TokenSequenceConfigLike = TokenSequenceFieldExtraProps & {
	id: string;
	variant?: BaseFieldNode['variant'];
};

export type TokenSequenceLengthBounds = {
	min: number;
	max: number;
	defaultValue: number;
};

function finiteInteger(value: number, fallback: number): number {
	return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

export function tokenSequenceLengthBounds(config: Pick<TokenSequenceFieldExtraProps, 'minLength' | 'maxLength' | 'defaultLength'>): TokenSequenceLengthBounds {
	const min = Math.max(0, finiteInteger(config.minLength, 0));
	const max = Math.max(min, finiteInteger(config.maxLength, min));
	const requestedDefault = finiteInteger(config.defaultLength, min);
	return {
		min,
		max,
		defaultValue: Math.min(max, Math.max(min, requestedDefault)),
	};
}

export function clampTokenSequenceLength(value: number, bounds: TokenSequenceLengthBounds): number {
	const normalized = finiteInteger(value, bounds.defaultValue);
	return Math.min(bounds.max, Math.max(bounds.min, normalized));
}

export function getTokenSequenceChild(config: Pick<TokenSequenceFieldExtraProps, 'fields' | 'defaultFieldId'>, fieldId?: string | null): TokenSequenceChildFieldConfig {
	const child = config.fields.find(field => field.id === fieldId) ?? config.fields.find(field => field.id === config.defaultFieldId) ?? config.fields[0];
	if (!child) throw new Error('Token sequence requires at least one selectable child field.');
	return child;
}

export function createTokenSequenceChildConfig(config: TokenSequenceConfigLike, child: TokenSequenceChildFieldConfig, index: number): FieldControllerProps<any> {
	return {
		...child.config,
		id: `${config.id}.${index}.${child.id}`,
		kind: 'field',
		variant: (child.config as { variant?: BaseFieldNode['variant'] }).variant ?? config.variant,
	};
}

export function createDefaultTokenSequenceToken(config: TokenSequenceConfigLike, runtime: FormRuntimeContext, index: number, fieldId: string = config.defaultFieldId): TokenSequenceTokenState {
	const child = getTokenSequenceChild(config, fieldId);
	return {
		fieldId: child.id,
		fieldState: child.controller.createDefaultState(createTokenSequenceChildConfig(config, child, index), runtime),
	};
}
