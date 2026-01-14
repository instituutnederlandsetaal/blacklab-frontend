<template>
	<Modal :title="$t('setting.heading')" @close="$emit('close')" :confirm="false" :closeMessage="$t('setting.close')" xs>
		<div class="form-horizontal">
			<div class="form-group"> <!-- behaves as .row when in .form-horizontal so .row may be omitted -->
				<label for="resultsPerPage" class="col-xs-3">{{$t('setting.resultsPerPage')}}:</label>
				<div class="col-xs-9">
					<input type="number" class="form-control" v-model.lazy="pageSize" id="resultsPerPage" name="resultsPerPage" min="1" max="1000" list="resultsPerPageOptions"></input>
					<datalist id="resultsPerPageOptions">
						<option value="20"></option>
						<option value="50"></option>
						<option value="100"></option>
						<option value="200"></option>
					</datalist>
				</div>
			</div>

			<div class="form-group">
				<label for="sampleSize" class="col-xs-3">{{$t('setting.sampleSize')}}:</label>
				<div class="col-xs-9">
					<div class="input-group">
						<SelectPicker
							class="input-group-btn"
							data-id="sampleMode"
							data-name="sampleMode"
							data-menu-width="grow"

							hideEmpty
							:options="sampleModeOptions"

							@input="focusSampleSize"

							v-model="sampleMode"
						/>

						<input id="sampleSize" name="sampleSize" :placeholder="$t('setting.sampleSize')" type="number" class="form-control" v-model.lazy="sampleSize" ref="sampleSize"/>
					</div>
				</div>
			</div>

			<div class="form-group">
				<label for="sampleSeed" class="col-xs-3">{{$t('setting.sampleSeed')}}:</label>
				<div class="col-xs-9">
					<input id="sampleSeed" name="sampleSeed" :placeholder="$t('setting.sampleSeed')" type="number" class="form-control" v-model.lazy="sampleSeed">
				</div>
			</div>

			<div class="form-group">
				<label for="context" class="col-xs-3">{{$t('setting.context')}}:</label>
				<div class="col-xs-9">
					<input id="context" name="context" :placeholder="$t('setting.context')" type="number" class="form-control" v-model.lazy="context">
				</div>
			</div>
		</div>
		<hr>
		<div class="checkbox-inline"><label for="wide-view"><input type="checkbox" id="wide-view" name="wide-view" v-model="wideView.value">{{$t('setting.wideView')}}</label></div>
		<br>

		<template v-if="debug.debug_visible || debug.debug">
			<div class="checkbox-inline">
				<label for="debug" class="text-muted"><input type="checkbox" id="debug" name="debug" v-model="debug.debug">{{ $t('setting.debug') }}</label>
			</div>
			<br>
			<button type="button" class="btn btn-sm btn-default" @click="debug.debug_visible = false; debug.debug = false">
				{{ $t('setting.hideDebugUntilReload') }}
			</button>
		</template>
	</Modal>

</template>

<script lang="ts">
import Vue, { watch } from 'vue';

import * as RootStore from '@/store/search/';
import * as GlobalViewSettings from '@/store/search/results/global';
import * as ResultsViewSettings from '@/store/search/results/views';

import SelectPicker,{ Option } from '@/components/SelectPicker.vue';
import Modal from '@/components/Modal.vue';

import debug from '@/utils/debug';
import { localStorageSynced } from '@/utils/localstore';

// outside component, want to always run this code, even when component is invisible.
export const wideView = localStorageSynced('cf/wideView', false);
watch(() => wideView.value, v => document.querySelectorAll('.container, .container-fluid').forEach(el => {
	el.classList.toggle('container', !v);
	el.classList.toggle('container-fluid', !!v);
}), {immediate: true});

export default Vue.extend({
	components: {
		SelectPicker,
		Modal
	},
	data: () => ({
		debug,
		wideView,
	}),
	computed: {
		viewedResultsSettings: RootStore.get.viewedResultsSettings,
		pageSize: {
			get(): string { return this.itoa(GlobalViewSettings.getState().pageSize); },
			set(v: string) {
				try {
					const i = this.atoi(v)!;
					GlobalViewSettings.actions.pageSize(i);
				} catch (e) {
					// ignore invalid input
					this.pageSize = "20";
				}
			}
		},
		sampleMode: {
			get() { return GlobalViewSettings.getState().sampleMode; },
			set(v: GlobalViewSettings.ModuleRootState['sampleMode']) {
				GlobalViewSettings.actions.sampleMode(v);
				ResultsViewSettings.actions.resetFirst();
			}
		},
		sampleModeOptions(): Option[] {
			return [{
				value: 'percentage',
				label: this.$t('setting.sampleSizePercentage').toString(),
			}, {
				value: 'count',
				label: this.$t('setting.sampleSizeCount').toString(),
			}]
		},
		sampleSize: {
			get(): string { return this.itoa(GlobalViewSettings.getState().sampleSize); },
			set(v: string) {
				GlobalViewSettings.actions.sampleSize(this.atoi(v));
				ResultsViewSettings.actions.resetFirst();
			}
		},
		sampleSeed: {
			get(): string { return this.itoa(GlobalViewSettings.getState().sampleSeed); },
			set(v: string) {
				GlobalViewSettings.actions.sampleSeed(this.atoi(v));
				if (this.viewedResultsSettings && this.viewedResultsSettings.groupBy.length) {
					// No need to do this when ungrouped - the raw number of results
					// will stay as it is, but the distribution (and number of) groups may change and
					// cause the number of pages to shift
					ResultsViewSettings.actions.resetFirst();
				}
			}
		},
		context: {
			// context can be a string or number in BlackLab, but for now in the form we only allow numbers.
			// hence the atoi so BlackLab receives a number
			// the .value interface of html input field only deals in strings...
			get(): string {
				const c = GlobalViewSettings.getState().context;
				return c != null ? c.toString() : '';
			},
			set(v: string) { GlobalViewSettings.actions.context(this.atoi(v)); }
		},
	},
	methods: {
		focusSampleSize() {
			(this.$refs.sampleSize as HTMLInputElement).focus()
		},
		itoa(n: number|null): string { return n == null ? '' : n.toString(); },
		atoi(s: string): number|null { return s ? Number.parseInt(s, 10) : null; }
	},
})
</script>