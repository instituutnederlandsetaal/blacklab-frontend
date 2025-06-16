# Internationalization

::: details Location
<FileTree hl=9-11>
<!-- @include: ./example_customization_folder_layout.txt -->
</FileTree>
:::

You can customize field names, labels, and other UI text by creating a locale file. Any keys you provide will override the default locale.  
If you fully translate the UI, please consider sharing your translation.

::: details Default en-us locale file [github](@github:/src/frontend/src/locales/en-us.json)
<<< @../../../src/frontend/src/locales/en-us.json
:::


## Creating a translation

Create a new file in `static` directory of your corpus' interface data directory (`corporaInterfaceDataDir`), e.g., `static/locales/fr.json`.
It's best to copy an existing locale file and translate the strings.



#### Global translations
Place your locales in the `default` directory of the interface data directory (`corporaInterfaceDataDir`) to make them available for all corpora at once.  
This uses the [overlay system](/customizing_the_interface/files/#overlay-system) to apply translations globally.

You can even override these defaults further by placing additional locale files in the `static` directory of your corpus' dedicated `static` directory.
#### Comments
Locale files can contain comments using `// comment` or `/* comment */`.


## Add or remove a language from the selector

We don't automatically detect and add locales to the language selector, so you need to register them manually.

The `locale` string should match the filename of your added locale.
```ts
function i18n.registerLocale(locale: string, label: string);
function i18n.removeLocale(locale: string);
```

## Set the default locale
Used when no language is selected or the browser's locale isn't available.  
The default is `en-us`.

```ts
function i18n.setDefaultLocale(locale: string);
```

## Set the fallback for untranslated keys

Defaults to `en-us`, but you can change it to any other locale you have registered.  
:warning: Make sure to register the locale first, otherwise this won't have any effect.

```ts
function i18n.setFallbackLocale(locale: string);
```



----

## Technical details

The app uses [vue-i18n](https://kazupon.github.io/vue-i18n/). Not all UI text is translatable yet; contributions are welcome.

To help add translation keys, look for usages like <span v-pre>`{{ $t('search.simple.heading') }}`</span> in the code.

To add a new language, copy an existing file in `src/frontend/src/locales`, rename it for your locale (e.g., `fr.json`), and translate the strings.


#### Translating annotations, metadata, etc.

In your override file in `static/locales`, you can set names for annotations, metadata fields, and more. For example, in `$corporaInterfaceDataDir/YOUR_CORPUS/static/locales/en-us.json`:

```json
{
  "index": {
    "annotations": {
      "pos": "Part of speech"
    },
    "annotationGroups": {
      "simple": "Basic annotations",
      "advanced": "Advanced annotations"
    },
    "metadata": {
      "spanFilters": {
        "name": {
          "type": "Named entity type"
        }
      }
    },
    "metadataGroups": {
      "author": "Author-related fields",
      "date": "Date-related fields"
    },
    "within": {
      "name": "Named entity"
    }
  }
}
```
