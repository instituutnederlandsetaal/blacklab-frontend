<template>
	<th>
		<slot></slot>
		<span v-if="Array.isArray(col.sort)" class="dropdown">
			<a role="button" data-toggle="dropdown" :class="['dropdown-toggle', {disabled}]">
				{{ col.label }} <debug><b>[{{ col.debugLabel || col.key }}]</b></debug>
				<span class="caret"></span>
			</a>
			<ul class="dropdown-menu" role="menu">
				<li v-for="o in col.sort" :key="o.value" :class="{disabled}">
					<a :class="['sort', {disabled}]" role="button" @click="changeSort(o.value)">{{o.label}} <Debug><b>[{{o.value}}]</b></Debug></a>
				</li>
			</ul>
		</span>
		<a v-else-if="col.sort"
			role="button"
			:class="['sort', {disabled}]"
			:title="col.title"
			@click="changeSort(col.sort)"
		>
			{{ col.label }} <debug><b>[{{ col.debugLabel || col.key }}]</b></debug>
		</a>
		<template v-else>{{ col.label }} <debug><b>[{{ col.debugLabel || col.key }}]</b></debug></template>
	</th>
</template>
<script lang="ts">
import { ColumnDef } from '@/utils/hit-highlighting';
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