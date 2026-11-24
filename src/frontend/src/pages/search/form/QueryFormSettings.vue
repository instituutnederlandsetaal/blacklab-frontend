<template>
	<Modal :title="$t('setting.heading')" @close="$emit('close')" :confirm="false" :closeMessage="$t('setting.close')" size="xs">
		<div class="form-horizontal">
			<div class="form-group">
				<label for="resultsPerPage" class="col-xs-3">{{ $t('setting.resultsPerPage') }}:</label>
				<div class="col-xs-9">
					<input
						type="number"
						class="form-control"
						:value="settings.pageSize"
						@change="updateNumber($event, 'pageSize')"
						id="resultsPerPage"
						name="resultsPerPage"
						min="1"
						max="1000"
						list="resultsPerPageOptions"
					/>
					<datalist id="resultsPerPageOptions">
						<option value="20"></option>
						<option value="50"></option>
						<option value="100"></option>
						<option value="200"></option>
					</datalist>
				</div>
			</div>

			<div class="form-group">
				<label for="sampleSize" class="col-xs-3">{{ $t('setting.sampleSize') }}:</label>
				<div class="col-xs-9">
					<div class="input-group">
						<SelectPicker
							class="input-group-btn"
							data-id="sampleMode"
							data-name="sampleMode"
							data-menu-width="grow"
							hideEmpty
							:options="sampleModeOptions"
							:modelValue="settings.sampleMode"
							@update:modelValue="setSampleMode"
						/>

						<input
							id="sampleSize"
							name="sampleSize"
							:placeholder="$t('setting.sampleSize')"
							type="number"
							class="form-control"
							:value="settings.sampleSize"
							@change="updateNumber($event, 'sampleSize')"
							ref="sampleSize"
						/>
					</div>
				</div>
			</div>

			<div class="form-group">
				<label for="sampleSeed" class="col-xs-3">{{ $t('setting.sampleSeed') }}:</label>
				<div class="col-xs-9">
					<input
						id="sampleSeed"
						name="sampleSeed"
						:placeholder="$t('setting.sampleSeed')"
						type="number"
						class="form-control"
						:value="settings.sampleSeed"
						@change="updateNumber($event, 'sampleSeed')"
					/>
				</div>
			</div>

			<div class="form-group">
				<label for="context" class="col-xs-3">{{ $t('setting.context') }}:</label>
				<div class="col-xs-9">
					<input id="context" name="context" :placeholder="$t('setting.context')" type="number" class="form-control" :value="settings.context" @change="updateNumber($event, 'context')" />
				</div>
			</div>
		</div>
		<hr />
		<div class="checkbox">
			<label for="wide-view"><input type="checkbox" id="wide-view" name="wide-view" v-model="wideView.value" />{{ $t('setting.wideView') }}</label>
		</div>

		<template v-if="debug_visible || debug">
			<div class="checkbox">
				<label for="debug" class="text-muted">
					<input type="checkbox" id="debug" name="debug" v-model="debug" />
					{{ $t('setting.debug') }}</label
				>
			</div>
			<br />
			<div v-if="debug_visible && debugCategories.length" class="debug-log-categories">
				<label class="text-muted">{{ $t('setting.debugLogCategories') }}</label>
				<div class="btn-group">
					<button
						v-for="category in debugCategories"
						:key="category"
						type="button"
						class="btn btn-xs btn-default"
						:class="{ active: activeDebugCategories.has(category) }"
						@click="surfaceDebugCategory(category)"
					>
						{{ category }}
					</button>
					<button type="button" class="btn btn-xs btn-default" @click="surfaceAllDebugCategories">
						{{ $t('setting.debugLogCategoriesAll') }}
					</button>
				</div>
			</div>
			<button type="button" class="btn btn-sm btn-default" @click="debug_visible = debug = false">
				{{ $t('setting.hideDebugUntilReload') }}
			</button>
		</template>
	</Modal>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';

import { useLayout } from '@/app/state/layout';
import { useResultsState, type ResultSettings } from '@/features/search/model/results/results-state';

import { useDebugSystem } from '@/shared/debug/debug';
import { useI18n } from '@/shared/i18n';

import Modal from '@/shared/ui/Modal.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

const { wideView } = useLayout();

defineEmits<{ close: [] }>();
const results = useResultsState();
const { settings } = results;
const {
	debug,
	debug_visible,
	knownCategories: debugCategories,
	activeCategories: activeDebugCategories,
	surfaceCategory: surfaceDebugCategory,
	surfaceAllCategories: surfaceAllDebugCategories,
} = useDebugSystem();
const translate = useI18n();
const sampleSizeInput = useTemplateRef<HTMLInputElement>('sampleSize');
const sampleModeOptions = computed(() => [
	{ value: 'percentage', label: translate.$t('setting.sampleSizePercentage').toString() },
	{ value: 'count', label: translate.$t('setting.sampleSizeCount').toString() },
]);

function setSampleMode(mode: ResultSettings['sampleMode']) {
	results.setSampleMode(mode);
	sampleSizeInput.value?.focus();
}

function updateNumber(event: Event, setting: 'pageSize' | 'sampleSize' | 'sampleSeed' | 'context') {
	const input = event.target as HTMLInputElement;
	const value = input.value === '' ? null : input.valueAsNumber;
	if (!input.validity.badInput && (value === null || Number.isSafeInteger(value))) {
		switch (setting) {
			case 'pageSize':
				if (value !== null) results.setPageSize(value);
				break;
			case 'sampleSize':
				results.setSampleSize(value);
				break;
			case 'sampleSeed':
				results.setSampleSeed(value);
				break;
			case 'context':
				results.setContext(value);
				break;
		}
	}
	input.value = String(settings[setting] ?? '');
}
</script>

<style lang="scss" scoped>
.debug-log-categories {
	margin: 8px 0;

	.btn {
		margin: 0 4px 4px 0;
	}
}
</style>
