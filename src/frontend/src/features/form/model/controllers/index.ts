import type { ControllerRegistry, ControllerRegistryMap, ViewRegistryMap } from '@/features/form/model/builder/form-shape-builder';

import annotationController from './annotation-controller';
import filterController from './metadata-filter-controller';
import parallelController from './parallel-controller';
import expertQueryController from './raw-cql-query-controller';
import withinController from './within-controller';

export interface RegisteredControllers {
	[filterController.kind]: typeof filterController;
	[withinController.kind]: typeof withinController;
	[expertQueryController.kind]: typeof expertQueryController;
	[parallelController.kind]: typeof parallelController;
	[annotationController.kind]: typeof annotationController;
}

export function registerBuiltinControllers<C extends ControllerRegistryMap, V extends ViewRegistryMap>(
	registry: ControllerRegistry<C, V>,
): asserts registry is ControllerRegistry<C & RegisteredControllers, V> {
	registry.registerController(filterController);
	registry.registerController(withinController);
	registry.registerController(expertQueryController);
	registry.registerController(parallelController);
	registry.registerController(annotationController);
}

export { filterController, withinController, expertQueryController, parallelController, annotationController };
