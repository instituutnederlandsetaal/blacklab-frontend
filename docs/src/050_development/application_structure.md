# Application Structure

The Frontend contains a small Java backend and a larger Vue.js frontend.
The Backend is responsible for serving the correct javascript files, setting up the page skeleton, and handling the document page.
The Frontend is responsible for the user interface, handling the search, displaying results, and managing the state of the application.


## Frontend Javascript

The app is primarly written in [Vue.js](https://vuejs.org/).


The application is not currently a single page application (SPA), but rather a multi-page application (MPA).
The following pages exist:

| URL                                         | Entrypoint         | Page Name | Description                                                                                                 |
|----------------------------------------------|--------------------|-----------|-------------------------------------------------------------------------------------------------------------|
| `/corpus-frontend/`                         | `corpora.ts`       | corpora   | The corpora overview page.                                                                                  |
| `/corpus-frontend/docs/${document}`          | `article.ts`       | article   | Contains the contents of the selected document.                                                             |
| `/corpus-frontend/${corpus}/search/`         | `search.tsx`       | search    | The search page.                                                                                            |
| `/corpus-frontend/about/`                    | [no script]        | about     | Contains the default `about.inc`.                                                                           |
| `/corpus-frontend/${corpus}/about/`          | [no script]        | about     | Contains the `about.inc` for the selected corpus.                                                           |
| `/corpus-frontend/help/`                     | [no script]        | help      | Contains the default `help.inc`.                                                                            |
| `/corpus-frontend/${corpus}/help/`           | [no script]        | help      | Contains the `help.inc` for the selected corpus.                                                            |
| `/corpus-frontend/upload/`                   | `remote-index.ts`  | upload    | The upload page.                                                                                            |
| `/corpus-frontend/config/`                   | [no script]        | config    | Contains details about the current configuration, such as the version, BlackLab location, etc.              |


Outlined below here is the `/search/` page, as it contains the majority of the code.


### **Application structure**

Individual components are contained in the [pages](@github:/src/frontend/src/pages) directory. These components are single-use and/or connected to the store in some way.
The [components](@github:/src/frontend/src/components) directory contains a few "dumb" components that can be reused anywhere.

### **The Vuex store**

We use [vuex](https://vuex.vuejs.org/guide/) to store the app state, treat it as a central database (though it's not persisted between sessions).
The vuex store is made up of many `modules` that all handle a specific part of the state, such as the metadata filters, or the settings menu (page size, random seed).

The [form](@github:/src/frontend/src/store/search/form) directory contains most of the state to do with the top of the page, such as filters, query builder, explore view.
The [results](@github:/src/frontend/src/store/search/results) directory handles the settings that directly update the results, such as which page is open, how results are grouped, etc.

A couple of modules have slightly different roles:
- The [corpus](@github:/src/frontend/src/store/search/corpus.ts) module stores the blacklab index config and is used almost everywhere.
- The [history](@github:/src/frontend/src/store/search/history.ts) module stores the query history (_not the browser history_).
- The [query](@github:/src/frontend/src/store/search/query.ts) module contains a snapshot of the form (with filters, patterns, etc) as it was when `submit` was pressed.
  This is what actually determines the results being shown, and is what render the query summary etc.
- The [tagset](@github:/src/frontend/src/store/search/tagset.ts) module is mostly inactive, but it stores the info to build the editor for the `pos` uiType.


### **URL generation and parsing**

The current page url is generated and updated in [streams.ts](@github:/src/frontend/src/store/search/streams.ts).
It contains a few things: a stream that listens to state changes in the `vuex` store, and is responsible for updating the page url, and a couple streams that fetch some metadata about the currently selected/searched corpus (shown below the filters and at the top of the results panel).

Url parsing happens in the [UrlStateParser](@github:/src/frontend/src/store/search/util/url-state-parser.ts).
The url parsing is a little involved, because depending on whether a `tagset` is provided it can differ (the cql pattern is normally parsed and split up so we know what to place in the `simple` and `extended` views, but this needs to happen differently when a tagset is involved).
Because of this, the store is first initialized (with empty values everywhere), then the url is parsed, after which the state is updated with the parsed values (see [search.tsx](@github:/src/frontend/src/search.tsx)).
When navigating back and forth through browser history, the url is not parsed, instead the state is attached to the history entry and read directly.
