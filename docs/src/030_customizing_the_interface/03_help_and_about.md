# Help and About 

::: details Location
<FileTree hl=6-7>
<!-- @include: ./example_customization_folder_layout.txt -->
</FileTree>
:::


These files are used to provide HTML content for the `MyCorpus/about/` and `MyCorpus/help/` pages. You can customize these files to include any information you want to display on those pages.
Usually, you would just put some html content in here, these are actually [Apache Velocity](https://velocity.apache.org/) templates,
so you can use the full power of Velocity to generate dynamic content if you want to.

There are some variables and utils available, for full details see the relevant code.
You can refer to these using the velocity syntax `$var` or `$util.method()`.

::: details Available variables and utils ([full file](https://github.com/instituutnederlandsetaal/corpus-frontend/blob/dev/src/main/java/nl/inl/corpuswebsite/BaseResponse.java))
<<< @/../../src/main/java/nl/inl/corpuswebsite/BaseResponse.java#docsvelocitytemplatemodel
:::

