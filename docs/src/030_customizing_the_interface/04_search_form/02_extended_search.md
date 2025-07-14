# Extended Search

Extended search lets you search multiple fields at once.
By default every `annotation` in your corpus is shown here, but you can limit or organize the selection as you see fit.


## Group annotations in tabs

![Annotation Groups](./annotation_groups.png)

Grouping Annotations can currently only be done through BlackLab, by using the `annotationGroups` setting in the `.blf.yaml` configuration.  

See the [BlackLab docs](https://blacklab.ivdnt.org/guide/how-to-configure-indexing.html#full-example-of-a-configuration-file) for more info on that.

Here is a simple snippet illustrating the config for the example image.
The ids here are just an example, in reality they depend entirely on your own configuration!

```yaml
# my-corpus-format.blf.yaml
corpusConfig: 
  annotationGroups: 
    contents: 
    - name: Basics
      annotations: 
      - word
      - lemma
      - pos
    - name: More annotations
      annotations: 
      - example
      # etc...
```

::: tip
If you've defined groups, any leftover annotations are put in a "remainder" group, which is hidden by default!
:::

## Order of annotations

The order of fields on the page is taken from the [annotationGroups](https://blacklab.ivdnt.org/guide/how-to-configure-indexing.html#full-example-of-a-configuration-file) in the BlackLab `.blf.yaml` used to create the corpus, falling back to order of declaration for fields not inside a group.

It's not currently possible to change the display order of these fields using the JS API.

## Show or Hide annotations

<!-- @include: ../_table_based_layout_tip.md -->

Alternatively, these are the dedicated functions: 

::: code-group
```js [usage]
vuexModules.ui.actions.search.extended.searchAnnotationIds(['word', 'lemma']); 
```

```ts [definition]
function searchAnnotationIds(ids: string[]): void;
```

:::

## Split-Batch

Split batch search is a feature that quickly allows you search for multiple terms in quick succession.
It will split your query into many small subqueries, which are put in the history. 

For example a query like `[word="a|b" & lemma="c|d"]` will result in 4 searches in the history:
- `[lemma = "a"]`
- `[lemma = "b"]`
- `[word  = "c"]`
- `[word  = "d"]`

The first query in the list is submitted, and the rest is pushed into the history so the user can load them at a later moment.

It can be hidden using the API:
::: code-group
```js [usage]
vuexModules.ui.actions.search.extended.splitBatch.enable(false);
```
```ts [definition]
function enable(status: boolean): void;
```
:::

<!-- @include: ./_within.md -->

