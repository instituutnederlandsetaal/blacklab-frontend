## Within

It's also possible to set which tags are shown (and how) in `within`.
You can only add tags that you actually index (using the [inlineTags options](https://blacklab.ivdnt.org/guide/index-your-data/spans.html) in your index config yaml)
```js
vuexModules.ui.actions.search.shared.within.elements({
	title: 'Tooltip here (optional)',
	label: 'Sentence',
	value: 's'
}); 
```

Lastly, if your corpus has dependency relations, you can set which inline tag is used for the sentence boundary when viewing a hit's dependency tree.
The tree component will then show all words between two of these tags.
There is rudimentary autodetection that tries to find the most likely tag, but you can override this by setting the tag manually.
```js
vuexModules.ui.acions.search.shared.within.sentenceBoundary('s')
```


To hide the `within` altogether:

```js
vuexModules.ui.actions.search.shared.within.enable(false);
```

## Attributes 


```js
// Customize which spans are shown in the within widget
corpus.search.within.includeSpan = function (name) {
	if (name === 'boring-span')
		return false; // hide this span
	return null; // default behaviour (all spans)
};
// Customize if fields for any attributes are shown in
// the within widget when selecting certain spans 
corpus.search.within.includeAttribute = function (name, attrName) {
	if (name === 'chapter') {
		// show this attribute
		return attrName === 'number';
	}
	return null; // default behaviour (no attributes)
};
```
