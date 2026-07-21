# Logo

![Navbar Logo](navbar_logo.png)

Adding a custom logo is possible using `css`.

Existing selector-based CSS remains compatible. For example, both `.navbar-logo { background-image: url(...); }` and an explicitly sized `.navbar-logo` get the same scroll behaviour automatically.

Here is an example:

:::details Directory structure
<FileTree hl=3,5,6>
/etc/projectConfigs/
  corpus-1/
    search.xml 
    static/
      logo.png
      custom.css
</FileTree>
:::

::: code-group

```xml [search.xml]
<?xml version="1.0" encoding="utf-8" ?>
<SearchInterface>
    <InterfaceProperties>
        // [!code highlight]
        <CustomCss>${request:corpusPath}/static/custom.css</CustomCss>
    </InterfaceProperties>
</SearchInterface>
```

```scss [custom.scss]
@import '../../../_style-template.scss';

:root {
	--navbar-logo-url: url(./logo.png);

	// Inferred from the image if omitted.
	--navbar-logo-width: 172px;
	--navbar-logo-height: 64px;
}

.navbar-logo {
	// Use a filter for partially transparent images.
	filter: drop-shadow(0 0 10px black);
}
```

:::
