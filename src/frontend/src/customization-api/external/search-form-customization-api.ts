/** Application-side implementation of the public post-construction form API. */

import { searchFormIds } from '@/customization-api/shared/form/ids';
import type { createSearchFormNodeConstructors } from '@/customization-api/shared/form/node-constructors';
import type { FormBuilder } from '@/features/form';

import type { Corpus, SearchFormContainerNode, SearchFormCustomizationApi, SearchFormGraph, SearchFormNodeConstructors, SearchFormTranslate } from './external-api';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

type SearchFormGraphImplementation = Pick<FormBuilder, Extract<keyof SearchFormGraph, string>>;

export function createSearchFormCustomizationApi({
	builder,
	corpus,
	nodeConstructors,
	translate,
}: {
	builder: FormBuilder;
	corpus: Corpus;
	nodeConstructors: ReturnType<typeof createSearchFormNodeConstructors>;
	translate: SearchFormTranslate;
}): SearchFormCustomizationApi {
	// Keep the public graph member list tied to FormBuilder even though its nodes
	// need a boundary cast for the public node handle.
	const graph: SearchFormGraphImplementation = builder;
	const api = {
		...(nodeConstructors as unknown as SearchFormNodeConstructors),
		corpus,
		graph: graph as unknown as SearchFormGraph,
		ids: searchFormIds,
		newContainer: (id, config = {}) => builder.newContainer(id, ContainerRenderer, config) as unknown as SearchFormContainerNode,
		newForm: (id, config = {}) => builder.newForm(id, ContainerRenderer, config) as unknown as SearchFormContainerNode,
		translate,
	} satisfies SearchFormCustomizationApi;
	return api;
}
