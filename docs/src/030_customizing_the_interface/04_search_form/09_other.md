# Other helpers and utilities/workflow for customization

<!-- @include: ../_custom_js_tip.md -->

## Move an annotation/metadata field to a different group after the fact

Where fields are located in the UI is dependent on the [metadataFieldGroups](./filters.md#organize-filters-in-tabs) and [annotationGroups](./extended_search.md#group-annotations-in-tabs). 
This means that to change the location of a field through BlackLab, you would have to reindex your data. Understandably this is annoying, so the Frontend has some basic functionality to move a field:

```js [usage]
vuexModules.ui.actions.helpers.moveAnnotationToGroup('word', 'Basics'); 
vuexModules.ui.actions.helpers.moveMetadataToGroup('myMetadataField', 'Date'); 
```

