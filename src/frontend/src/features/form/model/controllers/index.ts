import type { ControllerRegistry, ControllerRegistryMap, ViewRegistryMap } from '@/features/form/model/builder/form-shape-builder';

import { annotationAutocompleteController, annotationSelectController, annotationTextController } from './annotation-controller';
import {
    filterAutocompleteController,
    filterCheckboxController,
    filterDateController,
    filterRadioController,
    filterRangeController,
    filterRangeMultipleFieldsController,
    filterSelectController,
    filterTextController,
    resolveMetadataFilterController,
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
	[annotationAutocompleteController.kind]: typeof annotationAutocompleteController;
};

export function registerBuiltinControllers<C extends ControllerRegistryMap, V extends ViewRegistryMap>(
	registry: ControllerRegistry<C, V>,
): asserts registry is ControllerRegistry<C & RegisteredControllers, V> {
	registry.registerController(filterAutocompleteController);
	registry.registerController(filterCheckboxController);
	registry.registerController(filterDateController);
	registry.registerController(filterRadioController);
	registry.registerController(filterRangeController);
	registry.registerController(filterRangeMultipleFieldsController);
	registry.registerController(filterSelectController);
	registry.registerController(filterTextController);
	registry.registerController(withinController);
	registry.registerController(expertQueryController);
	registry.registerController(parallelController);
	registry.registerController(annotationTextController);
	registry.registerController(annotationSelectController);
	registry.registerController(annotationAutocompleteController);
}

export {
	annotationAutocompleteController,
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
	resolveMetadataFilterController,
	withinController,
	expertQueryController,
	parallelController,
};
