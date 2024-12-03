<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
	<xsl:output encoding="utf-8" method="html" omit-xml-declaration="yes" />

	<!-- ignore illegal HTML characters (prevent breaking output entirely when a single character is somehow broken) -->
	<xsl:template match="text()">
		<xsl:value-of select="replace(., '[&#x007F;-&#x009F;]', ' ')"/>
	</xsl:template>

	<xsl:template match="error">
		<h1>Error</h1>
		<xsl:value-of select="message" />
		(Error code:
		<xsl:value-of select="code" />
		)
	</xsl:template>

	<xsl:template match="/" >
		<xsl:apply-templates select="/blacklabResponse/docInfo"/>
	</xsl:template>

	<xsl:template match="docInfo">
		<h2 style="word-break:break-all;">
			<xsl:value-of select="*[name()=/*//titleField]" />
			<span id="parallel-version"></span>
		</h2>

		<table class="table-striped">
			<tbody>
				<!-- will be filled in from article.js -->
				<tr><td>Hits in document:</td><td><div id="divHitsInDocument"></div></td></tr>
				<xsl:variable name="groups" select="/blacklabResponse/metadataFieldGroups/metadataFieldGroup" />

				<xsl:choose>
					<xsl:when test="$groups">
						<xsl:for-each select="$groups">
							<tr><td colspan="2"><b><xsl:value-of select="name"/>:</b></td></tr>
							<xsl:for-each select="fields/field">
								<xsl:variable name="fieldName" select="."/>
								<xsl:variable name="fieldValue" select="string-join(/blacklabResponse/docInfo/*[name()=$fieldName]/value/text(), ', ')"/>
								<xsl:variable name="fieldDisplayName" select="/blacklabResponse/metadataFieldDisplayNames/*[name()=$fieldName]" />

								<tr><td style="padding-left: 0.5em"><xsl:value-of select="$fieldDisplayName" /></td><td><xsl:value-of select="$fieldValue" /></td></tr>
							</xsl:for-each>
						</xsl:for-each>
					</xsl:when>
					<xsl:otherwise>
						<xsl:for-each select="*[name()!='mayView' and name() != 'fromInputFile' and name() != 'lengthInTokens' and name() != 'tokenCounts']">
							<xsl:variable name="fieldName" select="name()"/>
							<xsl:variable name="fieldDisplayName" select="/blacklabResponse/metadataFieldDisplayNames/*[name()=$fieldName]" />
							<tr><td><xsl:value-of select="$fieldDisplayName" /></td><td><xsl:value-of select="." /></td></tr>
						</xsl:for-each>
					</xsl:otherwise>
				</xsl:choose>
				<tr><td>Document length (tokens)</td><td id="docLengthTokens"><xsl:value-of select="lengthInTokens"/></td></tr>
			</tbody>
		</table>
	</xsl:template>

</xsl:stylesheet>
