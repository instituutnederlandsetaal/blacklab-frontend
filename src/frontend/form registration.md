Let's see if we can design a small util for dynamic form registration.
We're porting/rewriting/heavility refactoring the app and restoring functionality bit-by-bit using a better design than the old app.
Limit yourself to the `_new` folder. This is the new "neat" code.
You can of course reference the `old-frontend` directory, but that's code we've yet to port, so it won't appear 1-to-1 in the new version, though the overall functionality and design (especially the components) will be ported piecemeal.

I'll explain some of the app details here, I want you to create your own little memory repo in the codebase that you use to track your findings, my explanations, and relevant details, so you can reference this in the future.
Make sure this is part of the repo, not your internal memory, as we want to keep this around for a while.

## Quick glossary

- _Document_: a lucene document
- _MetadataField_: a field on a lucene document
- _Token_: A token in a lucene document
- _Annotation_: A property of a token in a lucene document (word, lemma, pos, etc., typically)
- _AnnotatedField_: a group of Annotations. Typically there's only one, and it's called `contents`. Annotations are technically prefixed by their AnnotatedField owner's id, like `contents_word`, but if the prefix is omitted, the default field is substituted in the backend. We don't support multiple fields in the frontend currently. Only annotations are separated by version/AnnotatedField. Metadata for the doc is singleton, there's only one document title field for example.
- _ParallelField_: BlackLab (the backend) can handle "parallel" corpora, containing copies of documents in different "versions" (e.g. Dutch, English). Where the "word" annotation (of the "contents" AnnotatedField) contains e.g. 100 values for the dutch version, and 100 values for the english version. Parallel documents internally are the same Document instance, so have the same ID, etc. BlackLab just abstracts which of the internal values it reads/uses when you pass this somewhere. These fields are like regular `AnnotatedField` but have a suffix `__` followed by the name, eg. `contents__en` and `contents__nl`.

---

The app roughly has 2 main components for the search page:

- the form
- the results

# The form

The form lets the user enter their query and filters, and submit to see the results.
The form has two modes:

- query
- explore

Both (eventually) generate a Lucene-based Filter, and a CQL query.
There's some minor additionals like the explore form also being able to pass some parameters for the result view (like pre-grouping), but that's ancilliary.
Both `query` and `explore` contain sub-forms for more-or-less detailed widgets/options.

Those queries can be "submitted" to load them into the results part of the app.
This is not currently implemented yet.
In the old app, we had a dedicated `query` store, which kept those submitted queries, so the user can edit their new query without the results constantly updating.
It only pushes down into results on submit.
There's some additional systems attached to the `query` store, like browser-based history, and in-app history (across sessions). This is currently unimplemented in the new app.

Anyway:

The `query` form (used to) contain a simple/extended/advanced/expert view.
These contain widgets for building the CQL query.

- `simple` just containing a single one.
- `extended` can contain multiple widgets
- `advanced` is a querybuilder, letting you add fields and tokens dynamically
- `expert` is a free-form text field letting the user enter the raw query

Some of these forms, extended, advanced, and expert, share the Lucene filters.
Meaning editing the filter in expert, will still show that value when switching the extended.
Have a `filter` store to store those values. But we might want to get rid of that.

The `explore` form contains 3 sub-forms, all for a different way of building the query again.
Each of those subforms again share the global filters instances.
All of the explore functions can also be performed using the regular `query` form and subsequent result manipulation, but testing found this to be easier for less technical users.

- `corpora`, letting you group on a `metadata` field for documents in the corpus. Basically something like `group by year` letting you see the distributions easily.
- `n-grams` letting you specify token series in an easier to use method than the `query` form
- `frequency`, surface all tokens in the corpus grouped by an annotation

# The results

Currently unimplemented in the new version, but used to contain 2 views, `hits` and `docs`, corresponding to BlackLab's `/hits` and `/docs` endpoints. These basically just specify what is returned. The lucene documents (and their metadata) that match the query, or the snippets _inside_ those docs that matches (along with the doc itself). The hits are only available if there's a CQL query, docs are always available (without CQL query, only the filters limit the result space, and if those are empty too, all docs are matched).

Shared between these are some common parameters.

- grouping
- windowing (first + number)
- sampling (show a seeded-random subset of all results)
- drilling down into a group (`viewgroup`) parameter
- sorting

We eventually also want to abstract results into a generic part of the application as well.

Some of the global things like sampling were (misguidedly) in a "global" store, as we figured users typically want to edit them once and not touch them again, so we lifted that out of the result views. Perhaps not great. Should've been a default at a non-local place, with the true setting for controlling it inside the results view itself (in a modal or otherwise somewhat unobtrusive place), falling through to the defaults if not configured otherwise.

---

# Configuration

