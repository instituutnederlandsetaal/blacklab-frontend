<template>
	<ul class="pagination pagination-sm">
		<li :class="['first', { disabled: !prevEnabled || disabled }]">
			<a v-if="prevEnabled" role="button" title="first" @click.prevent="changePage(minPage)">&laquo;</a>
			<span v-else title="first">&laquo;</span>
		</li>
		<li v-if="prevEnabled" :class="['prev', { disabled: !prevEnabled || disabled }]">
			<a role="button" title="previous" @click.prevent="changePage(page - 1)">&lsaquo;</a>
		</li>
		<template v-if="showOffsets"
			><li v-for="i in lowerPages" :key="i" :class="{ disabled: disabled }">
				<a role="button" @click.prevent="changePage(i)">{{ (i + 1).toLocaleString() }}</a>
			</li></template
		>
		<li
			:class="{
				current: pageActive,
				active: pageActive,
				disabled,
			}"
		>
			<template v-if="editable && !hasPageRange">
				<input
					type="number"
					step="1"
					class="form-control"
					:value="page + 1"
					:disabled="disabled"
					@keypress.enter.prevent="commitPageInput($event)"
					@keyup.esc.prevent="resetPageInput($event)"
					@change.prevent="commitPageInput($event)"
				/>
				<span v-if="editable" class="fa fa-pencil"></span>
			</template>
			<a v-else-if="!pageActive" role="button" @click.prevent="changePage(page)">{{ currentPageLabel }}</a>
			<a v-else-if="!disabled" role="button" @click.prevent="activatePage">{{ currentPageLabel }}</a>
			<span v-else>{{ currentPageLabel }}</span>
		</li>
		<template v-if="showOffsets"
			><li v-for="i in higherPages" :key="i" :class="{ disabled: disabled }">
				<a role="button" @click.prevent="changePage(i)">{{ (i + 1).toLocaleString() }}</a>
			</li></template
		>
		<li v-if="nextEnabled" :class="['next', { disabled: !nextEnabled || disabled }]">
			<a role="button" title="next" @click.prevent="changePage(page + 1)">&rsaquo;</a>
		</li>
		<li :class="['last', { disabled: !nextEnabled || disabled }]">
			<a v-if="nextEnabled" role="button" :title="(maxPage + 1).toLocaleString() + ' (last)'" @click.prevent="changePage(maxPage)">&raquo;</a>
			<span v-else :title="(maxPage + 1).toLocaleString() + ' (last)'">&raquo;</span>
		</li>
	</ul>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/** Inputs are zero-based; labels are one-based. */
const {
	page,
	page2,
	pageActive = true,
	maxPage = Number.MAX_VALUE,
	minPage = 0,
	disabled = false,
	editable = true,
	showOffsets = true,
	showTotal = false,
} = defineProps<{
	page: number;
	page2?: number;
	pageActive?: boolean;
	maxPage?: number;
	minPage?: number;
	disabled?: boolean;
	editable?: boolean;
	showOffsets?: boolean;
	/** Show e.g. 1/10 instead of just 1 in the centre button. */
	showTotal?: boolean;
}>();
const emit = defineEmits<{ change: [page: number]; active: [page: number] }>();

const hasPageRange = computed(() => page2 != null && page2 !== page);
const boundedLowerPage = computed(() => Math.max(minPage, Math.min(page, maxPage)));
const boundedUpperPage = computed(() => Math.max(minPage, Math.min(page2 ?? page, maxPage)));
const currentPageLabel = computed(() => {
	const label = hasPageRange.value ? `${(boundedLowerPage.value + 1).toLocaleString()} - ${(boundedUpperPage.value + 1).toLocaleString()}` : (boundedLowerPage.value + 1).toLocaleString();
	return showTotal ? `${label}/${(maxPage + 1).toLocaleString()}` : label;
});

function calcOffsets(range: number) {
	if (range <= 0) return [];
	if (range <= 1) return [1];
	if (range <= 2) return [1, 2];
	if (range <= 5) return [1, 2, range];
	if (range <= 10) return [1, 2, 5, range];
	return [1, 2, 3, 5, 10];
}

const lowerPages = computed(() =>
	calcOffsets(boundedLowerPage.value - minPage)
		.reverse()
		.map(offset => boundedLowerPage.value - offset),
);
const higherPages = computed(() => calcOffsets(maxPage - boundedUpperPage.value).map(offset => boundedUpperPage.value + offset));
const nextEnabled = computed(() => boundedUpperPage.value < maxPage);
const prevEnabled = computed(() => boundedLowerPage.value > minPage);

function isValid(candidate: unknown): candidate is number {
	return typeof candidate === 'number' && Number.isFinite(candidate) && Number.isInteger(candidate) && (candidate !== page || !pageActive) && candidate >= minPage && candidate <= maxPage;
}

function changePage(candidate: unknown) {
	if (!disabled && isValid(candidate)) emit('change', candidate);
}

function commitPageInput(event: Event) {
	const target = event.target as HTMLInputElement | null;
	if (!target) return;
	const nextPage = Number(target.value) - 1;
	if (target.value !== '' && isValid(nextPage)) changePage(nextPage);
	else target.value = String(page + 1);
}

function resetPageInput(event: Event) {
	const target = event.target as HTMLInputElement | null;
	if (!target) return;
	target.value = String(page + 1);
	target.blur();
}

function activatePage() {
	if (!disabled) emit('active', page);
}
</script>

<style lang="scss" scoped>
@use 'sass:color';

.pagination {
	$color: color.adjust(#337ab7, $lightness: -5%);
	$border-color: color.adjust(#337ab7, $lightness: 20%);
	margin: 0;
	display: inline-block !important;

	vertical-align: middle; // this is done for buttons, but not for ul? align with neighboring buttons.

	> li {
		> a,
		> span {
			display: inline-block;
			float: none;
			user-select: none;
		}

		display: inline-block;
		&.current {
			color: #555;
			position: relative;
			vertical-align: bottom;
			> .fa {
				align-items: center;
				background: none;
				border: none;
				bottom: 2px;
				color: $color;
				display: flex;
				justify-content: center;
				margin: 0;
				opacity: 0.8;
				padding: 0;
				position: absolute;
				right: 6px;
				top: 0;
				z-index: 10;

				&:hover {
					z-index: 0;
				}
			}
			> input {
				border-color: $border-color;
				box-sizing: content-box;
				color: $color;
				border-radius: 0;
				font-size: 12px;
				height: 1.5em;
				line-height: 1.5em;
				padding: 5px;
				position: relative;
				text-align: center;
				width: 36px;
				z-index: 5;

				&:focus,
				&:hover {
					z-index: 15;
				}
				&:not(:focus):not(:hover) {
					-moz-appearance: textfield;
				}
			}
		}
		&.first,
		&.prev,
		&.next,
		&.last {
			> a,
			> span {
				padding-left: 6px;
				padding-right: 6px;
				box-sizing: content-box;
				width: 6px;
				text-align: center;
				font-weight: bold;
			}
		}
	}
	li + li.current {
		margin-left: -1px;
	}
}
</style>
