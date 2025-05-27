---
title: article.xsl/meta.xsl
---

# Document contents and Metadata

::: details Location
<FileTree hl=6-7>
<!-- @include: ../example_customization_folder_layout.txt -->
</FileTree>
:::


::: tip See
See the dedicated section for [customizing documents](/customizing_the_interface/document_view/document_contents) for concrete details and examples.
:::

## article.xsl

`article.xsl` is the XSLT file used to transform documents in your corpus from XML into HTML for display in the `MyCorpus/docs/some_doc/` page. You can customize this file to change how the document content is displayed.

## meta.xsl

`meta.xsl` is the XSLT file used to transform the metadata of documents in your corpus from XML into HTML for display in the `MyCorpus/docs/some_doc/` page. You can customize this file to change how the document metadata is displayed. It operates on the metadata that BlackLab has about the document, not the metadata from the document contents. The default `meta.xsl` file is a simple table with all the metadata fields and their values, which is usually sufficient.

For examples and details, continue on to [customizing documents](/customizing_the_interface/document_view/document_contents).
