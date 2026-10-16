# Application Structure

BlackLab Frontend has a Java backend and a Vue application. The backend serves the HTML skeleton, configuration, static resources and article content. Vue Router handles navigation within the frontend.

## Application and feature entry points

`src/frontend/src/app/entrypoint/main.ts` creates shared services: authentication, API clients, corpus context, i18n, customization registry and application shell. Search and article setup are loaded on demand and installed once per application, before their route components render.

| Routes | Frontend entry | Responsibility |
| --- | --- | --- |
| All pages | `app/entrypoint/main.ts` | Shared services, navigation, common controls and corpus configuration |
| `/` | `pages/corpora/CorporaPage.vue` | Corpus overview and management |
| `/:corpus/search/:results?` | `features/search/entrypoint.ts` | Search forms, stores, results, history and URL synchronization |
| `/:corpus/docs/:docId` | `features/article/entrypoint.ts` | Article state, document display and URL synchronization |
| `/configwizard`, `/:corpus/configwizard/*` | `pages/config/entrypoint.ts` | Corpus picker and configuration wizard |
| `/about`, `/help`, `/:corpus/about`, `/:corpus/help` | `pages/info.ts` | Static page content |
| `/callback` | `app/entrypoint/callback.ts` | OIDC authentication callback |

The search and article entries export both their page component and their feature plugin. This gives each feature a single dynamic import boundary. The plugins receive dependencies explicitly from the composition root; they do not discover services through globals.

Monaco loads when the format editor opens. Article statistics and Highcharts load when statistics are enabled. The Vue template compiler loads only through the explicit customization API. Locale bundles are loaded as needed.

Production builds use Rolldown's shared-module grouping: application modules used by multiple entries and their static dependencies join a common bundle. Feature code and optional libraries remain lazy. The server template loads both `main.css` and `shared.css`; feature styles load with their JavaScript. `npm run test:bundles` checks the production dependency boundaries and startup stylesheet links. Add `-- --report` to inspect page request counts and bundle sizes.

`npm run build` builds the OIDC callback separately into a standalone `callback.js`. Both it and the common application payload include their own authentication library, avoiding a shared auth request on normal pages or loading application code in the callback.

## Corpus configuration and custom scripts

The corpus context contains normalized corpus metadata, page configuration and tagset data. Shared legacy configuration lives under `app/state/`: UI settings, article settings, and filter definitions and values used by existing customization scripts. These small compatibility modules do not depend on search or article page implementations.

On corpus publication, the composition root initializes shared configuration. If search has already been installed, its legacy stores are initialized at the same publication checkpoint. Configured scripts then register callbacks and set defaults. Search form definitions react to those settings. The form stays inert while declared scripts or URL restoration are pending. Later customization registration discards the current draft and restores from the URL; asynchronous work started by a script is not part of the declared-script loading barrier. If a user first visits another page and opens search later, feature installation preserves the configuration already supplied by scripts.

The customization registry owns registrations and script disposal. It does not construct forms or execute result hooks itself. Search owns form construction and ongoing result customization; article display consumes only the configuration it needs.

`interop/window-globals.ts` is the sole publisher of customization globals. Common configuration is available on every page. The search compatibility facade is added when search is installed. Internal application code receives dependencies directly or uses component injection rather than reading these globals.

## Search and article state

`features/search/search-feature.ts` composes submitted search state, the form runtime, active results, query history and URL restoration. `features/search/model/search-store.ts` coordinates the remaining legacy search stores. Selected-subcorpus effects run only on search routes.

`features/article/article-feature.ts` provides article state and its URL binding. Document loading and display remain within the article feature; article configuration can be set by corpus scripts before that feature is loaded.

Each feature owns its URL projection. Incoming navigation restores that page's state, and subsequent user changes publish URL updates. URL bindings stop on application unmount. Opening another page does not initialize the other feature's implementation.

Article pagination uses zero-based, half-open word ranges in the displayed annotated field. Parallel hit navigation reads that version's ranges from the query's `otherFields` results before selecting pages or highlights. Default field names are omitted from document links and contents requests; a separate search field is retained when highlighting a query from another version.

Valid custom starts are preserved. Invalid or empty ranges are repaired within the page size and field length, and starts beyond the document select its last page. Unpaginated contents omit word bounds. The Java frontend also omits bounds at document edges to preserve leading and trailing markup. Statistics use exact word bounds and continue from the actual returned annotation count when BlackLab caps a snippet response.

Built-in article stylesheets preserve `data-hit-start` and `data-hit-end` on highlight fragments so navigation can identify a hit split around XML elements. Custom article stylesheets can preserve these attributes too; older stylesheets that only emit `.hl` elements retain positional navigation.
