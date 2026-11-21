<template>
	<FormSystem v-if="runtime" :runtime="runtime" :inert="!formInteractive || undefined" @submit="submit" @reset="searchActions.reset" class="container">
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
import { computed, ref } from 'vue';

import { selectedSubcorpusLoader } from '@/api/async/instances/result-count';
import { searchFormIds } from '@/customization-api/shared/form/ids';
import type { CompiledFormResult } from '@/features/form';
import { useSearchFormSystem } from '@/features/search/model/new-form/search-form-system';
import { useSearchFormRestoring } from '@/features/search/model/search-form-restoration';
import { useSearchActions } from '@/features/search/model/search-store';
import { usePageBootstrap } from '@/navigation/page-bootstrap';

import FormSystem from '@/features/form/ui/FormSystem.vue';
import QueryFormSettings from '@/pages/search/form/QueryFormSettings.vue';
import History from '@/pages/search/History.vue';

const runtime = useSearchFormSystem();
const searchActions = useSearchActions();
const customizationsReady = usePageBootstrap().customizationsReady;
const formRestoring = useSearchFormRestoring();
// Scripts can replace the form and restoration can replace its draft; accept input once both have settled.
const formInteractive = computed(() => customizationsReady.value && !formRestoring.value);
const settingsOpen = ref(false);
const historyOpen = ref(false);

function submit(snapshot: CompiledFormResult) {
	const subcorpus = selectedSubcorpusLoader;
	if (searchFormIds.formKind(snapshot.formId) === 'explore' && subcorpus.isLoaded() && subcorpus.value.tokensInMatchingDocuments > 5000000) {
		const message = stripIndent`
			You have selected a subcorpus of over ${(5000000).toLocaleString()} tokens.
			Please note that this query, on first execution, may take a considerable amount of time to complete.
			Proceed with caution.

			Continue?`;
		if (!confirm(message)) return;
	}
	(document.activeElement as HTMLElement | null)?.blur();
	searchActions.searchFromSubmit(snapshot);
}
</script>
