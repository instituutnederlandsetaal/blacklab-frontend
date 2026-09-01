/** Application-side implementation of the public post-construction form API. */

import { searchFormIds } from '@/customization-api/shared/form/ids';
import type { createSearchFormNodeConstructors } from '@/customization-api/shared/form/node-constructors';
import type { AnyFormTarget, FormBuilder } from '@/features/form';
import { blackLabSupportsCollocations } from '@/types/blacklabtypes';

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
	const newForm: SearchFormCustomizationApi['newForm'] = (id, config = {}) => {
		const target = (config as typeof config & { target?: AnyFormTarget }).target;
		if (target?.supportedEndpoints.includes('collocations') && !blackLabSupportsCollocations(corpus.blacklabVersion)) {
			throw new Error(`Collocation form target '${id}' requires BlackLab 5 or newer, or dev; this corpus reports '${corpus.blacklabVersion}'.`);
		}
		return builder.newForm(id, ContainerRenderer, config) as unknown as SearchFormContainerNode;
	};
	const api = {
		...(nodeConstructors as unknown as SearchFormNodeConstructors),
		corpus,
		graph: graph as unknown as SearchFormGraph,
		ids: searchFormIds,
		newContainer: (id, config = {}) => builder.newContainer(id, ContainerRenderer, config) as unknown as SearchFormContainerNode,
		newForm,
		translate,
	} satisfies SearchFormCustomizationApi;
	return api;
}
