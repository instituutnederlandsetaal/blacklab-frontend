<template>
	<!-- show this even if it's disabled when "within" contains a value, or you can never remove the value -->
	<!-- this will probably never happen, but it could, if someone imports a query with a "within" clause active from somewhere -->
	<div v-if="withinOptions.length || model" class="form-group">
		<label class="col-xs-12 col-md-3">{{$t('search.extended.within')}}</label>

		<div class="btn-group col-xs-12 col-md-9">
			<button v-for="option in withinOptions"
				type="button"
				:class="['btn', model === option.value || model === null && option.value === '' ? 'active btn-primary' : 'btn-default']"
				:key="option.value"
				:value="option.value"
				:title="option.title || undefined"
				@click="model = option.value"
			>{{$tSpanDisplayName(option)}}<debug><b> [{{ option.value || `''` }}]</b></debug></button> <!-- empty value searches across entire documents -->
		</div>
		<div class="btn-group col-xs-12 col-md-9 col-md-push-3 attr form-inline" v-for="attr in withinAttributes">
			<label>{{ $tSpanAttributeDisplay(model ?? 'none', attr.value) }}<debug> <b>[{{ attr.value }}]</b></debug></label>
			<input class='form-control'
				type="text"
				:title="attr.title || undefined"
				:value="withinAttributeValue(attr)"
				@change="changeWithinAttribute(attr, $event)"
			/>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as UIStore from '@/store/ui';
import * as PatternStore from '@/store/form/patterns';
import * as CorpusStore from '@/store/corpus';

import { Option } from '@/components/SelectPicker.vue';
import { corpusCustomizations } from '@/utils/customization';

export default Vue.extend({
	props: {
		value: { type: String, required: false },
	},
	computed: {
		model: {
			get(): string | null | undefined { return this.value; },
			set(v: string|null) { this.$emit('input', v); },
		},
		withinOptions(): Option[] {
			const {enabled, elements} = UIStore.getState().search.shared.within;
			return enabled ? elements.filter(element => corpusCustomizations.search.within.includeSpan(element.value)) : [];
		},
		withinAttributes(): Option[] {
			const option = this.value && this.withinOptions.find(o => o.value === this.value);
			if (!option) return [];

			// Which, if any, attribute filter fields should be displayed for this element?
			const availableAttr = Object.keys(CorpusStore.getState()!.relations.spans?.[option.value].attributes ?? {});
			const attr = availableAttr.filter(attrName => corpusCustomizations.search.within.includeAttribute(option.value, attrName))
				.map(a => ({ value: a })) || [];

			return attr.map(el => typeof el === 'string' ? { value: el } : el);
		},
	},
	methods: {
		withinAttributeValue(option: Option) {
			if (this.value === null)
			 	return '';
			const within = PatternStore.getState().shared.withinAttributes;
			return within ? within[option.value] ?? '' : '';
		},
		changeWithinAttribute(option: Option, event: Event) {
			const spanName = this.value;
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
