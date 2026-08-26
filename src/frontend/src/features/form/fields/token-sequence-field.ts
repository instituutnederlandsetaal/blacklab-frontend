import type { FieldComponentProps, FieldDefinition } from '@/features/form/model/field-component-props';
import type { FormFieldNodeOptions } from '@/features/form/model/form-field-node';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { BaseFieldNode, FormFieldNode } from '@/features/form/model/types/form-shape';

import { optionValues, type Options } from '@/shared/utils/options';

export type TokenSequenceTokenState = {
	fieldId: string;
	fieldState: unknown;
};

/** The array contains exactly the currently active tokens, in query order. */
export type TokenSequenceFieldState = TokenSequenceTokenState[];

export type TokenSequenceCreateField = (options: FormFieldNodeOptions & { annotationId: string }) => FormFieldNode;

export type TokenSequenceFieldExtraProps = {
	createField: TokenSequenceCreateField;
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

export type TokenSequenceFieldDefinition = FieldDefinition<TokenSequenceFieldState, TokenSequenceFieldExtraProps, 'lengthDisplayName' | 'selectorDisplayName' | 'selectorPlaceholder'>;
export type TokenSequenceFieldConfig = TokenSequenceFieldDefinition['nodeProps'];
/** Materialized for Vue's runtime prop extraction; equivalent to `TokenSequenceFieldDefinition['componentProps']`. */
export type TokenSequenceFieldComponentProps = FieldComponentProps<TokenSequenceFieldState> & TokenSequenceFieldExtraProps;

export type TokenSequenceConfigLike = Pick<TokenSequenceFieldConfig, 'createField' | 'selectorOptions' | 'defaultFieldId'> & {
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

export function resolveTokenSequenceFieldId(config: Pick<TokenSequenceFieldExtraProps, 'selectorOptions' | 'defaultFieldId'>, requestedFieldId?: string | null): string {
	const available = optionValues(config.selectorOptions);
	const fieldId = (requestedFieldId && available.includes(requestedFieldId) ? requestedFieldId : null) ?? (available.includes(config.defaultFieldId) ? config.defaultFieldId : available[0]);
	if (!fieldId) throw new Error('Token sequence requires at least one selectable child field.');
	return fieldId;
}

export function createTokenSequenceFieldNode(config: TokenSequenceConfigLike, index: number, annotationId: string): FormFieldNode {
	return config.createField({
		annotationId,
		id: `${config.id}.token.${index}.${annotationId}`,
		inheritedVariant: config.variant,
	});
}

export function createDefaultTokenSequenceToken(
	config: TokenSequenceConfigLike,
	runtime: FormRuntimeContext,
	index: number,
	requestedFieldId: string = config.defaultFieldId,
): TokenSequenceTokenState {
	const selectedFieldId = resolveTokenSequenceFieldId(config, requestedFieldId);
	const field = createTokenSequenceFieldNode(config, index, selectedFieldId);
	return {
		fieldId: selectedFieldId,
		fieldState: field.controller.createDefaultState(field, runtime),
	};
}
