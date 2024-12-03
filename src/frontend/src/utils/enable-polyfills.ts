// Only DOM polyfills here.
// Javascript polyfills are automatically included by babel (preset-env)

// from:https://github.com/jserz/js_piece/blob/master/DOM/ChildNode/remove()/remove().md
([Element.prototype, CharacterData.prototype, DocumentType.prototype])
.filter(e => !e.hasOwnProperty('remove'))
.forEach(item => Object.defineProperty(item, 'remove', {
	configurable: true,
	enumerable: true,
	writable: true,
	value: function remove() {
		if (this.parentNode !== null) {
			this.parentNode.removeChild(this);
		}
	}
}));

if (!Element.prototype.matches) {
	// @ts-ignore
	Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
}

if (!Element.prototype.closest) {
	Element.prototype.closest = function(s: string) {
		let el: any = this;
		do {
			if (el.matches(s)) {
				return el;
			}
			el = el.parentElement || el.parentNode;
		} while (el !== null && el.nodeType === 1);
		return null;
	};
}

// Useful for customjs scripts.
// NOTE: we will probably remove jquery when we port to vue 3.
import _$ from 'jquery';
(window as any).jquery = (window as any).$ = _$;
