--- 
title: 🧪 New Customization API
---

# New Callback-based API (Experimental) 

As an experiment, we're trying out a different approach for some new customizations. In your `custom.js` file(s), you can now use code like the following:

```js
frontend.customize((corpus) => {
	// Your customizations follow here.
	
	// For example:
	// Hide the field 'bad-field' from the metadata;
	corpus.search.metadata.show = function (fieldName) {
		if (fieldName === 'bad-field')
			return false;
		return null;
	};
	// Etc.
	
});
```

This code will be called while your corpus is initializing.

The `corpus` object represents a more abstract customization API for your corpus. Here's a list of the current customization mechanisms.

### Hide metadata fields

Normally all metadata fields are shown. If you wish to hide some, you can use the following code:

```js
corpus.search.metadata.showField = function (name) {
	if (name === 'bad-field')
		return false; // hide this field
	return null; // default behaviour
};
```



### Add span filters (to filter by part of documents)

To add an extra tab where you can filter by part of the document, such as only searching in certain types of named entity, or speech by one person:

```js
const m = corpus.search.metadata;
m.addCustomTab(
	'Span filters',
	[
		m.createSpanFilter('named-entity', 'type'),
		m.createSpanFilter('speech', 'person'),
	]
);
```

Parameters for `createSpanFilter`:

- Span name (e.g. `named-entity`)
- Attribute name (e.g. `type`)
- Widget to use. Can be `'auto'`, `'text'`, `'select'`, or `'range'`. `'auto'` is the default and will choose between `text` and `select` based on the number of unique values.
- Display name of the filter (optional). See also [internationalization](#internationalization).
- Metadata object (optional). You can override the options for a select widget here (default are all the actual values in the corpus).


### Customize what span attributes we can group on

```js
corpus.grouping.includeSpanAttribute = function (name, attrName) {
	if (name === 'boring-span')
		return false; // no grouping on any of this span's attributes
	if (name === 'named-entity' && attrName === 'id')
		return false; // don't offer grouping on this attribute
	return null; // default behaviour (any attribute with a span filter)
};
```

### Customize the within widget

  
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


### Customize match info higlight style

Match info is any explicit captures (e.g. `A:[] "cow"`), spans (e.g. `<named-entity type='loc' />`), or relations (`_ -nsubj-> _`) that were encountered while resolving your query.

```js
corpus.results.matchInfoHighlightStyle = function (matchInfo) {
	if (matchInfo.isRelation) {
		// Show hover highlight for words
		if (matchInfo.relType === 'word-alignment')
			return 'hover';
		// Don't show other relations
		return 'none';
	}
	// Always highlight any named entities captured by our query
	// (e.g. <named-entity/> containing "dog")
	if (matchInfo.key === 'named-entity')
		return 'static';

	// Default highlighting behaviour
	// ("highlight non-relations if there's explicit captures in the query")
	return null;
};
```
