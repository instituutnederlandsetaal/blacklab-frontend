import type { UiConfig } from '@/features/form/model/types/form-shape';
import type { Translate } from '@/shared/i18n';
import { escapeRegex } from '@/shared/utils/string-utils';
import type { NormalizedAnnotation, Tagset } from '@/types/apptypes';

export type AnnotationReference = Pick<NormalizedAnnotation, 'id' | 'defaultDisplayName' | 'defaultDescription'>;

export type AnnotationPosFieldConfig = UiConfig & {
	annotation: AnnotationReference;
	subAnnotations?: Record<string, AnnotationReference>;
	tagset: Tagset;
	groupId?: string;
	modalSize?: 'xs' | 'sm' | 'md' | 'lg' | 'auto' | 'fullscreen';
	showQueryPreview?: boolean;
};

export type AnnotationPosFieldState = {
	annotationValue: string | null;
	selected: Record<string, boolean>;
};

const EMPTY_SUBANNOTATION_VALUES: Tagset['subAnnotations'][string]['values'] = [];

export function createDefaultAnnotationPosFieldState(): AnnotationPosFieldState {
	return {
		annotationValue: null,
		selected: {},
	};
}

export function cloneAnnotationPosFieldState(state: AnnotationPosFieldState): AnnotationPosFieldState {
	return {
		annotationValue: state.annotationValue,
		selected: { ...state.selected },
	};
}

export function createAnnotationPosSelectionKey(annotationValue: string, subAnnotationId: string, subAnnotationValue: string): string {
	return `${annotationValue}/${subAnnotationId}/${subAnnotationValue}`;
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

type AnnotationPosQueryPart = {
	annotationId: string;
	value: string;
};

function formatQueryPart(part: AnnotationPosQueryPart): string {
	return `${part.annotationId}="${part.value}"`;
}

export function getAnnotationPosQueryParts(config: AnnotationPosFieldConfig, state: AnnotationPosFieldState): AnnotationPosQueryPart[] {
	const selectedValue = findTagsetValue(config.tagset, state.annotationValue);
	if (!selectedValue) return [];

	const parts: AnnotationPosQueryPart[] = [
		{
			annotationId: config.annotation.id,
			value: escapeRegex(selectedValue.value),
		},
	];

	selectedValue.subAnnotationIds.forEach(subAnnotationId => {
		const selectedValues = getVisibleSubAnnotationValues(config.tagset, selectedValue.value, subAnnotationId)
			.filter(subValue => state.selected[createAnnotationPosSelectionKey(selectedValue.value, subAnnotationId, subValue.value)])
			.map(subValue => escapeRegex(subValue.value));

		if (selectedValues.length) {
			parts.push({
				annotationId: subAnnotationId,
				value: selectedValues.join('|'),
			});
		}
	});

	return parts;
}

export function buildAnnotationPosQueryPreview(config: AnnotationPosFieldConfig, state: AnnotationPosFieldState): string {
	return getAnnotationPosQueryParts(config, state).map(formatQueryPart).join('&');
}

export function buildAnnotationPosPattern(config: AnnotationPosFieldConfig, state: AnnotationPosFieldState): string | null {
	const parts = getAnnotationPosQueryParts(config, state);
	if (!parts.length) return null;
	return `[${parts.map(formatQueryPart).join(' & ')}]`;
}

export function summarizeAnnotationPosState(config: AnnotationPosFieldConfig, state: AnnotationPosFieldState, translate?: Translate): string {
	const selectedValue = findTagsetValue(config.tagset, state.annotationValue);
	if (!selectedValue) return '';

	const detailParts = selectedValue.subAnnotationIds
		.map(subAnnotationId => {
			const selectedValues = getVisibleSubAnnotationValues(config.tagset, selectedValue.value, subAnnotationId).filter(subValue =>
				state.selected[createAnnotationPosSelectionKey(selectedValue.value, subAnnotationId, subValue.value)],
			);

			if (!selectedValues.length) return null;

			const subAnnotation = config.subAnnotations?.[subAnnotationId] ?? {
				id: subAnnotationId,
				defaultDisplayName: subAnnotationId,
				defaultDescription: undefined,
			};

			const label = translate?.$tAnnotDisplayName(subAnnotation) ?? subAnnotation.defaultDisplayName ?? subAnnotation.id;
			const values = selectedValues.map(value => value.displayName || value.value).join(', ');
			return `${label}: ${values}`;
		})
		.filter((value): value is string => !!value);

	return detailParts.length ? `${selectedValue.displayName}; ${detailParts.join('; ')}` : selectedValue.displayName;
}