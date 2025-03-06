<template functional>
	<th :class="props.col.textAlignClass">
		<slot></slot>
		<span v-if="Array.isArray(props.col.sort)" class="dropdown">
			<a role="button" data-toggle="dropdown" :class="['dropdown-toggle', {disabled: props.disabled}]">
				{{ props.col.label }} <debug><b>[{{ props.col.debugLabel || props.col.key }}]</b></debug>
				<span class="caret"></span>
			</a>
			<ul class="dropdown-menu" role="menu">
				<li v-for="o in props.col.sort" :key="o.value" :class="{disabled: props.disabled}">
					<a :class="['sort', {disabled: props.disabled}]" role="button" @click="changeSort(o.value)">{{o.label}} <Debug><b>[{{o.value}}]</b></Debug></a>
				</li>
			</ul>
		</span>
		<a v-else-if="props.col.sort"
			role="button"
			:class="['sort', {disabled: props.disabled}]"
			:title="props.col.title"
			@click="changeSort(props.col.sort)"
		>
			{{ props.col.label }} <debug><b>[{{ props.col.debugLabel || props.col.key }}]</b></debug>
		</a>
		<span v-else :title="props.col.title">{{ props.col.label }} <debug><b>[{{ props.col.debugLabel || props.col.key }}]</b></debug></span>
	</th>
</template>
<script lang="ts">
import { ColumnDef } from '@/pages/search/results/table/table-layout';
import Vue from 'vue';
export default Vue.extend({
	props: {
		disabled: Boolean,
		col: Object as () => ColumnDef
	},
	methods: {
		changeSort(sort: string) { this.$emit('changeSort', sort); }
	}
})
</script>