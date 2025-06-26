<template>
	<th :class="col.class" :style="col.style">
		<slot></slot>
		<span v-if="Array.isArray(col.sort)" class="dropdown">
			<a role="button" data-toggle="dropdown" :class="['dropdown-toggle', {disabled: disabled}]" aria-haspopup="true" aria-expanded="false">
				{{ col.label }} <debug><b>[{{ col.debugLabel || col.key }}]</b></debug>
				<span class="caret"></span>
			</a>
			<ul class="dropdown-menu" role="menu">
				<li class="dropdown-header">{{ $t('results.sort.sortBy') }}</li>
				<li v-for="o in col.sort" :key="o.value" :class="{disabled: disabled}">
					<a :class="['sort', {disabled: disabled}]" role="button" @click="changeSort(o.value)">{{o.label}} <Debug><b>[{{o.value}}]</b></Debug></a>
				</li>
			</ul>
		</span>
		<a v-else-if="col.sort"
			role="button"
			:class="['sort', {disabled: disabled}]"
			:title="col.title"
			@click="changeSort(col.sort)"
		>
			{{ col.label }} <debug><b>[{{ col.debugLabel || col.key }}]</b></debug>
		</a>
		<span v-else :title="col.title">{{ col.label }} <debug><b>[{{ col.debugLabel || col.key }}]</b></debug></span>
	</th>
</template>
<script lang="ts">
import { ColumnDef } from '@/pages/search/results/table/table-layout';
import Vue from 'vue';
export default Vue.component('TableHeader', {
	props: {
		disabled: Boolean,
		col: Object as () => ColumnDef
	},
	methods: {
		changeSort(sort: string) { this.$emit('changeSort', sort); }
	}
})
</script>