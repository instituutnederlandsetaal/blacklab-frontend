The title rows use the `specialFields` property from the `.blf.yaml` file to automatically show the document title, author, and date. But you can also customize this using a custom function.  
--> [BlackLab docs](https://blacklab.ivdnt.org/guide/how-to-configure-indexing.html#corpus-metadata)

```js
/**
 * @param metadata all metadata of the document, in the form of { [fieldName: string]: string[] }
 * @param specialFields the names of the pid, title, author, and date fields, in the shape of 
  { 
    authorField: string, 
    pidField: string, 
    dateField: string, 
    titleField: string 
  }
  @returns {string}
*/
vuexModules.ui.getState().results.shared.getDocumentSummary = function(metadata, specialFields) {
  return 'Title: ' + (metadata[specialFields.titleField]?.[0] || 'Unknown');
};
```