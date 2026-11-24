<template>
	<FormSystem v-if="runtime" :runtime="runtime" :inert="!formInteractive || undefined" @submit="submit" @reset="formBinding.reset" :class="containerClass">
		<template #actions>
			<button type="button" class="btn btn-default btn-lg" @click="historyOpen = true">{{ $t('queryForm.history') }}</button>
			<button type="button" class="btn btn-default btn-lg" @click="settingsOpen = true"><span class="glyphicon glyphicon-cog" style="vertical-align: text-top"></span></button>
		</template>
	</FormSystem>
	<QueryFormSettings v-if="settingsOpen" id="settings" @close="settingsOpen = false" />
	<History v-if="historyOpen" id="history" @close="historyOpen = false" />
</template>

<script setup lang="ts">
import { stripIndent } from 'common-tags';
import { computed, onScopeDispose, ref, watch } from 'vue';

import { createFilteredResultCountLoader } from '@/api/async/logic/result-count/result-count-from-filters';
import { useLayout } from '@/app/state/layout';
import { useCorpus } from '@/app/state/useCorpusContext';
import { searchFormIds } from '@/customization-api/shared/form/ids';
import type { CompiledFormResult } from '@/features/form';
import { useSearchFormBinding } from '@/features/search/bindings/search-form';
import { useSearchFormSystem } from '@/features/search/model/new-form/search-form-system';
import { useResultsState } from '@/features/search/model/results/results-state';
import { usePageBootstrap } from '@/navigation/page-bootstrap';

import { useBlackLabApi } from '@/shared/api';

import FormSystem from '@/features/form/ui/FormSystem.vue';
import QueryFormSettings from '@/pages/search/form/QueryFormSettings.vue';
import History from '@/pages/search/History.vue';

const { containerClass } = useLayout();

const runtime = useSearchFormSystem();
const formBinding = useSearchFormBinding();
const customizationsReady = usePageBootstrap().customizationsReady;
// Scripts can replace the form and restoration can replace its draft; accept input once both have settled.
const formInteractive = computed(() => customizationsReady.value && !formBinding.loading.value);
const settingsOpen = ref(false);
const historyOpen = ref(false);

const corpus = useCorpus();
const blacklab = useBlackLabApi();
const { parameters } = useResultsState();
const subcorpus = createFilteredResultCountLoader();
watch(
	[corpus, () => parameters.value?.searchfield, () => parameters.value?.filter],
	([index, field, filter]) => subcorpus.next({ index, annotatedFieldId: field ?? index.mainAnnotatedField, filter, blacklab }),
	{ immediate: true },
);
onScopeDispose(subcorpus.dispose);

function submit(snapshot: CompiledFormResult) {
	if (searchFormIds.formKind(snapshot.formId) === 'explore' && subcorpus.isLoaded() && subcorpus.value.tokensInMatchingDocuments > 5000000) {
		const message = stripIndent`
			You have selected a subcorpus of over ${(5000000).toLocaleString()} tokens.
			Please note that this query, on first execution, may take a considerable amount of time to complete.
			Proceed with caution.

			Continue?`;
		if (!confirm(message)) return;
	}
	(document.activeElement as HTMLElement | null)?.blur();
	formBinding.submit(snapshot);
}
</script>
