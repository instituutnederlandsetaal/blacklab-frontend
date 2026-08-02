import type { FieldComponentProps, FieldDefinition } from '@/features/form/model/field-component-props';
import type { NormalizedAnnotation, Tagset } from '@/types/apptypes';

import { optionText, type OptionText } from '@/shared/utils/options';

export type AnnotationReference = Pick<NormalizedAnnotation, 'id' | 'defaultDisplayName' | 'defaultDescription'> & {
	/** Deferred display label, supplied by graph builders that support localization. */
	label?: OptionText;
};

/** Annotation predicates joined by `&` in the generated CQL. */
export type AnnotationPosFieldState = Record<string, string[]>;
export type AnnotationPosFieldExtraProps = {
	annotation: AnnotationReference;
	subAnnotations?: Record<string, AnnotationReference>;
	tagset: Tagset;
	modalSize?: 'xs' | 'sm' | 'md' | 'lg' | 'auto' | 'fullscreen';
	/** @deprecated Query previews are now provided by the compiled query summary. */
	showQueryPreview?: boolean;
};
export type AnnotationPosFieldDefinition = FieldDefinition<AnnotationPosFieldState, AnnotationPosFieldExtraProps>;
export type AnnotationPosFieldConfig = AnnotationPosFieldDefinition['nodeProps'];
/** Materialized for Vue's runtime prop extraction; equivalent to `AnnotationPosFieldDefinition['componentProps']`. */
export type AnnotationPosFieldComponentProps = FieldComponentProps<AnnotationPosFieldState> & AnnotationPosFieldExtraProps;

const EMPTY_SUBANNOTATION_VALUES: Tagset['subAnnotations'][string]['values'] = [];

export function createDefaultAnnotationPosFieldState(): AnnotationPosFieldState {
	return {};
}

export function cloneAnnotationPosFieldState(state: AnnotationPosFieldState): AnnotationPosFieldState {
	return Object.fromEntries(Object.entries(state).map(([annotationId, values]) => [annotationId, [...values]]));
}

export function findTagsetValue(tagset: Tagset, value: string | null | undefined) {
	if (!value) return null;
	return tagset.values[value] ?? Object.values(tagset.values).find(entry => entry.value === value) ?? null;
}

export function getVisibleSubAnnotationValues(tagset: Tagset, annotationValue: string | null, subAnnotationId: string): Tagset['subAnnotations'][string]['values'] {
	const selectedValue = findTagsetValue(tagset, annotationValue);
	if (!selectedValue) return EMPTY_SUBANNOTATION_VALUES;

	const subAnnotation = tagset.subAnnotations[subAnnotationId];
	if (!subAnnotation) return EMPTY_SUBANNOTATION_VALUES;

	return subAnnotation.values.filter(subValue => !subValue.pos || subValue.pos.includes(selectedValue.value));
}

export function annotationReferenceLabel(annotation: AnnotationReference): string {
	return optionText(annotation.label) ?? annotation.defaultDisplayName ?? annotation.id;
}

export function summarizeAnnotationPosState(config: AnnotationPosFieldConfig, state: AnnotationPosFieldState): string {
	const [annotationValue] = state[config.annotation.id] ?? [];
	const selectedValue = findTagsetValue(config.tagset, annotationValue);
	if (!selectedValue) return '';

	const detailParts = selectedValue.subAnnotationIds
		.map(subAnnotationId => {
			const selectedValues = getVisibleSubAnnotationValues(config.tagset, selectedValue.value, subAnnotationId).filter(subValue => state[subAnnotationId]?.includes(subValue.value));

			if (!selectedValues.length) return null;

			const subAnnotation = config.subAnnotations?.[subAnnotationId] ?? {
				id: subAnnotationId,
				defaultDisplayName: subAnnotationId,
				defaultDescription: '',
			};

			const label = annotationReferenceLabel(subAnnotation);
			const values = selectedValues.map(value => value.displayName || value.value).join(', ');
			return `${label}: ${values}`;
		})
		.filter((value): value is string => !!value);

	return detailParts.length ? `${selectedValue.displayName}; ${detailParts.join('; ')}` : selectedValue.displayName;
}
