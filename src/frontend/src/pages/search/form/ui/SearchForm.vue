<template>
	<FormSystem :key="def.instanceKey" :context="def.context" :definition="def.definition" :initial-state="def.initialState" @submit="handleSubmit" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter, type LocationQueryValue } from 'vue-router';

import { useCurrentCorpus, useCurrentTagset } from '@/entities/corpus/model/corpus-context';
import { useCurrentConfig } from '@/entities/page-config/page-config';
import { encodeScopedFormQuery, FORM_QUERY_PREFIX, FormSystem, restoreScopedFormState, type CanonicalBlackLabFormParameters, type PersistableSubmittableFormState } from '@/features/form';
import { createSearchFormDefinition } from '@/pages/search/form/model/search-form-builder';

import { useI18n } from '@/shared/i18n';

const emit = defineEmits<{
	'url-parsed': [];
}>();

const corpus = useCurrentCorpus();
const tagset = useCurrentTagset();
const config = useCurrentConfig();
const translate = useI18n();
const route = useRoute();
const router = useRouter();

const queryKeys = {
	cql: 'patt',
	filter: 'filter',
	searchField: 'searchfield',
} as const;

function getQueryValue(value: LocationQueryValue | LocationQueryValue[] | undefined) {
	return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function getCanonicalQuery(): CanonicalBlackLabFormParameters {
	return {
		patt: getQueryValue(route.query[queryKeys.cql]),
		filter: getQueryValue(route.query[queryKeys.filter]),
		searchField: getQueryValue(route.query[queryKeys.searchField]),
	};
}

function isFormOwnedQueryKey(key: string) {
	return key.startsWith(FORM_QUERY_PREFIX);
}

function isCanonicalFormQueryKey(key: string) {
	return key === queryKeys.cql || key === queryKeys.filter || key === queryKeys.searchField;
}

function formRouteKey() {
	return Object.entries(route.query)
		.filter(([key]) => isFormOwnedQueryKey(key) || isCanonicalFormQueryKey(key))
		.map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : (value ?? '')}`)
		.sort()
		.join('&');
}

const def = computed(() => {
	const { context, definition } = createSearchFormDefinition({ config: config, index: corpus, tagset: tagset.value }, translate);
	const restored = restoreScopedFormState(definition, context, route.query, getCanonicalQuery());
	emit('url-parsed');

	return {
		context,
		definition,
		initialState: restored.state,
		instanceKey: `${definition.schemaVersion}:${formRouteKey()}`,
	};
});

function handleSubmit(_formId: string, state: PersistableSubmittableFormState) {
	const scopedFormQuery = encodeScopedFormQuery(def.value.definition, def.value.context, state);
	const query: Record<string, string | string[]> = {};

	for (const [key, value] of Object.entries(route.query)) {
		if (isFormOwnedQueryKey(key) || isCanonicalFormQueryKey(key) || value == null) continue;
		query[key] = Array.isArray(value) ? value.filter((item): item is string => item != null) : value;
	}

	if (state.cql) query[queryKeys.cql] = state.cql;
	if (state.filter) query[queryKeys.filter] = state.filter;
	if (state.searchField) query[queryKeys.searchField] = state.searchField;

	for (const [key, value] of Object.entries(scopedFormQuery)) {
		if (value == null) continue;
		query[key] = value;
	}

	void router.push({ query });
}
</script>
