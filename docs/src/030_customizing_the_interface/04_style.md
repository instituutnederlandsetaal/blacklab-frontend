# Styling, Branding, Look-and-Feel, CSS

Applying custom styling to the page is possible using `CSS`. 

We have included a template [SASS](https://sass-lang.com/) file to allow you to customize your page's color theme easily:

::: details template.scss ([github](@github:/src/frontend/src/style-template.scss))
<<< @/../../src/frontend/src/style-template.scss
:::

From there you can then add your own customizations on top.


## Using the template

Create a file with the following contents


::: code-group

`````scss [custom.scss]
// Defines the base color of the theme, this can be any css color
$base: hsl(351, 70%, 36%); 
// the absolute or relative path to our template file
@import 'template.scss'; 

// Your own styles & overrides here ...
`````

:::



Now compile this file by following the following steps:
- Install [Node.js](https://nodejs.org/en/)
- Compile the file by running the following command in the directory of the file:
  ```bash
  npx sass --quiet --embed-source-map .
  ```
- You will now have a `custom.css` file you can include in your install through `search.xml`.
