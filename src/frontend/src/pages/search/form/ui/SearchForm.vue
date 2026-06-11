<template>
	<FormSystem v-if="formBlueprint" :context="formBlueprint.context" :definition="formBlueprint.definition" @ready="handleReady" @submit="handleSubmit" />
	<pre>{{ form?.state }}</pre>
</template>

<script setup lang="ts">
import { computedWithControl } from '@vueuse/core';
import { computed, ref, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useCurrentCorpus, useCurrentTagset } from '@/entities/corpus/model/corpus-context';
import { useCurrentConfig } from '@/entities/page-config/page-config';
import { FormSystem, restoreScopedFormState, type CompiledFormStateWithSummaries, type FormSystemRuntime } from '@/features/form';
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
const form = ref<FormSystemRuntime>(); // passed up from below when ready

function handleReady(runtime: FormSystemRuntime) {
	form.value = runtime;
}

const routeFormStateFingerprint = computed(() => formRouteFingerprint(route.query));
const decodedUrl = computedWithControl(routeFormStateFingerprint, () => {
	const rawBlacklabParams = readCanonicalFormQuery(route.query);
	const formState = restoreScopedFormState(formBlueprint.value.definition, formBlueprint.value.context, route.query, rawBlacklabParams);
	return formState;
});

watchEffect(() => {
	if (!form.value) return;
	// form has initialized, decode the URL
	form.value.replaceState(decodedUrl.value);
});

function handleSubmit(_formId: string, state: CompiledFormStateWithSummaries) {
	void router.push({
		query: replaceFormRouteQuery(route.query, state),
	});
}
</script>
