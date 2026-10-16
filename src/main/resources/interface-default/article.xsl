<?xml version="1.0" encoding="UTF-8"?> 

<!--
This is the default fallback XSL for document contents.
Corpora can override this by placing a file with the same name in their own resources directory.
The additional files in this directory (article_tei, article_folia) take precedence over this file when the corpus
is written in the respective format (folia, tei).
This detection is done based on the *exact* name of the Input Format BlackLab reports.
-->
<xsl:stylesheet version="2.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:output encoding="utf-8" method="html" omit-xml-declaration="yes" />

<xsl:template match="text()">
    <xsl:value-of select="replace(., '[&#x007F;-&#x009F;]', ' ')"/>
</xsl:template>

<xsl:template match="*[local-name(.)='hl']">
    <span class="hl">
        <xsl:if test="@start and @end">
            <xsl:attribute name="data-hit-start" select="@start"/>
            <xsl:attribute name="data-hit-end" select="@end"/>
        </xsl:if>
        <xsl:apply-templates select="node()"/>
    </span>
</xsl:template>

</xsl:stylesheet>
