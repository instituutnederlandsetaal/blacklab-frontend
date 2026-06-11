<template>
	<FormSystem v-if="formBlueprint" :definition="formBlueprint" @submit="handleSubmit" />
</template>

<script setup lang="ts">
import { computedWithControl } from '@vueuse/core';
import { computed, watchEffect } from 'vue';
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

const searchUi = computed(() => resolveSearchUiConfig(corpus, UIStore.getState()));
const formBlueprint = computed(() => createFormBlueprint({ config, index: corpus, tagset: tagset.value }, searchUi.value, api, translate));

const routeFormStateFingerprint = computed(() => formRouteFingerprint(route.query));
const decodedUrl = computedWithControl(routeFormStateFingerprint, () => {
	const rawBlacklabParams = readCanonicalFormQuery(route.query);
	const formState = restoreScopedFormState(formBlueprint.value, route.query, rawBlacklabParams);
	return formState;
});

watchEffect(() => {
	formBlueprint.value.state.replaceState(decodedUrl.value);
});

function handleSubmit(_formId: string, state: CompiledFormStateWithSummaries) {
	void router.push({
		query: replaceFormRouteQuery(route.query, state),
	});
}
</script>
