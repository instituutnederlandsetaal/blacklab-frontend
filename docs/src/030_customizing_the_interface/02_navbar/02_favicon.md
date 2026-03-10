--- 
title: Favicon
---

# Favicon

It's possible to provide a favicon for your corpus.

This is done by adding a `<FaviconDir>` element to the `search.xml` file. The favicon is a small icon that appears in the browser tab when your corpus is open.

```xml
<SearchInterface>
    <InterfaceProperties>
		<FaviconDir>${request:corpusPath}/static/icon</FaviconDir>
	</InterfaceProperties>
</SearchInterface>
```

::: info File location
<FileTree hl="5">
/etc/projectConfigs
  corpus-1 corpus name/id
    static
      icon
        favicon.ico the favicon file (`ico` format)
        ... other favicon files (see header.vm)
  corpus-2
    ...
</FileTree>
:::