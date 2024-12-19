<template>
	<!-- show this even if it's disabled when "within" contains a value, or you can never remove the value -->
	<!-- this will probably never happen, but it could, if someone imports a query with a "within" clause active from somewhere -->
	<div v-if="withinOptions.length || within" class="form-group">
		<label class="col-xs-12 col-md-3">{{$t('search.extended.within')}}</label>

		<div class="btn-group col-xs-12 col-md-9">
			<button v-for="option in withinOptions"
				type="button"
				:class="['btn', within === option.value || within === null && option.value === '' ? 'active btn-primary' : 'btn-default']"
				:key="option.value"
				:value="option.value"
				:title="option.title || undefined"
				@click="within = option.value"
			>{{$tWithinDisplayName(option)}}</button> <!-- empty value searches across entire documents -->
		</div>
		<div class="btn-group col-xs-12 col-md-9 col-md-push-3 attr form-inline" v-for="attr in withinAttributes()">
			<label>{{ $tWithinAttribute(within ?? 'none', attr.value) }}</label>
			<input class='form-control' type="text" :title="attr.title || undefined"
					:value="withinAttributeValue(attr)" @change="changeWithinAttribute(attr, $event)" />
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as UIStore from '@/store/ui';
import * as PatternStore from '@/store/form/patterns';
import * as CorpusStore from '@/store/corpus';

import { Option } from '@/components/SelectPicker.vue';
import { corpusCustomizations } from '@/store/ui';

export default Vue.extend({
	computed: {
		withinOptions(): Option[] {
			const {enabled, elements} = UIStore.getState().search.shared.within;
			return enabled ? elements.filter(element => corpusCustomizations.search.within.includeSpan(element.value)) : [];
		},
		within: {
			get(): string|null {
				return PatternStore.getState().shared.within;
			},
			set(v: string|null) {
				PatternStore.actions.shared.within(v);;
			}
		},
	},
	methods: {
		withinAttributes(): Option[] {
			const within = this.within;
			if (!within) return [];

			const option = this.withinOptions.find(o => o.value === within);
			if (!option) return [];

			return (corpusCustomizations.search.within._attributes(option.value) || [])
				.map(el => typeof el === 'string' ? { value: el } : el);
		},
		withinAttributeValue(option: Option) {
			if (this.within === null)
			 	return '';
			const within = PatternStore.getState().shared.withinAttributes;
			return within ? within[option.value] ?? '' : '';
		},
		changeWithinAttribute(option: Option, event: Event) {
			const spanName = this.within;
			if (spanName === null)
				return;
			const el = event.target as HTMLInputElement;
			const curVal = PatternStore.getState().shared.withinAttributes || {};
			curVal[option.value] = el.value;
			PatternStore.actions.shared.withinAttributes(curVal);
		},
	},
})
</script>

<style lang="scss">

div.attr {
	margin-top: 4px;
	label, input { width: 6em; }
}

</style>
