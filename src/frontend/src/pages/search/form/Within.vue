<template>
	<!-- show this even if it's disabled when "within" contains a value, or you can never remove the value -->
	<!-- this will probably never happen, but it could, if someone imports a query with a "within" clause active from somewhere -->
	<div v-if="withinOptions.length || within" class="form-group">
		<label class="col-xs-12 col-md-3">{{$t('search.extended.within')}}</label>

		<div class="btn-group col-xs-12 col-md-9">
			<button v-for="option in withinOptions"
				type="button"
				:class="['btn', within === option.value ? 'active btn-primary' : 'btn-default']"
				:key="option.value"
				:value="option.value"
				:title="option.title || undefined"
				@click="within = option.value"
			>{{$tWithinDisplayName(option)}}</button> <!-- empty value searches across entire documents -->
		</div>
		<div class="btn-group col-xs-12 col-md-9 col-md-push-3 attr form-inline" v-for="attr in withinAttributes()">
			<label>{{ attr.label || attr.value }}</label>
			<input class='form-control' type="text" :title="attr.title || undefined"
					:value="withinAttributeValue(attr)" @change="changeWithinAttribute(attr, $event)" />
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as UIStore from '@/store/search/ui';
import * as PatternStore from '@/store/search/form/patterns';

import { Option } from '@/components/SelectPicker.vue';
import { corpusCustomizations } from '@/store/search/ui';

export default Vue.extend({
	computed: {
		withinOptions(): Option[] {
			const {enabled, elements} = UIStore.getState().search.shared.within;
			return enabled ? elements.filter(corpusCustomizations.search.within.include) : [];
		},
		within: {
			get(): string|null { return PatternStore.getState().extended.within; },
			set: PatternStore.actions.extended.within,
		},
	},
	methods: {
		withinAttributes(): Option[] {
			const within = this.within;
			if (!within) return [];

			const option = this.withinOptions.find(o => o.value === within);
			if (!option) return [];

			return (corpusCustomizations.search.within.attributes(option) || [])
				.map(el => typeof el === 'string' ? { value: el } : el);
		},
		withinAttributeValue(option: Option) {
			const value = PatternStore.getState().extended.withinAttributes[option.value];
			return value == null ? '' : value;
		},
		changeWithinAttribute(option: Option, event: Event) {
			const el = event.target as HTMLInputElement;
			PatternStore.actions.extended.setWithinAttribute({ name: option.value, value: el.value });
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
