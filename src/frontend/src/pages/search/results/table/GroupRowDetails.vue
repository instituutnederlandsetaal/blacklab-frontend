<template>
	<tr class="grouprow-details">
		<td colspan="10" class="well-light">
			<template v-if="rows">
				<div class="concordance-controls clearfix">
					<button type="button" class="btn btn-sm btn-primary open-concordances" :disabled="disabled" @click="$emit('openFullConcordances')">
						<span class="fa fa-angle-double-right"></span>
						{{ operation === 'collocations' ? $t('collocations.results.openAllContexts') : $t('results.table.viewDetailedConcordances') }}
					</button>
					<button type="button" v-if="offset < row.size" :disabled="loading" class="btn btn-sm btn-default" @click="loadNext()">
						<template v-if="loading"><Spinner :inline="true" /> {{ $t('results.table.loading') }}</template>
						<template v-else>{{ $t('results.table.loadMoreConcordances') }}</template>
					</button>

					<button type="button" class="close close-concordances" :aria-label="$t('results.table.close').toString()" :title="$t('results.table.close').toString()" @click="$emit('close')">
						<span aria-hidden="true">&times;</span>
					</button>
				</div>

				<GenericTable style="margin: 8px 0" :rows="rows" :header="type === 'hits' ? cols.hitColumns : cols.docColumns" :cols="cols" :info="previewInfo" :type="type" />
				<div class="concordance-controls clearfix" v-if="rows?.rows.length > 10">
					<button type="button" class="btn btn-sm btn-primary open-concordances" :disabled="disabled" @click="$emit('openFullConcordances')">
						<span class="fa fa-angle-double-right"></span>
						{{ operation === 'collocations' ? $t('collocations.results.openAllContexts') : $t('results.table.viewDetailedConcordances') }}
					</button>
					<button type="button" v-if="offset < row.size" :disabled="loading" class="btn btn-sm btn-default" @click="loadNext()">
						<template v-if="loading"><Spinner inline /> {{ $t('results.table.loading') }}</template>
						<template v-else>{{ $t('results.table.loadMoreConcordances') }}</template>
					</button>
				</div>
			</template>
			<div v-if="errorMessage != null" class="text-danger" role="alert">
				{{ errorMessage }}
				<button type="button" class="btn btn-sm btn-default retry-concordances" :disabled="disabled || loading" @click="page.retry()">
					{{ $t('results.resultsView.tryAgain') }}
				</button>
			</div>
			<div v-if="!rows && loading" role="status" aria-live="polite">
				<Spinner center />
				<span class="sr-only">{{ $t('results.table.loading') }}</span>
			</div>
		</td>
	</tr>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';

import { useCorpus } from '@/features/corpus/corpus-context';
import { createCollocationHitsParameters } from '@/pages/search/model/results/collocation-request';
import type { EffectiveCollocationParameters } from '@/pages/search/model/results/result-types';
import type { IRowProps } from '@/pages/search/results/table/IRow';
import type { GroupRowData, Rows } from '@/pages/search/results/table/table-layout';
import { makeRows } from '@/pages/search/results/table/table-layout';
import type { BLDocResults, BLHitResults, BLSearchParameters } from '@/types/blacklabtypes';

import { useBlackLabApi } from '@/shared/api';
import { ApiError } from '@/shared/api/lib/api-types';
import { useRequestResource } from '@/shared/utils/loadable/loadable-request-resource';

import GenericTable from '@/pages/search/results/table/GenericTable.vue';
import Spinner from '@/shared/ui/Spinner.vue';

const props = defineProps<IRowProps<GroupRowData>>();

const blacklab = useBlackLabApi();
const corpus = useCorpus();
// The parent view's selected range does not apply to a group's inline preview.
const previewInfo = computed(() => ({ ...props.info, selectedRange: null, detailedAnnotations: [] }));

const rows = shallowRef<Rows>();
const offset = ref(0);
const page = useRequestResource<number, void>(async (first, run) => {
	const number = Math.min(20, props.row.size - first);
	const params: BLSearchParameters = {
		...props.query,
		first,
		number,
		viewgroup: props.row.id,
		sort: corpus.value.isParallelCorpus ? 'alignments' : undefined,
	};
	const index = corpus.value.id;
	let request;
	if (props.operation === 'collocations') {
		const hits = createCollocationHitsParameters(params as EffectiveCollocationParameters);
		if (!hits) throw new ApiError('Invalid collocation request', 'The contexts for this collocate could not be requested.', 'No results', undefined);
		request = blacklab.getHits<BLHitResults>(index, hits);
	} else {
		request = props.type === 'hits' ? blacklab.getHits<BLHitResults>(index, params) : blacklab.getDocs<BLDocResults>(index, params);
	}
	const results = await run.wait<BLHitResults | BLDocResults>(request);
	run.signal.throwIfAborted();
	const next = makeRows(results, previewInfo.value).rows.filter(row => row.type === (props.type === 'hits' ? 'hit' : 'doc'));
	rows.value = { rows: [...(rows.value?.rows ?? []), ...next] };
	offset.value = first + number;
});
const loading = computed(() => page.state.value.loading);
const errorMessage = computed(() => {
	const { error } = page.current.value;
	if (!error) return null;
	const { title, message } = error;
	const detail = message.length > 500 ? message.slice(0, 500) + '…' : message;
	return title && title !== detail ? title + ': ' + detail : detail;
});

function loadNext() {
	if (offset.value < props.row.size && !loading.value && !errorMessage.value) page.run(offset.value);
}

watch([() => props.row.id, () => props.row.size, () => props.query, () => props.type, () => props.operation, () => corpus.value.id], () => {
	page.reset();
	offset.value = 0;
	rows.value = undefined;
	if (props.open) loadNext();
});
watch(
	() => props.open,
	open => {
		if (open && !rows.value) loadNext();
	},
	{ immediate: true },
);
</script>

<style lang="scss">
.concordance-controls > .btn + .btn {
	margin-left: 0.25em;
}

.well-light {
	background: rgba(255, 255, 255, 0.8);
	border: 1px solid #e8e8e8;
	border-radius: 4px !important;
	box-shadow: inset 0 1px 2px 0px rgba(0, 0, 0, 0.1);
	margin-bottom: 8px;
	padding: 8px !important;
}
</style>
