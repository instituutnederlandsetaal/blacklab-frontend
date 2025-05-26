---
title: Search.xml
description: Configuring and Customizing the Corpus Frontend
aside: false
includeFolderIndexFile: true
---

# Search.xml

::: details Location
<FileTree hl=3>
<!-- @include: ../example_customization_folder_layout.txt -->
</FileTree>
:::

`Search.xml` allows you to configure various aspects of the corpus frontend interface, such as navbar links, custom CSS/JS, and pagination settings for documents. 
It's always required if you want to apply any customization for your corpus after initial creation.
BlackLab lets you configure some aspect of your corpus, but you can only do this while creating the corpus. 

::: tip
Set `cache=false` in the main `corpus-frontend.properties` configuration file, so you don't need to restart the server every time you update the `search.xml` file.
:::

## Capabilities

Check the sidebar for the full list of options available in `search.xml`.
The example file below also contains some comments to help you understand what each option does.

## Variable Interpolation / Generating Links

Some variables are available in the `search.xml` file. These variables are replaced with their actual values. The following variables are available:
- `${request:contextPath}`  
    E.g. `/corpus-frontend`  
    The "home" link for the Corpus Frontend.   
    This **does not end with a slash**. 
- `${request:corpusId}` 
 E.g. `my_corpus`.  
 The ID of the corpus.  
 This is _not_ the display name, but the internal ID of the corpus. Useful to refer to the static files, or create urls, etc. 
- `${request:corpusPath}`  
  E.g. `/corpus-frontend/${corpus_id}/`  
  The "home link" for the corpus.  
  This is just a concatenation of the `contextPath` and the `corpusId`.  
  This **does not end with a slash**. 

## Example file

::: details Full `search.xml` file and defaults 
<<< @/../../src/main/resources/interface-default/search.xml
:::

### A simple example
For example, to include a custom JavaScript file on the `search` page, you can add add the following `search.xml`:

```xml
<?xml version="1.0" encoding="utf-8" ?>
<SearchInterface>
    <InterfaceProperties>
        // [!code highlight]
        <CustomJs page="search">${request:corpusPath}/static/js/custom.search.js</CustomJs> 
    </InterfaceProperties>
</SearchInterface>
```