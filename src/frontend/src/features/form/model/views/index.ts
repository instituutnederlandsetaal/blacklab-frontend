import type { ControllerRegistry, ControllerRegistryMap, ViewRegistryMap } from '@/features/form/model/builder/form-shape-builder';

import headingView from './heading-view';
import summaryView from './summary-view';
import totalsView from './totals-view';

export type RegisteredViews = ViewRegistryMap & {
	[headingView.kind]: typeof headingView;
	[summaryView.kind]: typeof summaryView;
	[totalsView.kind]: typeof totalsView;
};

export function registerBuiltinViews<C extends ControllerRegistryMap, V extends ViewRegistryMap>(
	controllerRegistry: ControllerRegistry<C, V>,
): asserts controllerRegistry is ControllerRegistry<C, V & RegisteredViews> {
	controllerRegistry.registerView(headingView);
	controllerRegistry.registerView(summaryView);
	controllerRegistry.registerView(totalsView);
}

export { headingView, summaryView, totalsView };
