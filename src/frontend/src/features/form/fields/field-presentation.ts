import { computed } from 'vue';

import type { FieldComponentProps } from '@/features/form/model/field-component-props';

type FieldPresentationOptions = {
	rootClass?: string;
	formGroup?: boolean;
	horizontal?: boolean;
};

/** Standard DOM attributes and reusable layout/size classes derived from field presentation props. */
export function useFieldPresentation(props: FieldComponentProps<unknown>, options: FieldPresentationOptions = {}) {
	return computed(() => {
		const size = props.size === 'large' ? 'lg' : props.size === 'small' ? 'sm' : null;
		const horizontal = options.horizontal ?? props.layout === 'horizontal';
		const formGroupClass = ['form-group', size && `form-group-${size}`];

		return {
			inputId: `${props.htmlId}_value`,
			rootAttrs: {
				id: props.htmlId,
				title: props.title,
				class: [(options.formGroup !== false || horizontal) && formGroupClass, horizontal && 'blf-field-horizontal', 'blf-field', options.rootClass, props.class],
				style: props.style,
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
