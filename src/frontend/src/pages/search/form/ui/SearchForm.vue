<template>
	<FormSystem :context="def.context" :definition="def.definition" :initial-state="def.initialState" @submit="handleSubmit" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, type LocationQueryValue } from 'vue-router';

import { useCurrentCorpus, useCurrentTagset } from '@/entities/corpus/model/corpus-context';
import { useCurrentConfig } from '@/entities/page-config/page-config';
import { decodeSubmittedSnapshot, FormSystem, type PersistableSubmittableFormState } from '@/features/form';
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

const queryKeys = {
	cql: 'patt',
	filter: 'blfFormFilter',
	formId: 'blfFormId',
	searchField: 'blfFormField',
	state: 'blfFormState',
	schemaVersion: 'blfFormVersion',
} as const;

function getQueryValue(value: LocationQueryValue | LocationQueryValue[] | undefined) {
	return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
const def = computed(() => {
	const { context, definition } = createSearchFormDefinition({ config: config, index: corpus, tagset: tagset.value }, translate);
	// const state = createFormState(definition, context);
	// parse state
	// parse URL

	const initialState = decodeSubmittedSnapshot({
		cql: getQueryValue(route.query[queryKeys.cql]) ?? undefined,
		filter: getQueryValue(route.query[queryKeys.filter]) ?? undefined,
		form: getQueryValue(route.query[queryKeys.formId]) ?? '',
		searchField: getQueryValue(route.query[queryKeys.searchField]) ?? undefined,
		state: getQueryValue(route.query[queryKeys.state]) ?? '',
		v: getQueryValue(route.query[queryKeys.schemaVersion]) ?? '',
	});
	emit('url-parsed');

	const useInitialState = initialState && initialState.schemaVersion === definition.schemaVersion;
	return {
		context,
		definition,
		initialState: useInitialState ? initialState.state : undefined,
	};
});

function handleSubmit(formId: string, state: PersistableSubmittableFormState) {
	// todo decide where to sync with router.
}
</script>
