<template>
	<FormSystem v-if="formBlueprint" :key="formBlueprint" :definition="formBlueprint" @submit="handleSubmit" />
</template>

<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useCurrentCorpus, useCurrentTagset } from '@/entities/corpus/model/corpus-context';
import { useCurrentConfig } from '@/entities/page-config/page-config';
import { FormSystem, restoreScopedFormState, type CompiledFormStateWithSummaries } from '@/features/form';
import { resolveSearchUiConfig } from '@/pages/search/config/search-ui-config';
import * as UIStore from '@/pages/search/config/ui-customization-store';
import { createSearchFormDefinition as createFormBlueprint } from '@/pages/search/form/model/search-form-builder';
import { formRouteFingerprint, readCanonicalFormQuery, replaceFormRouteQuery } from '@/pages/search/form/model/search-form-route';

import { useBlackLabApi } from '@/shared/api/useApi';
import { useI18n } from '@/shared/i18n';

const emit = defineEmits<{
	'url-parsed': [];
}>();

const corpus = useCurrentCorpus();
const tagset = useCurrentTagset();
const config = useCurrentConfig();
const api = useBlackLabApi();
const translate = useI18n();
const route = useRoute();
const router = useRouter();

const routeFormStateFingerprint = computed(() => formRouteFingerprint(route.query));
const routeFormQuery = shallowRef(route.query);
watch(routeFormStateFingerprint, () => {
	routeFormQuery.value = route.query;
}, { flush: 'sync', immediate: true });

const searchUi = computed(() => resolveSearchUiConfig(corpus, UIStore.getState()));
const formBlueprint = computed(() => {
	const blueprint = createFormBlueprint({ config, index: corpus, tagset: tagset.value }, searchUi.value, api, translate);
	const rawBlacklabParams = readCanonicalFormQuery(routeFormQuery.value);
	const formState = restoreScopedFormState(blueprint, routeFormQuery.value, rawBlacklabParams);
	blueprint.state.replaceState(formState);
	return blueprint;
});

function handleSubmit(_formId: string, state: CompiledFormStateWithSummaries) {
	// check if we have a pattern or not, decide results to show
	let resultsPage = 'hits';

	if (!state.patt) resultsPage = 'docs';

	void router.push({
		name: 'search-results',
		params: { ...route.params, results: resultsPage },
		query: replaceFormRouteQuery(route.query, state),
	});
}
</script>
