<template>
	<FormSystem v-if="definition && context" :key="formKey" :context="context" :definition="definition" :initial-state="initialState" @ready="handleReady" @submit="handleSubmit" />
</template>

<script setup lang="ts">
import { nextTick, shallowRef, watchEffect } from 'vue';
import { useRoute, useRouter, type LocationQueryValue } from 'vue-router';

import { useCurrentCorpusData } from '@/entities/corpus/model/corpus-context';
import {
	cloneFormState,
	createFormState,
	decodeSubmittedSnapshot,
	encodeSubmittedForm,
	FormSystem,
	type EncodedPersistableFormState,
	type FormRuntimeContext,
	type FormState,
	type FormSystemDefinition,
	type FormSystemRuntime,
	type PersistableSubmittableFormState,
} from '@/features/form';
import { getAllNodes } from '@/features/form/model/form-utils';
import { createSearchFormDefinition } from '@/pages/search/form/model/search-form-builder';

import { useI18n } from '@/shared/i18n';

const emit = defineEmits<{
	'page-bootstrapped': [];
	'page-url-parsed': [];
}>();

const queryKeys = {
	cql: 'blfFormCql',
	filter: 'blfFormFilter',
	formId: 'blfFormId',
	searchField: 'blfFormField',
	state: 'blfFormState',
	schemaVersion: 'blfFormVersion',
} as const;

function getQueryValue(value: LocationQueryValue | LocationQueryValue[] | undefined) {
	return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

const currentCorpusData = useCurrentCorpusData();
const definition = shallowRef<FormSystemDefinition | null>(null);
const context = shallowRef<FormRuntimeContext | null>(null);
const formKey = shallowRef(0);
const initialState = shallowRef<FormState>();
const route = useRoute();
const router = useRouter();
const translate = useI18n();

function replaceSubmittedState(snapshot: EncodedPersistableFormState | null) {
	const nextValues = {
		[queryKeys.cql]: snapshot?.cql ?? null,
		[queryKeys.filter]: snapshot?.filter ?? null,
		[queryKeys.formId]: snapshot?.form ?? null,
		[queryKeys.searchField]: snapshot?.searchField ?? null,
		[queryKeys.state]: snapshot?.state ?? null,
		[queryKeys.schemaVersion]: snapshot?.v ?? null,
	} as const;

	const changed = Object.entries(nextValues).some(([key, value]) => getQueryValue(route.query[key]) !== value);
	if (!changed) return;

	const nextQuery = { ...route.query };
	for (const [key, value] of Object.entries(nextValues)) {
		if (value == null || value === '') delete nextQuery[key];
		else nextQuery[key] = value;
	}

	void router.replace({ query: nextQuery });
}

function handleReady(runtime: FormSystemRuntime) {
	runtime.onReset(() => replaceSubmittedState(null));
	void nextTick(() => emit('page-bootstrapped'));
}

function handleSubmit(_formId: string, snapshot: PersistableSubmittableFormState) {
	replaceSubmittedState(encodeSubmittedForm(snapshot));
}

watchEffect(() => {
	if (!currentCorpusData.isLoaded() || !currentCorpusData.value.index) return;

	const nextForm = createSearchFormDefinition(currentCorpusData.value, translate);
	const nextInitialState = createFormState(nextForm.definition, nextForm.context);
	const restored = decodeSubmittedSnapshot({
		cql: getQueryValue(route.query[queryKeys.cql]) ?? undefined,
		filter: getQueryValue(route.query[queryKeys.filter]) ?? undefined,
		form: getQueryValue(route.query[queryKeys.formId]) ?? '',
		searchField: getQueryValue(route.query[queryKeys.searchField]) ?? undefined,
		state: getQueryValue(route.query[queryKeys.state]) ?? '',
		v: getQueryValue(route.query[queryKeys.schemaVersion]) ?? '',
	});
	const validFormIds = new Set(getAllNodes(nextForm.definition.root, 'form').map(form => form.id));

	if (restored && restored.schemaVersion === nextForm.definition.schemaVersion && validFormIds.has(restored.formId)) {
		const restoredState = cloneFormState(restored.state);
		if (nextForm.definition.root.kind === 'container') {
			restoredState.uiState.activeContainers[nextForm.rootId] = restored.formId;
		}
		initialState.value = restoredState;
	} else {
		initialState.value = nextInitialState;
	}

	context.value = nextForm.context;
	definition.value = nextForm.definition;
	formKey.value += 1;
	emit('page-url-parsed');
});
</script>
