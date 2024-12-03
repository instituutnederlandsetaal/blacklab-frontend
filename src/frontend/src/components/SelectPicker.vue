<template>
	<div class="combobox" :style="{ width: dataWidth }"
		:data-menu-id="menuId"
		:dir="dir"

		@keydown.prevent.exact.down="(isOpen || !$refs.focusOnClickOpen) ? focusDown() : doOpen($refs.focusOnClickOpen)"
		@keydown.prevent.exact.up="focusUp"
	>
		<input v-if="editable && multiple"
			:class="dataClass || 'form-control'"
			:style="dataStyle"
			title="Editable and Multiple are not supported on the same selectpicker!"
			value="Editable and Multiple are not supported on the same selectpicker!"
			style="background-color: #f2dede; border-color: #ebccd1; color: #a94442;"
			type="text"

			disabled
		>
		<input v-else-if="editable"
			type="text"
			:class="['menu-input', dataClass || 'form-control']"
			:id="dataId"
			:name="dataName"
			:style="dataStyle"
			:title="dataTitle"
			:placeholder="placeholder || $attrs.title"
			:disabled="disabled"
			:dir="dir"
			:autofocus="autofocus"
			:autocomplete="autocomplete"

			@focus="doOpen()/*call directly, don't pass focusIn event*/"
			@keydown.tab="doClose()/*focus shifts to next element, close menu*/"
			@keydown.esc="doClose()"
			@keydown.enter="doClose()"

			@input.stop="emitChangeOnClose = true"
			@change.stop=""

			v-model="inputValue"

			ref="focusOnEscClose"
		/>
		<button v-else
			type="button"

			:class="['menu-button', 'btn', dataClass || 'btn-default', { 'active': isOpen }]"
			:id="dataId"
			:name="dataName"
			:style="dataStyle"
			:title="dataTitle"
			:disabled="disabled"
			:dir="dir"
			:autofocus="autofocus"

			@click="isOpen ? doClose() : doOpen($refs.focusOnClickOpen)"
			@keydown.tab="doClose()/*focus shifts to next element, close menu*/"
			@keydown.esc="doClose()"
			@keydown.prevent.enter="$event.target.click()/*stop to prevent submitting any parent form*/"

			ref="focusOnEscClose"
		>
			<template v-if="displayValues.length && showValues">
				<span class="menu-value" v-if="allowHtml" :title="value + ''" v-html="displayValues.join(', ')"/>
				<span class="menu-value" v-else :title="displayValues.join(',')">{{displayValues.join(', ')}}</span>
			</template>
			<span v-else class="menu-value placeholder">
				{{ placeholder || $attrs.title || (multiple ? 'Select values...' : 'Select a value...')}}
			</span>
			<span v-if="loading" class="menu-icon fa fa-spinner fa-spin text-muted"></span>
			<span v-else-if="!showValues && multiple && showValueCount" :class="['menu-icon badge',{'active': displayValues.length}]">
				{{displayValues.length || totalOptionCount}}
			</span>
			<span :class="['menu-icon', 'menu-caret', 'fa', 'fa-caret-down', {
				//'fa-rotate-180': isOpen
				'fa-flip-vertical': isOpen
			}]"></span>
		</button>

		<!-- NOTE: might not actually be a child of root element at runtime! Event handling is rather specific -->
		<ul v-show="isOpen && (filteredOptions.length || !editable)"
			:data-menu-id="menuId"
			:dir="dir"
			:class="['combobox-menu', computedMenuClass, dataMenuClass]"

			@keydown.prevent.stop.esc="$refs.focusOnEscClose.focus(); doClose(); /* order is important */"
			@keydown.prevent.stop.down="focusDown"
			@keydown.prevent.stop.right="focusDown"
			@keydown.prevent.stop.up="focusUp"
			@keydown.prevent.stop.left="focusUp"
			@keydown.prevent.stop.tab="$event.shiftKey ? focusUp() : focusDown()"
			@keydown.prevent.stop.page-down="focusOffset(10, false)"
			@keydown.prevent.stop.page-up="focusOffset(-10, false)"
			@keydown.prevent.stop.home="focus(0)"
			@keydown.prevent.stop.end="focus(Number.MAX_SAFE_INTEGER)"

			ref="menu"
		>
			<li class="menu-header">
			<div v-if="loading && editable /* not visible in button when editable */" class="text-center">
				<span class="fa fa-spinner fa-spin text-muted"></span>
			</div><button v-if="resettable && filteredOptions.length"
				type="button"
				tabindex="-1"
				:class="['menu-button menu-reset', 'btn btn-sm', dataClass || 'btn-default']"

				@click="internalModel = {}; inputValue=''"
			>Reset</button><input v-if="searchable && !editable /* When it's available, edit box handles searching */"
				type="text"
				class="form-control input-sm menu-search"
				placeholder="Filter..."
				tabindex="-1"

				:dir="dir"

				@keydown.stop.left
				@keydown.stop.right
				@keydown.stop.home
				@keydown.stop.end
				@keydown.prevent.enter="
					filteredOptions.length < 5 &&
					filteredOptions.filter(o => o.type === 1).length === 1 ?
						select(filteredOptions.filter(o => o.type === 1)[0]) :
						undefined/*prevent submission when embedded in a form*/
				"

				v-model="inputValue"

				ref="focusOnClickOpen"
			/></li>

			<li class="menu-body">
				<ul class="menu-options">
					<li v-if="!filteredOptions.length" class="menu-option disabled">
						<em class="menu-value" v-html="noOptionsPlaceholder"></em>
					</li>
					<template v-for="o in filteredOptions">
					<li v-if="o.type === 1"
						:class="{
							'menu-option': true,
							'active': !multiple && internalModel[o.value],
							'checked': multiple && internalModel[o.value],
							'disabled': o.disabled,
						}"
						:key="o.id"
						:tabindex="o.disabled ? undefined : -1"
						:title="o.title"
						:data-value="o.value"

						@click="select(o); emitChangeOnClose = true;"
						@keydown.prevent.enter="select(o); emitChangeOnClose = true;"
						@keydown.prevent.space="select(o); emitChangeOnClose = true;"
					>
						<span v-if="allowHtml || !o.label || !o.label.trim()" class="menu-value" v-html="o.label && o.label.trim() ? o.label : '&nbsp;'"/>
						<span v-else class="menu-value">{{o.label || ' '}}</span>
						<span v-if="multiple && internalModel[o.value]" class="menu-icon fa fa-check"/>
					</li>
					<li v-else-if="o.type === 2"
						:class="{
							'menu-group': true,
							'disabled': o.disabled,
						}"
						:key="o.id"
						:title="o.title"
					>
						<span v-if="allowHtml" class="menu-value" v-html="o.label"/> <!-- don't nbsp fallback here, we want the height to collapse if there's no label -->
						<span v-else class="menu-value">{{o.label || ' '}}</span>
					</li>
					</template>
				</ul>
			</li>
		</ul>
	</div>
