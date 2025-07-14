# Logo

![Navbar Logo](navbar_logo.png)


Adding a custom logo is possible using `css`. 

There is a special spot in the navbar where you can place a logo using `background-image`. 
Some care should be taken to make sure a proper margin is applied to the collapsed navbar on small screens.

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
```css [custom.css]
.navbar {
--logo-width: 100px;
--logo-height: 100px;
--logo-url: url(./logo.png);
}

/** Unhide the logo container element */ 
.navbar-logo-container {
	margin-left: 5px;
	margin-top: 5px;
	display: block;
} 
/** Set the logo + size */
.navbar-logo {
	background-image: var(--logo-url);
	background-size: contain;
	width: var(--logo-width);
	height: var(--logo-height);
	box-shadow: 0px 0px 10px black;
	pointer-events: none;
}

/** Add appropriate margin to other regions of the navbar in collapsed state */
.navbar-logo-margin {
	margin-left: var(--logo-width)!important;
}
```
:::