<template>
	<div class="btn-group">
		<button
			type="button"
			class="btn btn-default btn-sm"
			:disabled="downloadInProgress || disabled"
			:title="(downloadInProgress ? $t('results.export.downloading') : $t('results.export.csvTooltip')).toLocaleString()"
			@click="downloadCsv(false)"
		>
			<template v-if="downloadInProgress">&nbsp;<span class="fa fa-spinner fa-spin"></span>&nbsp;</template>
			{{ $t('results.export.exportCSV') }}
		</button>
		<button
			type="button"
			class="btn btn-default btn-sm"
			:disabled="downloadInProgress || disabled"
			:title="(downloadInProgress ? $t('results.export.downloading') : $t('results.export.excelTooltip')).toLocaleString()"
			@click="downloadCsv(true)"
		>
			<template v-if="downloadInProgress">&nbsp;<span class="fa fa-spinner fa-spin"></span>&nbsp;</template>
			{{ $t('results.export.exportExcel') }}
		</button>
	</div>
</template>

<script setup lang="ts">
import cloneDeep from 'clone-deep';
import { computed, ref } from 'vue';

import { useCorpus } from '@/app/state/useCorpusContext';
import { useCustomizations } from '@/customization-api/internal/internal-api';
import type { BLSearchResult } from '@/types/blacklabtypes';
import { hasPatternInfo } from '@/types/blacklabtypes';

import { useBlackLabApi } from '@/shared/api';
import { getSearchParameters } from '@/shared/blacklab-helpers/normalize/result-helpers';
import { ensureCompleteFieldName } from '@/shared/blacklab-helpers/parallel-helper';
import { debugLog } from '@/shared/debug/debug';
import { useI18n } from '@/shared/i18n';

const {
	results = null,
	type,
	annotations = null,
	metadata = null,
	disabled = false,
} = defineProps<{
	results?: BLSearchResult | null;
	type: 'hits' | 'docs';
	annotations?: string[] | null;
	metadata?: string[] | null;
	disabled?: boolean;
}>();
const corpus = useCorpus();
const blacklab = useBlackLabApi();
const customizations = useCustomizations();
const translate = useI18n();
const downloadInProgress = ref(false);
const spanAttributesToExport = computed(() =>
	Object.entries(corpus.value.relations.spans || {}).flatMap(([spanName, spanInfo]) =>
		Object.keys(spanInfo.attributes || {})
			.map(attrName => [spanName, attrName])
			.filter(([elementName, attributeName]) => customizations.exportSpanAttribute({ elementName, attributeName }))
			.map(([elementName, attributeName]) => `${elementName}.${attributeName}`),
	),
);

function downloadCsv(excel: boolean) {
	if (downloadInProgress.value || !results) return;
	downloadInProgress.value = true;
	const apiCall = type === 'hits' ? blacklab.getHitsCsv : blacklab.getDocsCsv;
	const params = cloneDeep(getSearchParameters(results));
	if (annotations) params.listvalues = annotations.join(',');
	if (metadata) params.listmetadatavalues = metadata.join(',');
	params.listspanattributes = spanAttributesToExport.value.join(',');
	(params as any).csvsepline = !!excel;
	(params as any).csvsummary = true;
	const fieldDisplayName = (name: string) => {
		const defaultField = (hasPatternInfo(results.summary) ? results.summary.pattern.fieldName : undefined) ?? corpus.value.mainAnnotatedField;
		name = ensureCompleteFieldName(name, defaultField); // don't just pass version name
		return translate.$tAnnotatedFieldDisplayName(corpus.value.allAnnotatedFieldsMap[name]);
	};
	(params as any).csvdescription = customizations.exportDescription(results.summary, fieldDisplayName) || '';

	debugLog('export', 'starting csv download', type, params);
	apiCall(corpus.value.id!, params)
		.request.then(
			async blob => {
				const { saveAs } = await import('file-saver');
				saveAs(blob, 'data.csv');
			},
			error => debugLog('export', 'Error downloading csv file', error),
		)
		.finally(() => (downloadInProgress.value = false));
}
</script>
