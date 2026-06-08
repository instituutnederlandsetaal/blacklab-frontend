<template>
	<FormSystem v-if="host" :key="host.lifecycleGeneration" :context="host.context" :definition="host.definition" :initial-state="host.initialState" @ready="handleReady" @submit="handleSubmit" />
</template>

<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useCurrentCorpus, useCurrentTagset } from '@/entities/corpus/model/corpus-context';
import { useCurrentConfig } from '@/entities/page-config/page-config';
import {
	encodeScopedFormQuery,
	FormSystem,
	restoreScopedFormState,
	type FormRuntimeContext,
	type FormState,
	type FormSystemDefinition,
	type FormSystemRuntime,
	type PersistableSubmittableFormState,
} from '@/features/form';
import { createSearchFormDefinition } from '@/pages/search/form/model/search-form-builder';
import { formRouteFingerprint, readCanonicalFormQuery, replaceFormRouteQuery } from '@/pages/search/form/model/search-form-route';

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

type FormHost = {
	context: FormRuntimeContext;
	definition: FormSystemDefinition;
	initialState: FormState;
	lifecycleGeneration: number;
};

const definitionBundle = computed(() => createSearchFormDefinition({ config, index: corpus, tagset: tagset.value }, translate));
const host = shallowRef<FormHost | null>(null);
const runtime = shallowRef<FormSystemRuntime | null>(null);
let lifecycleGeneration = 0;
let lastAppliedRouteFingerprint = '';
let hasEmittedUrlParsed = false;
let pendingRouteState: FormState | null = null;

function restoreCurrentRoute(definition: FormSystemDefinition, context: FormRuntimeContext) {
	return restoreScopedFormState(definition, context, route.query, readCanonicalFormQuery(route.query));
}

watch(
	definitionBundle,
	({ context, definition }) => {
		runtime.value = null;
		pendingRouteState = null;
		lastAppliedRouteFingerprint = formRouteFingerprint(route.query);
		host.value = {
			context,
			definition,
			initialState: restoreCurrentRoute(definition, context).state,
			lifecycleGeneration: ++lifecycleGeneration,
		};
		if (!hasEmittedUrlParsed) {
			hasEmittedUrlParsed = true;
			emit('url-parsed');
		}
	},
	{ immediate: true, flush: 'sync' },
);

watch(
	() => formRouteFingerprint(route.query),
	fingerprint => {
		if (!host.value || fingerprint === lastAppliedRouteFingerprint) return;
		lastAppliedRouteFingerprint = fingerprint;
		const restored = restoreCurrentRoute(host.value.definition, host.value.context);
		if (runtime.value) runtime.value.replaceState(restored.state);
		else {
			pendingRouteState = restored.state;
			host.value = { ...host.value, initialState: restored.state };
		}
	},
	{ flush: 'sync' },
);

function handleReady(nextRuntime: FormSystemRuntime) {
	runtime.value = nextRuntime;
	if (pendingRouteState) {
		nextRuntime.replaceState(pendingRouteState);
		pendingRouteState = null;
	}
}

function handleSubmit(_formId: string, state: PersistableSubmittableFormState) {
	if (!host.value) return;
	const scopedFormQuery = encodeScopedFormQuery(host.value.definition, host.value.context, state);
	void router.push({
		query: replaceFormRouteQuery(route.query, scopedFormQuery, state),
	});
}
</script>
