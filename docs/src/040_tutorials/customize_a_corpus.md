---
title: Customization
order: 0
---
# Basic Customization Tutorial

This tutorial shows how to customize a corpus in the BlackLab Frontend by adding a custom JavaScript file and changing the displayed title of your documents.

## Steps

1. **Create the config directory for your corpus.**  
   By default, this is `/etc/projectconfigs/`. If your corpus is called `example`, your config directory will be `/etc/projectconfigs/example/`. Use your custom paths if necessary.

2. **Copy the default `search.xml` into your corpus directory.**  
   You can find the default at `src/main/resources/interface-default/search.xml`.  
   Copy it to:  
   ```
   /etc/projectconfigs/example/search.xml
   ```

3. **Add a config option to include a custom script on the `search` page.**  
   Edit your `search.xml` and add:
   ```xml
   <CustomJs page="search">${request:corpusPath}/static/js/custom.search.js</CustomJs>
   ```

4. **Create a matching JavaScript file.**  
   Create the file:
   ```
   /etc/projectconfigs/example/static/js/custom.search.js
   ```

5. **Add the following snippet to your `custom.search.js`:**
   ```js
   vuexModules.ui.getState().results.shared.getDocumentSummary = function(metadata, specialFields) {
     return 'This is everything we know about the document: ' + JSON.stringify(metadata);
   }
   ```

6. **Restart your server and perform a search in your corpus to see the changes.**  
   For example: [http://localhost:8080/blacklab-frontend/example/search/docs?patt=""](http://localhost:8080/blacklab-frontend/example/search/docs?patt="")

   **NOTE:** You don't need to restart the application constantly. Simply set `cache=false` in the main `blacklab-frontend.properties` config file to disable caching of files by the server.