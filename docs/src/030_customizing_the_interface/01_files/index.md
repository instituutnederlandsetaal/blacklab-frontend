# Config Files

The default location of customization files is `/etc/projectconfigs/`  
The location can be changed using the `corporaInterfaceDataDir` setting in the [Global Settings File](/configuration/global_settings).

<FileTree hl="1-12">
<!-- @include: ../example_customization_folder_layout.txt -->
</FileTree>

## Overlay System

::: tip Important to know

Files and `static` files 'overlay' each other, meaning we will always check all of the following locations, in order of precedence:
1. The directory of the corpus itself
2. The `default` dir <small>[(corporaInterfaceDefault)](/configuration/global_settings)</small>
3. [Inside the WAR](@github:/src/main/resources/interface-default)

### Example of overlaying

When requesting /corpus-frontend/my-corpus/static/some_script.js the server will return the first file it finds in the following locations:
1. `my-corpus/static/some_script.js`
2. `default/static/some_script.js`
3. `src/main/resources/interface-default/static/some_script.js` (inside the WAR)

:information_source: This is also true for locales, `help.inc`, `about.inc` and `search.xml` files!

:::