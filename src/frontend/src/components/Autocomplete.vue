<template>
	<input
		:autocomplete="!autocomplete"
		@keypress="_refreshList"
		@keyup.left="_refreshList"
		@keyup.right="_refreshList"
		@click="_refreshList"
		v-model="modelvalue"
	/>
</template>

<script lang="ts">
import Vue from 'vue';

import $ from 'jquery';
import 'jquery-ui';
import 'jquery-ui/ui/widgets/autocomplete';

import {splitIntoTerms} from '@/utils';

// Inherit jQueryUI autocomplete widget and customize the rendering
// to apply some bootstrap classes and structure
// Jesse: renderMenu en renderItem mee kunnen geven??
$.widget('custom.autocomplete', $.ui.autocomplete, {
	_renderMenu(ul: HTMLUListElement, items: any) {
		const self = this;
		$.each(items, function(index, item) {
			self._renderItem(ul, item);
		});
	},
	_renderItem(ul: HTMLUListElement, item: { value: string, label: string }) {
		$('<li></li>')
			.attr('value', item.value)
			.html('<a>' + item.label + '</a>')
			.data('ui-autocomplete-item', item)
			.appendTo(ul);
	},
	_resizeMenu() {
		$((this as any).menu.element).css({
			'max-height': '300px',
			'overflow-y': 'auto',
			'overflow-x': 'hidden',
			'width': 'auto',
			'min-width': $(this.element).outerWidth(),
			'max-width': '500px'
		} as JQuery.PlainObject);
	}
});

export default Vue.extend({
	props: {
		value: String,
		url: String,
		/** alternative to url, use this to get the data yourself. */
		getData: Function as any as () => (term: string) => Promise<string[]>,
		/** Process the data before it is displayed. Work on both getData and url. */
		processData: Function as any as () => (data: any) => string[],
		autocomplete: {
			default: true,
			type: Boolean
		},
		useQuoteAsWordBoundary: Boolean,
	},
	data: () => ({
		withCredentials: WITH_CREDENTIALS,
	}),
	computed: {
		modelvalue: {
			get(): string { return this.value; },
			set(v: string) { this.$emit('input', v); this.$emit('change', v); }
		}
	},
	methods: {
		_createAutocomplete() {
			const $input = $(this.$el);
			const self = this;
			let lastSearchValue = '';
			let lastSearchResults: string[]|undefined;
			$input.autocomplete({
				// Show values when at least 1 letter is present in the input
				minLength: 1,
				classes: {
					'ui-autocomplete': 'dropdown-menu'
				},
				source(params: any, render: (v: string[]) => void) {
					if (!self.getData && !self.url) return;

					const {value} = self._getWordAroundCursor(false);
					if (!value.length) return;
					if (value === lastSearchValue && lastSearchResults) return render(lastSearchResults);
					lastSearchValue = value;

					const getData = (self.getData && self.getData(value)) || $.ajax({
						method: 'GET',
						url: self.url,
						data: {term: value},
						dataType: 'json',
						xhrFields: {
							withCredentials: self.withCredentials
						}
					});

					getData.then(r => {
						if (value !== lastSearchValue) return; // stale data.
						if (self.processData) r = self.processData(r);
						lastSearchResults = r;
						render(r);
					});
				},
				create() {
					// This element has a div appended every time an element is highlighted
					// but they are never removed... remove this element for now
					$('.ui-helper-hidden-accessible').remove();
				},
				// Manually fire dom change event as autocomplete doesn't fire it when user selects a value
				// and we require change events in other parts of the code.
				select(event, ui) {
					self._autocompleteSelected(ui.item.value);
					return false;
				},
				focus(event, ui) {
					event.preventDefault();
					// prevent jquery from previewing the entire value in the input field.
					// since we run custom value logic
				}
			});
		},
		_destroyAutocomplete() { $(this.$el).autocomplete('destroy'); },
		_refreshList(e: Event) { if (!this.autocomplete) { return; } $(e.target as HTMLElement).autocomplete('search'); },

		/**
		 * @param lookForward select until next whitespace, or only look back
		 */
		_getWordAroundCursor(lookForward: boolean): {start: number, end: number, value: string} {
			const input = this.$el as HTMLInputElement;
			const value = input.value;
			const nothingFound = {value : '', start: 0, end: value.length};
			if (value.length > 100) {
				return nothingFound;
			}

			let start = input.selectionStart != null ? input.selectionStart : 0;
			let end = input.selectionEnd != null ? input.selectionEnd : value.length;
			if (start > end) { const tmp = start; start = end; end = tmp; }

			if (start === end) { // just a caret; no selection, find whitespace boundaries around cursor
				// start - 1 because splitIntoTerms takes quotes into consideration by default, but we do not.
				const term =  splitIntoTerms(value, this.useQuoteAsWordBoundary).find(t => t.end >= (start -1))
				if (!term) {
					return nothingFound;
				}
				if (lookForward) {
					return term;
				}
				// We have a term but aren't supposed to look beyond the cursor end index, strip everything beyond it from the found term.
				return {
					start: term.isQuoted ? term.start + 1 : term.start,
					end: Math.min(term.end, end),
					value: term.value.substring(0, end - term.start)
				}
			}

			return { start, end, value: value.substring(start, end) };
		},
		_autocompleteSelected(v: string) {
			if (this.useQuoteAsWordBoundary && v.match(/\s/)) v = `"${v}"`;

			const input = this.$el as HTMLInputElement;
			const value = input.value;

			const {start, end}: {start: number; end: number;} = this._getWordAroundCursor(true);

			input.value = value.substring(0, start) + v + value.substring(end);
			input.selectionStart = start+v.length+1;
			input.selectionEnd = start+v.length+1;

			let event: Event;
			if(typeof(Event) === 'function') {
				event = new Event('input');
			}else{
				event = document.createEvent('Event');
				event.initEvent('input', true, true);
			}
			input.dispatchEvent(event);

		}
	},
	mounted() { if (this.autocomplete) { this._createAutocomplete(); }},
	beforeDestroy() { if (this.autocomplete) { this._destroyAutocomplete(); }},
	watch: {
		autocomplete(v: boolean) {
			v ? this._createAutocomplete() : this._destroyAutocomplete();
		},
	}
});
</script>