</template>

<script lang="ts">

// tslint:disable

import Vue from 'vue';
import { mapReduce } from '@/utils';

export type SimpleOption = string;

export type Option = {
	value: string;
	label?: string;
	title?: string|null;
	disabled?: boolean;
};
export type OptGroup = {
	label?: string;
	title?: string|null;
	disabled?: boolean;
	options: Array<string|Option>;
};

export type Options = Array<SimpleOption|Option|OptGroup>;

type _uiOpt = {
	type: 1;
	id: number;

	value: string;
	label: string;

	disabled?: boolean;
	title?: string;

	lowerValue: string;
	lowerLabel: string;
};
type _uiOptGroup = {
	type: 2;

	id: number;
	label?: string;
	title?: string;
	disabled?: boolean;
};
type uiOption = _uiOpt|_uiOptGroup;

/** Might also be any other valid css value for 'width', but these values have special behavior in the code */
type MenuWidthMode = 'stretch'|'shrink'|'grow';

function isSimpleOption(e: any): e is string { return typeof e === 'string'; }
function isOption(e: any): e is Option { return e && isSimpleOption(e.value); }
function isOptGroup(e: any): e is OptGroup { return e && typeof e.label === 'string' && Array.isArray(e.options); }

let nextMenuId = 0;

export default Vue.extend({
	props: {
		flip: {
			type: Boolean,
			default: true
		},

		options: { type: Array as () => Option[], default: () => [] as Options },
		multiple: Boolean,
		/** Is the dropdown list filtered by the current value (acts more as an autocomplete) */
		searchable: Boolean,
		/** Allow custom values by the user? */
		editable: Boolean,
		/** Show reset button at top of menu? */
		resettable: Boolean,
		disabled: Boolean,
		placeholder: String,
		noOptionsPlaceholder: {type: String, default: 'No available options.'},
		/** Show a little spinner while the parent is fetching options, or something */
		loading: Boolean,
		/**
		 * Allow values that are not in options, only relevant if !editable
		 * If true, preserve the value, though no entry will exist for it in the dropdown
		 * If false, immediately emit a change event with a corrected value prop
		 */
		allowUnknownValues: Boolean,
		allowEmptyGroups: Boolean,
		/** Show selected values in the selection button or not */
		showValues: { type: Boolean, default: true },
		/** Show value count, only when showValues === false */
		showValueCount: { type: Boolean, default: true },

		// interface options, do not change interaction behavior
		/** Text direction (for rtl support) */
		dir: String,
		allowHtml: Boolean,
		hideDisabled: Boolean,
		/** Hide the default empty value for non-multiple dropdowns */
		hideEmpty: Boolean,
		/** Queryselector for menu container */
		container: String,
		autofocus: Boolean,
		autocomplete: String,
		/** Prevent automatic positioning of the menu. Useful for when placed in a container somewhere and you want it to be position: static */
		noTransform: Boolean,
		/** Force the menu open or closed */
		open: { type: Boolean, default: undefined },

		value: [String, Array] as any as () => string|string[]|null,

		/** attached to top-level container */
		dataWidth: String,
		/** attached to main input/button */
		dataClass: [String, Object],
		dataStyle: [String, Object],
		dataId: String,
		dataName: String,
		dataTitle: String,
		/**
		 * Controls the width of the dropdown menu
		 * - stretch: grow and shrink with the input
		 * - shrink: exactly fit menu content, but shrink with input if that is smaller
		 * - grow: exactly fit menu content, but grow with input if that is larger
		 * - anything else: used as css-value ('auto' works!)
		 */
		dataMenuWidth: {
			type: String as any as () => MenuWidthMode,
			default: 'stretch'
		},
		dataMenuClass: [Array, String, Object],
		/** Right-align the dropdown menu, only when menuWidth != 'stretch' */
		right: Boolean
	},
	data: () =>  ({
		/** Is the menu currently open, overridden by the 'open' prop, i.e. only used when 'open' not specified */
		isNaturallyOpen: false,
		emitChangeOnClose: false,

		/** Search/custom input value, role depends on editable, searchable */
		inputValue: '',

		internalModel: {} as Record<string, boolean>,

		// Can't be computed, need to wait until we are mounted
		// (as container might be a parent element that hasn't fully mounted yet when we init)
		containerEl: null as null|HTMLElement,

		uid: nextMenuId++,
	}),
	computed: {
		menuId(): string { return this.$attrs.id != null ? this.$attrs.id : `combobox-${this.uid}`; },
		isOpen(): boolean { if (this.open != null) { return this.open; } else { return this.isNaturallyOpen; } },

		uiOptions(): uiOption[] {
			let id = 0;
			const mapSimple = (o: SimpleOption, group?: OptGroup): _uiOpt => ({
				type: 1,
				id: id++,

				label: o,
				value: o,
				title: o,

				disabled: group && group.disabled,

				lowerValue: o.toLowerCase(),
				lowerLabel: o.toLowerCase(),
			});

			const mapOption = (o: Option, group?: OptGroup): _uiOpt => ({
				type: 1,
				id: id++,

				value: o.value,
				label: o.label || o.value,
				title: o.title != null ? o.title : undefined,

				disabled: o.disabled || (group && group.disabled),

				lowerValue: o.value.toLowerCase(),
				lowerLabel: (o.label || o.value).toLowerCase()
			});

			const mapGroup = (o: OptGroup): _uiOptGroup => ({
				type: 2,
				id: id++,
				label: o.label,
				title: o.title != null ? o.title : undefined,
				disabled: o.disabled,
			});

			let uiOptions = this.options.flatMap(o => {
				if (isSimpleOption(o)) { return mapSimple(o); }
				else if (isOption(o)) { return mapOption(o); }
				else {
					const h = mapGroup(o);
					const subs: uiOption[] = o.options.map(sub => isSimpleOption(sub) ? mapSimple(sub, o) : mapOption(sub, o));
					subs.unshift(h);
					return (this.allowEmptyGroups || subs.length > 1) ? subs : [];
				}
			});

			// Sometimes we get dropdowns with only a single, empty value. Detect this and remove the option, since it's silly.
			if (!this.multiple && !uiOptions.some(o => o.type === 1 && !!(o.label || o.value))) {
				uiOptions = [];
			}

			// prepend an empty valued option if there is none and the user can't untick values otherwise
			if (!this.multiple && !this.editable && !this.hideEmpty && uiOptions.length && !uiOptions.some(o => o.type === 1 && o.value === '')) {
				const emptyOption: _uiOpt = {
					type: 1,
					id: -1,
					value: '',
					label: '',
					lowerValue: '',
					lowerLabel: '',
				};

				uiOptions.unshift(emptyOption);
			} else if (this.multiple || this.editable) {
				// remove all empty options if the user can edit or otherwise untick values
				uiOptions = uiOptions.filter(o => !(o.type === 1 && !o.value && !o.label));
			}

			return uiOptions;
		},
		uiOptionsMap(): Record<string, _uiOpt> { return mapReduce(this.uiOptions.filter(o => o.type === 1) as _uiOpt[], 'value'); },

		filteredOptions(): uiOption[] {
			let options = this.uiOptions;
			if (this.hideDisabled) {
				let disabledGroup = false;
				options = options.filter(o => {
					if (isOptGroup(o)) { disabledGroup = !!o.disabled; }
					return !(disabledGroup || o.disabled);
				});
			}

			const filter = this.inputValue;
			if (!filter) { return options; }

			let hideNextOptGroup = true;
			return options
			.filter(o => o.type !== 1 || o.lowerLabel.includes(filter) || o.lowerValue.includes(filter) || o.label.includes(filter) || o.value.includes(filter))
			.reverse()
			.filter(o => {
				if (o.type === 2 && hideNextOptGroup) { return false; }
				hideNextOptGroup = o.type !== 1;
				return true;
			})
			.reverse();
		},
		totalOptionCount(): number { return this.uiOptions.filter(o => o.type === 1).length; },

		///////////////

		displayValues(): string[] {
			return Object.keys(this.internalModel)
					.map(k => this.uiOptionsMap[k] /* check first - might be unknown value */ ? this.uiOptionsMap[k].label : k);
		},
		computedMenuClass(): any {
			return {
				[(this as any).dataMenuWidth]: ['grow', 'shrink', 'stretch'].includes((this as any).dataMenuWidth),
				right: this.right,
				static: this.noTransform
			};
		},

		/** We need to watch all these to react to changes and correct any possible stale value/internal state */
		correctModelProps(): any {
			return {
				value: this.value,
				options: this.options,
				editable: this.editable,
				multiple: this.multiple,
				allowUnknownValues: this.allowUnknownValues,
			};
		},
		emitInputEventData(): any {
			return {
				internalModel: this.internalModel,
				inputValue: this.inputValue
			};
		}
	},
	methods: {
		doOpen(focusEl?: HTMLElement): void {
			this.isNaturallyOpen = true;
			if (focusEl && this.isOpen) {
				Vue.nextTick(() => focusEl.focus());
			}
		},
		doClose(event?: Event): void {
			function isChild(parent: Element, child: Element|null) {
				for (child; child; child = child.parentElement) {
					if (child === parent) {
						return true;
					}
				}
				return false;
			}

			if (event && event.type === 'click') {
				const isOwnMenuClick = isChild(this.$refs.menu as HTMLElement, event.target! as HTMLElement);
				// We don't render a label, but outside may want to point a label at our input/button.
				const isOwnLabelClick = (event.target as HTMLElement).closest(`label[for="${(this as any).dataId}"]`) != null;
				// NOTE: assumes the template doesn't render a button as main interactable when this.editable is true
				const isOwnInputClick = this.editable && isChild(this.$el, event.target! as HTMLElement);
				if (isOwnMenuClick || isOwnInputClick || isOwnLabelClick) {
					return;
				}
			}

			// reset option search/filter string
			if (!this.editable && !this.$attrs.open) {
				this.inputValue = '';
			}
			this.isNaturallyOpen = false;
		},

		/** Compute css width + min/max width of the dropdown portion of our menu */
		getWidth(ownRootBoundingRect: ClientRect): Partial<CSSStyleDeclaration> {
			const r: Partial<CSSStyleDeclaration> = {};
			if (!this.containerEl) {
				return r; // there is no need to declare any explicit width on our menu, as it's a child of our $el and our normal css classes handle everything
			}

			let widthMode = this.dataMenuWidth;
			(widthMode as any) = (this as any).dataMenuWidth;
			const width = ownRootBoundingRect.width;

			if (widthMode === 'stretch') {
				r.width =  width + 'px';
				r.maxWidth = '';
				r.minWidth = '';
			} else if (widthMode === 'shrink') {
				r.width = 'auto';
				r.maxWidth = width + 'px';
				r.minWidth = '';
			} else if (widthMode === 'grow') {
				r.width = 'auto';
				r.maxWidth = '';
				r.minWidth = width + 'px';
			} else {
				r.width = widthMode;
				r.maxWidth = '';
				r.minWidth = '';
			}

			return r;
		},

		/**
		 * Compute the css left value for our dropdown menu, relative to our own $el root element.
		 * When the menu is right-aligned, we need to adjust left by the difference in widths between our input element
		 * and the menu's own desired width.
		 *
		 * If the button is 100px wide, and the dropdown is 50px wide, left should be 50px as well
		 *    0px      50px       100px
		 *     ↓        ↓          ↓
		 *     |=======button======|
		 *              |--menu----|
		 *              |----------|
		 *              |          |
		 *            (left)
		 *
		 * If the button is 50px wide, but the dropdown is set to be for example 100px wide
		 *     -50px       0px          50px
		 *       ↓          ↓             ↓
		 *                  |====button===|
		 *       |----------menu----------|
		 *       |---------←100px→--------|
		 *       |                        |
		 *     (left)
		 *
		 * This only needs to be done when our dropdown is right-aligned.
		 * When our dropdown is stretch, or left, or nothing set at all, we just leave "left" unset and it will work implicitly.
		 */
		getHorizontalPosition(ownRootBoundingRect: ClientRect, menuRect: ClientRect) {
			const r: Partial<CSSStyleDeclaration> = {};

			if (!this.right) {
				return r; // no offset, we're left aligned and that's the default for the box model
			}

			const menuLeftOffset = ownRootBoundingRect.width - menuRect.width + 'px';
			r.left = menuLeftOffset;
			return r;
		},

		reposition(): void {
			if (this.noTransform) { return; }

			const root = this.$el as HTMLElement;
			const menu = this.$refs.menu as HTMLElement;

			// These are all styles this function outputs, we need to reset them to their intrinsic value prior to recalculating them or we will interfere with ourselves
			const resetMenuStyles: Partial<CSSStyleDeclaration> = {
				left: '',
				width: '',

				height: '',
				bottom: '',
				top: '',
				marginTop: '',
				marginBottom: '',

				transform: '',
			};
			Object.assign(menu.style, resetMenuStyles);

			let ownRootBoundingRect: ClientRect = root.getBoundingClientRect();
			let menuBoundingRect: ClientRect;
			let liveMenuStyle = window.getComputedStyle(menu); // NOTE: object is not a snapshot, but is the live styles! Setting anything in menu.style updates this!

			// First see if the menu's width is or needs to be set.
			const css: Partial<CSSStyleDeclaration> = this.getWidth(ownRootBoundingRect);
			// Now apply those width parameters, as they might override the menu's intrinsic width.
			// Then get the menu's resolved size (positioning is not important yet). Take care to display it first or everything will be 0
			Object.assign(menu.style, css);
			const initialStyleDisplay = liveMenuStyle.display;
			menu.style.display = 'block';
			menuBoundingRect = menu.getBoundingClientRect();
			menu.style.display = initialStyleDisplay;
			// Now apply any explicit left/right offset due to requested menu-alignment (left/right aligned dropdown)
			Object.assign(css, this.getHorizontalPosition(ownRootBoundingRect, menuBoundingRect));

			// We now have the following properties of the dropdown menu
			// its final width
			// its intrinsic height (we haven't set any css that overrides its width so far)
			// its horizontal offset relative to our input button

			// Continue with step two: flipping the menu above or below the input, depending on available height in the screen
			let menuFlipped = false;
			if (this.flip) {
				const visibleWindowHeight: number = document.documentElement.clientHeight;
				const menuMargin: number = Number(liveMenuStyle.marginTop!.slice(0, -2)) + Number(liveMenuStyle.marginBottom!.slice(0, -2)); // remove 'px' suffixes and convert to number

				const spaceBelow =  Math.max(0, visibleWindowHeight - ownRootBoundingRect.bottom);
				const spaceAbove = Math.max(0, ownRootBoundingRect.top);
				const wantedHeight = menuMargin + menuBoundingRect.height;

				menuFlipped = spaceAbove > spaceBelow && spaceBelow < wantedHeight;
				const availableHeight = menuFlipped ? spaceAbove : spaceBelow;
				// If there is less vertical space than we need both above and below our button, force our menu to be less tall so it fits
				const compress = availableHeight < wantedHeight;

				if (menuFlipped) {
					css.marginTop = liveMenuStyle.marginBottom;
					css.marginBottom = liveMenuStyle.marginTop;
					css.bottom = '100%';
					css.top = 'auto';
				}
				if (compress) {
					css.height = availableHeight - menuMargin + 'px';
				}
			}

			// Finally, we have set the menu's top, buttom, and left properties assuming it's a child of our root element
			// But this isn't always the case.
			// If it isn't, move the menu by the difference in position between its actual parent and our root element.
			if (this.containerEl) {
				const containerBoundingRect = this.containerEl.getBoundingClientRect();
				const top = menuFlipped ? ownRootBoundingRect.top - containerBoundingRect.top : ownRootBoundingRect.bottom - containerBoundingRect.top;
				const left = ownRootBoundingRect.left - containerBoundingRect.left;

				css.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
			}

			Object.assign(menu.style, css);
		},

		focusDown(): void {this.focusOffset(1); },
		focusUp(): void { this.focusOffset(-1); },
		focusOffset(offset: number, loop = true): void {
			const menu = this.$refs.menu as HTMLElement;
			const items = [...menu.querySelectorAll('[tabindex]')];
			if (!items.length) {
				return;
			}

			const currentFocusIndex = items.findIndex(e => e === document.activeElement);
			// if arrow up is pressed, and nothing is in focus, we should focus the last element
			// but if we offset -1 we move to the last index - 1, which isn't correct.
			// so correct for that.
			if (currentFocusIndex < 0 && offset < 0) {
				offset++;
			}
			const focusIndex = loop ?
				this.loopingIncrementor(currentFocusIndex, items.length, offset).next() :
				Math.max(0, Math.min(currentFocusIndex + offset, items.length - 1));
			this.focus(items[focusIndex] as HTMLElement);
		},
		focus(v?: HTMLElement|number): void {
			let el: HTMLElement|undefined;

			if (typeof v === 'number') {
				const items = [...(this.$refs.menu as HTMLElement).querySelectorAll('.menu-option:not(.disabled)')];
				el = items[Math.min(Math.max(0, v), items.length - 1)] as HTMLElement;
			} else {
				el = v;
			}

			if (!this.isNaturallyOpen) {
				this.doOpen(el);
			} else if (el) {
				el.focus();
			}
		},

		select(opt: {disabled?: boolean, value: string}): void {
			const {disabled, value} = opt;

			if (disabled) {
				return;
			}

			if (this.editable) {
				// If editable, internalModel is unused
				this.inputValue = value;
				this.doClose();
				return;
			}

			const deleteFromModel =
				this.multiple && this.internalModel[value] ? [value] : // multiple values and value already selected -> delete value
				!this.multiple && !this.internalModel[value] ? Object.keys(this.internalModel) : // single value allowed and value not already selected -> delete all previous values
				[]; // Single select and already selected, or something.

			const addToModel =
				this.multiple && !this.internalModel[value] ? value : // multiple values and value not already selected -> add value
				!this.multiple && !!value && !this.internalModel[value] ? value : // single value and not '' (clear selection) and not already selected -> add as well
				undefined;

			for (const key of deleteFromModel) {
				Vue.delete(this.internalModel, key);
			}
			if (addToModel) {
				Vue.set(this.internalModel, addToModel, true);
				this.$emit('select', addToModel);
			}

			if (!this.multiple) {
				this.doClose();
			}
		},

		//////////////////
		addGlobalListeners() { this.addGlobalCloseListeners(); this.addGlobalScrollListeners(); },
		removeGlobalListeners() { this.removeGlobalCloseListeners(); this.removeGlobalScrollListeners(); },
		addGlobalCloseListeners() { document.addEventListener('click', this.doClose); },
		removeGlobalCloseListeners() { document.removeEventListener('click', this.doClose); },
		addGlobalScrollListeners() {
			window.addEventListener('resize', this.reposition);
			document.addEventListener('scroll', this.reposition); // required if any of our parents has for position:sticky
			for (let parent = this.$el && this.$el.parentElement; parent != null; parent = parent.parentElement) {
				parent.addEventListener('scroll', this.reposition);
			}
		},
		removeGlobalScrollListeners() {
			window.removeEventListener('resize', this.reposition);
			document.removeEventListener('scroll', this.reposition); // required if any of our parents has for position:sticky
			for (let parent = this.$el && this.$el.parentElement; parent != null; parent = parent.parentElement) {
				parent.removeEventListener('scroll', this.reposition);
			}
		},

		loopingIncrementor(initial: number, max: number, increment: number) {
			let cur = initial;
			return {
				next() {
					const next = (cur + increment) % max;
					cur = next < 0 ? next + max : next;
					return cur;
				},
				get current() { return cur; }
			};
		},

		correctModel(newVal: null|undefined|string|string[]) {
			if (this.editable) {
				this.inputValue = (newVal ? typeof newVal === 'string' ? newVal : newVal[0] || '' : '');
				return;
			}

			// Correct type of the new value. e.g. array for multiple, otherwise string
			if (!newVal) { newVal = this.multiple ? [] : null; }
			else if (this.multiple && typeof newVal === 'string') { newVal = [newVal]; }
			else if (!this.multiple && Array.isArray(newVal)) { newVal = typeof newVal[0] === 'string' ? newVal[0] : null; }

			if (!this.multiple) {
				newVal = newVal as string|null; // we verified above, but can't declare it to be a type...
				const oldVals = Object.keys(this.internalModel);

				if (newVal == null) {
					if (oldVals.length !== 0) { this.internalModel = {}; }
					// else oldvals.length === 0 -- already at "unset" state, so a null value is perfectly fine
					return;
				} else {
					if (oldVals.length === 0) {
						if (this.uiOptionsMap[newVal] || this.allowUnknownValues) { this.internalModel = { [newVal]: true }; }
						else { this.internalModel = {}; } // unknown value. Replace model with an empty one so we re-emit our correct "unset" value
					} else {
						// have (one or more) old value(s), and a new value, compare.
						if (oldVals.length === 1 && oldVals[0] === newVal) { return; }
						else if (this.uiOptionsMap[newVal] || this.allowUnknownValues) { this.internalModel = { [newVal]: true }; } // replace whatever we had with the new value, seeing as its different.
						else { this.internalModel = {}; } // unknown value. Replace model with an empty one so we re-emit our correct "unset" value
					}
				}
			} else {
				// NOTE:
				// at this point, this.uiOptions is up to date with any (potential) new options prop
				// however, this.internalModel is not yet updated, so still contains handles to (possibly stale) options

				const newValues = new Set<string>(newVal as string[]);
				const oldValues = this.internalModel;
				const availableOptions = this.uiOptionsMap;

				/** no longer in :value array - guaranteed deselect or is actually in :value array but not available as option (and unknowns are not allowed) */
				const deselectedValues: string[] = Object.keys(oldValues).filter(v => !newValues.has(v) || (!availableOptions[v] && !this.allowUnknownValues));

				/** wasn't in previous :value array but is now - guaranteed selected and a corresponding option exists, or we allow unknowns */
				const newSelectedValues: string[] = (newVal as string[]).filter(v => !oldValues[v] && (availableOptions[v] || this.allowUnknownValues));

				deselectedValues.forEach(v => Vue.delete(this.internalModel, v));
				newSelectedValues.forEach(v => Vue.set(this.internalModel, v, true));
			}
		}
	},
	watch: {
		emitInputEventData() {
			if (this.editable) {
				this.$emit('input', this.inputValue);
			} else {
				// Model only edited when actually required, so always fire input event
				// So if this triggers we know for sure the value output also needs to change

				// But maybe the model only changed because we got pushed a new value from props
				// check that this is not the case.
				const values = Object.keys(this.internalModel);
				if (this.multiple && Array.isArray(this.value) && values.length === this.value.length && values.every(v => (this.value as string[]).includes(v))) { return; } // our value prop is already up to date - don't fire.
				if (!this.multiple && typeof this.value === 'string' && values.length == 1 && values[0] === this.value) { return; }
				this.$emit('input', values.length ? this.multiple ? values : values[0] : null);
			}
		},
		isOpen: {
			immediate: true,
			handler(cur: boolean) {
				if (cur) {
					// Add a small delay on adding click listeners, or we risk intercepting our own bubbling opening click
					// and immediately closing
					// Use requestAnimationFrame because vue.nextTick is too early (event is still bubbling).
					requestAnimationFrame(() => this.addGlobalListeners());
					if (this.containerEl || this.flip) {
						this.reposition();
					}
				} else {
					this.removeGlobalListeners();
					if (this.emitChangeOnClose) {
						this.emitChangeOnClose = false;
						const values = Object.keys(this.internalModel);
						this.$emit('change',
							this.editable ? this.inputValue :
							this.multiple ? values :
							values.length ? values[0] : null // not multiple - single value
						);
					}
				}
			}
		},

		// Not immediate on purpose, as the element might be part of a nother vue component that needs some time to mount
		// The initial change is set in mounted()
		container(v: string) {
			this.containerEl = v ? document.querySelector(v) : null;
		},
		containerEl: {
			immediate: true,
			handler(cur: HTMLElement|null, prev: HTMLElement|null) {
				if (this.isOpen) {
					if (prev) { this.removeGlobalScrollListeners(); }
					if (cur) { this.addGlobalScrollListeners(); }
				}

				if (cur) {
					cur.appendChild(this.$refs.menu as HTMLElement);
					if (this.isOpen) {
						this.reposition();
					}
				}
			}
		},

		correctModelProps: {
			immediate: true,
			handler() { this.correctModel(this.value); }
		},
		editable(v: boolean) { if (!v && !this.searchable) { this.inputValue = ''; } if (v) { this.internalModel = {}; }},
		searchable(v: boolean) { if (!v && !this.editable) { this.inputValue = ''; } },
	},
	mounted() {
		// Only do this when mounted, the container selector may refer to a parent element
		// And we need to wait for it to mount before we can select it and attach to it
		if (this.container) {
			this.containerEl = document.querySelector(this.container);
		}
		// @ts-ignore
		(this.$el).setValue = (v: string|string[]) => this.$emit('input', this.multiple ? [v].flat().filter(v => v != null) : v || null);
	},
	beforeDestroy() {
		this.removeGlobalListeners();
		// In case container has been set.
		(this.$refs.menu as HTMLElement).parentElement!.removeChild(this.$refs.menu as HTMLElement);

		// @ts-ignore
		this.$el.setValue = undefined;
	},
});
</script>

