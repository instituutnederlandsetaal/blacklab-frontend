import { computed } from 'vue';

import type { FieldComponentProps } from '@/features/form/model/field-component-props';
import { decodeVariants } from '@/features/form/model/form-utils';

type FieldPresentationOptions = {
	rootClass?: string;
	formGroup?: boolean;
	horizontal?: boolean;
};

/** Standard DOM attributes and reusable layout/size classes derived from field presentation props. */
export function useFieldPresentation(props: FieldComponentProps<unknown>, options: FieldPresentationOptions = {}) {
	return computed(() => {
		const variants = decodeVariants(props.variant);
		const size = variants.large ? 'lg' : variants.small ? 'sm' : null;
		const horizontal = options.horizontal ?? Boolean(variants.horizontal);
		const formGroupClass = ['form-group', size && `form-group-${size}`];

		return {
			variants,
			inputId: `${props.htmlId}_value`,
			rootAttrs: {
				id: props.htmlId,
				title: props.title,
				class: [(options.formGroup !== false || horizontal) && formGroupClass, horizontal && 'blf-field-horizontal', 'blf-field', options.rootClass, props.class, variants],
			},
			formGroupClass,
			labelClass: horizontal && 'blf-field-label',
			controlsClass: horizontal && 'blf-field-controls',
			inputClass: size && `input-${size}`,
			buttonClass: size && `btn-${size}`,
			buttonGroupClass: size && `btn-group-${size}`,
		};
	});
}