The app was/is heavily customizable. We (used to) expose a rudimentary JS api on window to toggle some features, set defaults, configure which fields show up where, etc.
It's now called (as legacy) the `ui-customization-store`. That's a push-based config, i.e. you imperitively push in your customizations. There's also a newer `customization-callback-store` that you imperitively put functions into that get called later when the relevant feature is activated and can return booleans/etc. that influence app behavior dynamically. Not a great fan of that one, it's slower, easier to make mistakes from a user perspective, and we have a dirty proxy-based wrapper around it to prevent errors in injected functions from propagating into the app internals. All in all it's a bit of a headache.

---

# The new plan

The new app is more modularized, and ideally every feature/widget/module (not exactly defined what exactly those boundaries will be yet - that will have to settle organically) has its own little config object instance. These can be gathered together and exposed as a singular bundle in higher layers of the application. That way hopefully config wont't leak across boundaries as much any more.

# Old vs new customization

Since the old app was multi-page, we could inject `customjs` in the backend, which was evaluated at a specific time (after app init, but before render). That customjs would hold the config customizations, and call the `ui-customization-store` etc. The app would then respect these settings.
Due to that, app init was very specific about internal order of operations.
The new SPA version loads the page data asynchronously.
Currently we have the customjs scripts behind an internal logic gate, so they are inserted/eval'd only when the app has rendered, async data is downloaded, etc.
The new config will have to be callback-based, so scripts can just eval whenever and register the callback, and the app doesn't have to carefully manage order so much.

# The form registration idea:

Since we have a couple of somewhat isolated form pieces, my hope is that we can abstract these in the app, and make defining your own form easier.
The new dynamic forms should support at least all of the old behavior

- widgets in sub-sections (tabs in tabs), with headings in between optionally
- Widgets should be able to be arbitrarily nested and disconnected from UI, basically a querybuilder system where clauses can be nested, and every clause is just a joiner that's not very concerned with the exact implementation of its children.
  Imagine the `extended` form:
  In the existing app we had a set of `annotation` widgets on the left, potentially in sub-groups with tabs to switch (for visual clarity). On the right, we have the filters, again potentially in sub-groups with tabs.
  In dynamic config we could define it as something like this (extremely pseudo and just to illustrate my mental model here):

  ```js
  const searchTopLevelForm = forms.getOrCreate('search');
  const extendedForm = forms.getOrCreate('extended');
  searchTopLevelForm.add(extendedForm);

  const leftSideSection = forms.getOrCreate('extended-pattern');
  for (const annotationGroup of corpus.getAnnotationGroups()) {
  	// see if there's one, multiple, etc.
  	// create group for each if there's multiple, otherwise unpack to top-level
  	// add actual query-generating widgets to the groups
  	// add group to left side
  }

  // assume filters already setup earlier, since the entire section is shared between the top-level forms
  const filterSection = forms.getOrCreate('global-filters');
  extendedForm.add(leftSideSection, filterSection);
  ```

  Of course, that's _very_ crude, and not very ergonomic yet.
  We've completely glossed over the real implementation of how a widget maps UI behavior (dropdown list, checkboxes, etc) to query generation/persistance/parse from URL or history.

  Let's attempt to keep layout-related settings out of the internal model and state.
  Tabs and such could be implemented entirely in the components.
  They could just loop over the subsections and render them however they want.
  What we need to solve is how to pair up the logical form sections with UI properly.
  E.g. the global-filters, how will the vue app know which component to render there.
  I want to strongly avoid the config system from just becoming a baroque DSL for defining components and DOM layout, which is a high risk.

# Complications of the forms in the old app

In the old app implementation, the URL always stores the serialized pattern (CQL) and lucene (filter) queries.
However the UI consists of widgets, some of them not mapping neatly 1-to-1 to query parts.
This becomes an unsolvable problem fast, basically trying to decompile a query into a UI that can also be different based on which dataset is loaded, and we don't know the shape up front. Basically a "best-effort" and bail-out and plonk the query string literal into expert view if we find some part of the query can't be matched to UI. It was a lot of code, brittle, requires a backend request during parse (in the critical URL hydrate path!). Just not a good time.

The new UI should use a completely new system that's opaque to the app itself, and just map some per-component/per-form-section state from the URL and history objects directly into the components and/or state. We should of course still store the serialized query in the URL and alongside other persisted objects, to make restoring state always possible (through the expert/string-literal form input) even if config and widgets have changed.

# Some additional info

The old app had a (moved but not refactored) file `filterValueFunctions` which contained some UI-agnostic (ish) code for mapping query-to-state and vice-versa. Registration of filters requires passing an entry in the registry that contains the actual logic implementation, making it somewhat decoupled from the UI.
We could use that core idea to implement the lowest widget layer in the new system. It would allow reuse of simple components like dropdowns and checkbox lists everywhere, and keep them decoupled from what their role in the form is (filter, cql pattern query, or something more even specialized).

# Some additional requirements

Since form registration or configuration will happen from external scripts, it's a requirement that we somehow find a way to compile some type definitions that we can eventually ship or host somewhere that define the external API of the system. This way customization scripts could use typescript's triple-slash directive, or some typings package we build to make sure they have a good DX.