<style lang="scss">

.combobox,
.combobox-menu {
	.menu-value {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.menu-icon {
		display: inline-block;
		flex: none;
		margin: 0 4px;
		transition: transform 0.2s ease-out;
	}
	.placeholder {
		color: #999;
	}

	&:hover,
	&:focus {
		.placeholder {
			color: inherit;
		}
	}
}

.combobox {
	text-align: left;
	&[dir="rtl"] {
		text-align: right;
	}

	// Bootstrap helper
	&:not(.input-group-btn):not(.input-group-addon) {
		display: inline-block;
		position: relative;
		vertical-align: middle; // mimic bootstrap btn
		width: 220px; // just some default

		>.menu-button {
			width: 100%;
		}
	}
	&.input-group-btn:first-child,
	&.input-group-addon:first-child {
		>.menu-button { border-right-width: 0; }
	}

	>.menu-button {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		text-align: inherit;

		>.menu-icon {
			flex: none;
			flex-grow: 0;
			flex-shrink: 0;
			flex-basis: auto;
			margin-right: 0;
		}
		>.badge {
			background-color: #999;
			&.active {
				background-color: #333
			}
		}
		>.menu-value {
			flex-grow: 1;
		}
	}

	>.combobox-menu {
		top: auto;

		&.stretch {
			width: 100%;
			min-width: 0;
			max-width: none;
		}
		&.shrink {
			width: auto;
			max-width: 100%;
			min-width: 0;
		}
		&.grow {
			width: auto;
			max-width: none;
			min-width: 100%;
		}

		&.right {
			left: unset;
			right: 0;
		}
	}
}

.combobox-menu {
	background: white;
	border: 1px solid #e5e5e5;
	border-radius: 4px;
	box-shadow: 0 6px 12px rgba(0,0,0,.175);
	display: flex;
	flex-direction: column;
	font-size: 14px;
	left: 0;
	margin-top: 3px;
	// max-width: none;
	// min-width: 100%;
	overflow-y: auto;
	padding: 5px 0;
	position: absolute;
	top: 0;
	// width: auto;
	z-index: 1050;

	&.static {
		position: static;
		box-shadow: none;
		border: none;
		z-index: 0;
		top: inherit;
		left: inherit;
		right: inherit;
		bottom: inherit;
		margin: 0;
		border-radius: 0;
	}

	text-align: left;
	&[dir="rtl"] {
		text-align: right;
	}


	ul {
		padding: 0;
		margin: 0;
		list-style: none;
	}

	>.menu-header {
		border-bottom: 1px solid #e5e5e5;
		display: block;
		margin: -5px 0 3px; //offset padding at top of .menu
		padding: 6px;

		&:empty { display: none; }

		>.menu-reset {
			display: block;
			width: 100%;
			&+.menu-search { margin-top: 6px; }
		}
		>.menu-search {
			width: 100%;
			display: block;
		}
	}
	>.menu-body {
		display: flex;
		flex-direction: vertical;
		max-height: 300px;
		overflow: auto;
	}

	.menu-options {
		width: 100%;
	}

	.menu-option {
		align-items: baseline;
		justify-content: space-between;
		color: #333;
		cursor: pointer;
		display: flex;
		padding: 4px 12px;
		white-space: nowrap;
		width: 100%;

		&.disabled {
			color: #777;
			cursor: not-allowed;
		}
		&.active {
			background: #337ab7;
			color: white;
			font-weight: bold;
			.text-muted { color :white; }
		}
		&.checked {
			font-weight: bold;
		}
		&.active.disabled,
		&.checked.disabled {
			opacity: .65;
		}

		&:not(.active):not(.disabled):not(.checked) {
			&:hover,
			&:focus,
			&:active {
				background: #ddd;
				color: #262626;
			}
		}
	}

	.menu-group {
		border-bottom: 1px solid #e5e5e5;
		color: #777;
		display: flex;
		font-size: 12px;
		margin-bottom: 3px;
		padding: 8px 0px 4px;
		width: 100%;

		&.disabled {
			color: #777;
			cursor: not-allowed;
		}
	}

	&:not([dir="rtl"]) {
		.menu-option { padding-left: 22px; }
		.menu-group { padding-left: 12px; }
	}
	&[dir="rtl"] {
		.menu-option { padding-right: 22px; }
		.menu-group { padding-right: 12px; }
	}
}

.input-group {
	.combobox:not(:last-child) {
		> button,
		> input[type="text"] {
			border-top-right-radius: 0;
			border-bottom-right-radius: 0;
		}
	}

	.combobox:not(:first-child) {
		> button,
		> input[type="text"] {
			border-top-left-radius: 0;
			border-bottom-left-radius: 0;
		}
	}
}

</style>