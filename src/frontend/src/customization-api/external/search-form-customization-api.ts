/** Application-side implementation of the public post-construction form API. */

import { searchFormIds } from '@/customization-api/shared/form/ids';
import type { createSearchFormNodeConstructors } from '@/customization-api/shared/form/node-constructors';
import type { AnyFormTarget, FormBuilder, FormNode } from '@/features/form';
import { annotationSelectController, annotationTextController } from '@/features/form/model/controllers/annotation-controller';
import {
	filterCheckboxController,
	filterDateController,
	filterRadioController,
	filterRangeController,
	filterSelectController,
	filterTextController,
} from '@/features/form/model/controllers/metadata-filter-controller';
import { queryBuilderController } from '@/features/form/model/controllers/query-builder-controller';
import { expertQueryController } from '@/features/form/model/controllers/raw-cql-query-controller';
import { withinController } from '@/features/form/model/controllers/within-controller';
import { createFormContainerNode, createFormFieldNode, createFormNode } from '@/features/form/model/form-node';
import { blackLabSupportsCollocations } from '@/types/blacklabtypes';

import type { Corpus, SearchFormContainerNode, SearchFormCustomizationApi, SearchFormGraph, SearchFormNodeConstructors, SearchFormTranslate } from './external-api';

import CheckboxField from '@/features/form/fields/generic/CheckboxField.vue';
import DateField from '@/features/form/fields/generic/DateField.vue';
import RadioField from '@/features/form/fields/generic/RadioField.vue';
import RangeField from '@/features/form/fields/generic/RangeField.vue';
import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';
import QueryBuilderField from '@/features/form/fields/QueryBuilderField.vue';
import RawCqlField from '@/features/form/fields/RawCqlField.vue';
import WithinField from '@/features/form/fields/WithinField.vue';
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
	const newForm: SearchFormCustomizationApi['newForm'] = (id, config = {}, children = []) => {
		const target = (config as typeof config & { target?: AnyFormTarget }).target;
		if (target?.supportedEndpoints.includes('collocations') && !blackLabSupportsCollocations(corpus.runtimeVersion)) {
			throw new Error(`Collocation form target '${id}' requires BlackLab 5 or newer, or dev; this server reports '${corpus.runtimeVersion}'.`);
		}
		return createFormNode(id, ContainerRenderer, config, children as unknown as readonly FormNode[]) as unknown as SearchFormContainerNode;
	};
	const api = {
		...(nodeConstructors as unknown as SearchFormNodeConstructors),
		// Plain TypeScript tooling sees the .vue shim; the public types use each SFC's declared props and event.
		components: { TextField, SelectField, RangeField, CheckboxField, RadioField, DateField, RawCqlField, QueryBuilderField, WithinField } as unknown as SearchFormCustomizationApi['components'],
		controllers: {
			annotationTextController,
			annotationSelectController,
			filterTextController,
			filterSelectController,
			filterRangeController,
			filterCheckboxController,
			filterRadioController,
			filterDateController,
			expertQueryController,
			queryBuilderController,
			withinController,
		},
		corpus,
		graph: graph as unknown as SearchFormGraph,
		ids: searchFormIds,
		newField: createFormFieldNode as unknown as SearchFormCustomizationApi['newField'],
		newContainer: (id, config = {}, children = []) => createFormContainerNode(id, ContainerRenderer, config, children as unknown as readonly FormNode[]) as unknown as SearchFormContainerNode,
		newForm,
		translate,
	} satisfies SearchFormCustomizationApi;
	return api;
}
