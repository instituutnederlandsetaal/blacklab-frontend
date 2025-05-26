# Pagination

If your documents are very long, it can help to enable pagination. This will only show a section of a document on the page at a time, and the user can scroll through the document using the pagination controls.

## Enable Pagination

Pagination is configured through the [search.xml](/customization/files/search_xml) configuration file.

<<< @/../../src/main/resources/interface-default/search.xml#docspagination

By default, the page size is set to 1000 words.


## Pagination Pitfalls
::: danger &nbsp;
If [pagination](./pagination) is enabled in your corpus, **content outside the current page will not be present** in the processed XML.  
BlackLab will automatically fixes "unbalanced tags" i.e. automatically opens/closes truncated elements, so the xml should still be valid, but elements that completely lie outside or around the current page will be missing!  
Try not to rely too much on the absolute structure of the XML.

#### Illustration

Imagine only the focused lines are part of the current page, all blurred content is outside the current page.  
```xml [example of paginated document]
<doc>
  <meta>
	<title>my document</title>
	<date>01-01-2000</date>
  </meta>
  <contents xmlns="my-namespace">
	<text>
	  <p>
		Here be some text outside the current page
	  </p>
	  // [!code focus]
	  <p> 
		// [!code focus]
		This text is on the page 
	  // [!code focus]
	  </p> 
	</text>
  </contents>
</doc>
```

- Absolute xpath like `/doc/contents/text/p` will **fail** in this case.
- xpath relying on the namespace will **fail** in this case, as the `xmlns` declaration namespace is not on the page.
- Even a simpler xpath like `//text` will **fail** (the `<text>` element is not on the page).

Instead, try to use simpler xpaths, and compare element names using `local-name()` if your documents are namespaced: e.g. `//*[local-name() = 'text']` instead of `//my-namespace:text`.

Due to how BlackLab is set up, this is a hard problem to solve unfortunately. 
:::
