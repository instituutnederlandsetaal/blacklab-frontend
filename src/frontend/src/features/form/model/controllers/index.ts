import type { ControllerRegistry, ControllerRegistryMap, ViewRegistryMap } from '@/features/form/model/builder/form-shape-builder';

import CheckboxField from '@/features/form/fields/generic/CheckboxField.vue';
import DateField from '@/features/form/fields/generic/DateField.vue';
import RadioField from '@/features/form/fields/generic/RadioField.vue';
import RangeField from '@/features/form/fields/generic/RangeField.vue';
import RangeMultipleFieldsField from '@/features/form/fields/generic/RangeMultipleFieldsField.vue';
import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';
import ParallelField from '@/features/form/fields/ParallelField.vue';
import RawCqlField from '@/features/form/fields/RawCqlField.vue';
import WithinField from '@/features/form/fields/WithinField.vue';

import { annotationSelectController, annotationTextController } from './annotation-controller';
import {
	filterAutocompleteController,
	filterCheckboxController,
	filterDateController,
	filterRadioController,
	filterRangeController,
	filterRangeMultipleFieldsController,
	filterSelectController,
	filterTextController,
} from './metadata-filter-controller';
import parallelController from './parallel-controller';
import expertQueryController from './raw-cql-query-controller';
import withinController from './within-controller';

export type RegisteredControllers = ControllerRegistryMap & {
	[filterAutocompleteController.kind]: typeof filterAutocompleteController;
	[filterCheckboxController.kind]: typeof filterCheckboxController;
	[filterDateController.kind]: typeof filterDateController;
	[filterRadioController.kind]: typeof filterRadioController;
	[filterRangeController.kind]: typeof filterRangeController;
	[filterRangeMultipleFieldsController.kind]: typeof filterRangeMultipleFieldsController;
	[filterSelectController.kind]: typeof filterSelectController;
	[filterTextController.kind]: typeof filterTextController;
	[withinController.kind]: typeof withinController;
	[expertQueryController.kind]: typeof expertQueryController;
	[parallelController.kind]: typeof parallelController;
	[annotationTextController.kind]: typeof annotationTextController;
	[annotationSelectController.kind]: typeof annotationSelectController;
};

export function registerBuiltinControllers<C extends ControllerRegistryMap, V extends ViewRegistryMap>(
	registry: ControllerRegistry<C, V>,
): asserts registry is ControllerRegistry<C & RegisteredControllers, V> {
	registry.registerController(filterAutocompleteController, TextField);
	registry.registerController(filterCheckboxController, CheckboxField);
	registry.registerController(filterDateController, DateField);
	registry.registerController(filterRadioController, RadioField);
	registry.registerController(filterRangeController, RangeField);
	registry.registerController(filterRangeMultipleFieldsController, RangeMultipleFieldsField);
	registry.registerController(filterSelectController, SelectField);
	registry.registerController(filterTextController, TextField);
	registry.registerController(withinController, WithinField);
	registry.registerController(expertQueryController, RawCqlField);
	registry.registerController(parallelController, ParallelField);
	registry.registerController(annotationTextController, TextField);
	registry.registerController(annotationSelectController, SelectField);
}

export {
	annotationSelectController,
	annotationTextController,
	filterAutocompleteController,
	filterCheckboxController,
	filterDateController,
	filterRadioController,
	filterRangeController,
	filterRangeMultipleFieldsController,
	filterSelectController,
	filterTextController,
	withinController,
	expertQueryController,
	parallelController,
};
