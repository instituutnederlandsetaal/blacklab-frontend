
# Exports

## Show / Hide 
Show or hide the export button

```js [Enable/Disable]
vuexModules.ui.actions.results.shared.exportEnabled(false);
```

## Exported Data

```js [Which data]
// Which annotations are included in the export
vuexModules.ui.actions.results.shared.detailedAnnotationIds(['word', 'lemma', 'pos_full']);
// Which metadata fields are included in the export
vuexModules.ui.actions.results.shared.detailedMetadataIds(['title', 'author']);
```

## Description in Export File

Customize the description at the top of the export file. This is useful for providing context or instructions for the exported data.

::: code-group
```js [Code]
frontend.customize(corpus => {
	/** @param {BLSearchSummary} blSummary */
	corpus.results.csvDescription = function(blSummary, fieldDisplayNameFunc: (name, baseFieldName) => string) {
		return `Exported from ${corpus._corpus.displayName} on ${new Date().toLocaleDateString()}.\n\n` +
			`This export includes the following fields:\n` +
			`- ${fieldDisplayNameFunc('title', 'title')}\n` +
			`- ${fieldDisplayNameFunc('author', 'author')}\n` +
			`- ${fieldDisplayNameFunc('date', 'date')}\n\n` +
			`For more information, visit our documentation.`;
	}
})
```
<<< @/../../src/frontend/src/types/blacklabtypes.ts#docssearchsummary [Type Definitions]
:::