# Show or Hide Annotations and Metadata

We have a simple way to quickly show or hide widgets for Annotations & Metadata in the interface. 

This is just a shorthand method of configuring several parts of the UI. Individual features can also be configured one by one. Refer to the [source code](@github:/src/frontend/src/store/search/ui.ts) for the full details. All of this module's exports are exposed under `window.vuexModules.ui`.

--------

First run (from the browser console) `printCustomJs()`.
You will see (approximately) the following output. The printed javascript  reflects the current settings of the page.

```js
var x = true;
var ui = vuexModules.ui.actions;
ui.helpers.configureAnnotations([
	[                   ,    'EXTENDED'    ,    'ADVANCED'    ,    'EXPLORE'    ,    'SORT'    ,    'GROUP'    ,    'RESULTS'    ,    'CONCORDANCE'    ],

	// Basics
	['word'             ,        x         ,        x         ,        x        ,      x       ,       x       ,                 ,                     ],
	['lemma'            ,        x         ,        x         ,        x        ,              ,               ,                 ,                     ],
	['pos'              ,        x         ,        x         ,        x        ,              ,               ,                 ,                     ],
	// (not in any group)
	['punct'            ,                  ,                  ,                 ,              ,               ,                 ,                     ],
	['starttag'         ,                  ,                  ,                 ,              ,               ,                 ,                     ],
	['word_id'          ,                  ,                  ,                 ,              ,               ,                 ,          x          ],
	// ...
]);

ui.helpers.configureMetadata([
	[                                      ,    'FILTER'    ,    'SORT'    ,    'GROUP'    ,    'RESULTS/HITS'    ,    'RESULTS/DOCS'    ,    'EXPORT'    ],

	// Date
	['datering'                            ,                ,      x       ,       x       ,                      ,          x           ,                ],
	['decade'                              ,                ,      x       ,       x       ,                      ,                      ,                ],

	// Localization
	['country'                             ,       x        ,      x       ,       x       ,                      ,                      ,                ],
	['region'                              ,       x        ,      x       ,       x       ,                      ,                      ,                ],
	['place'                               ,       x        ,      x       ,       x       ,                      ,                      ,                ],
	// ...
]);
```

You can now paste this code into your corpus's `custom.js` file and edit the cells.

The `configureAnnotations` columns configure the following:
- **EXTENDED**: Make the annotation appear in the `Extended` search tab.
- **ADVANCED**: Make the annotation appear in the `Advanced/QueryBuilder` search tab.
- **EXPLORE**: Make the annotation one of the options in the appear in the the `N-Gram` form.
- **SORT**: Make this annotation one of the options in the `Sort by` dropdown (below the `hits` results table). _(Requires the forward index to be enabled for this annotation)_
- **GROUP**: Make this annotation available for grouping. This affects whether it is shown in the `Group by` dropdown options above the results table, and in the `N-Gram` and `Statistics` dropdowns in the `Explore` forms. _(Requires the forward index to be enabled for this annotation)_
- **RESULTS**: Make a separate column in the `hits` table that shows this annotation's value for every hit (typically enabled by default for `lemma` and `pos`).
- **CONCORDANCE**: Show the value for this annotation when opening a hit's details in the `hits` table.

Similarly, these are the meanings of the columns in `configureMetadata`:
- **FILTER**: Make this metadata field available as a filter. (Filters are shown for `Extended`, `Advanced/QueryBuilder`, `Expert`, and all `Explore` forms.
- **SORT**: Make this metadata field one of the options in the `Sort by` dropdown (below the `Per hit` and `Per document` results tables.
- **GROUP**: Make this metadata field avaiable for grouping. This affects whether it is shown in the `Per hit`, `Per document`, and `Statistics` form under `Explore`.
- **RESULTS/HITS**: Show a column in the `Per hit` table detailing the metadata for every hit's document.
- **RESULTS/DOCS**: Show a column in the `Per document` table with the document's metadata.
- **EXPORT**: Whether to include this metadata in result exports.

Any columns that are completely empty (not one annotation/metadata is checked) are left at their default values. For most things this means everything in an annotation/metadata group is shown, unless no groups are defined, in which case everything not marked `isInternal` is shown.

::: warning 
Empty columns are ignored and will use the defaults, so you can leave out any column you don't want to configure.  
To hide every option in a category, use the dedicated JS API functions.
:::
