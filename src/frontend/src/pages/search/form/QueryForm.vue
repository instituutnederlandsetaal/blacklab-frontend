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

import { usePageBootstrap } from '@/app/router/page-bootstrap';
import { useLayout } from '@/app/shell/layout';
import { searchFormIds } from '@/customization-api/shared/form/ids';
import { useCorpus } from '@/features/corpus/corpus-context';
import type { CompiledFormResult } from '@/features/form';
import { useSearchFormBinding } from '@/pages/search/bindings/search-form-binding';
import { useSearchFormSystem } from '@/pages/search/model/form/search-form-system';
import { createFilteredResultCountLoader } from '@/pages/search/model/result-count/result-count-from-filters';
import { useResultsState } from '@/pages/search/model/results/results-state';

import { useBlackLabApi } from '@/shared/api';

import FormSystem from '@/features/form/ui/FormSystem.vue';
import QueryFormSettings from '@/pages/search/form/QueryFormSettings.vue';
import History from '@/pages/search/history/History.vue';

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
const subcorpus = createFilteredResultCountLoader(blacklab);
watch(
	[corpus, () => parameters.value?.searchfield, () => parameters.value?.filter],
	([index, field, filter]) => subcorpus.update({ index, annotatedFieldId: field ?? index.mainAnnotatedField, filter }),
	{ immediate: true },
);
onScopeDispose(subcorpus.dispose);

function submit(snapshot: CompiledFormResult) {
	const count = subcorpus.current.value;
	if (searchFormIds.formKind(snapshot.formId) === 'explore' && count.isLoaded() && count.value.tokensInMatchingDocuments > 5000000) {
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
