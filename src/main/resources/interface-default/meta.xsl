<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:xs="http://www.w3.org/2001/XMLSchema">
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
		<h2 id="meta-title" style="word-break:break-all;">
			<xsl:value-of select="*[name()=/*//titleField]" />
			<span id="parallel-version"></span>
		</h2>
		
		<table class="table-striped">
			<tbody>
				<xsl:variable name="groups" select="/blacklabResponse/metadataFieldGroups/metadataFieldGroup" />
				
				<xsl:choose>
					<xsl:when test="$groups">
						<xsl:for-each select="$groups">
							<tr><td colspan="2"><b><xsl:value-of select="name"/>:</b></td></tr>
							<xsl:for-each select="fields/field">
								<xsl:call-template name="field">
									<xsl:with-param name="fieldName" select="text()"/>
								</xsl:call-template>
							</xsl:for-each>
						</xsl:for-each>
					</xsl:when>
					<xsl:otherwise>
						<xsl:for-each select="*[name()!='mayView' and name() != 'fromInputFile' and name() != 'lengthInTokens' and name() != 'tokenCounts']">
							<xsl:call-template name="field">
								<xsl:with-param name="fieldName" select="local-name()"/>
							</xsl:call-template>
						</xsl:for-each>
					</xsl:otherwise>
				</xsl:choose>
				<tr><td>Document length (tokens)</td><td id="docLengthTokens"><xsl:value-of select="lengthInTokens"/></td></tr>
			</tbody>
		</table>
	</xsl:template>
	
	
	<xsl:template name="field">
		<xsl:param name="fieldName" as="xs:string"/>
		<xsl:variable name="fieldValue" select="string-join(/blacklabResponse/docInfo/*[local-name()=$fieldName]/value/text(), ', ')"/>
		<xsl:variable name="displayName">
			<xsl:choose>
				<xsl:when test="normalize-space(/blacklabResponse/metadataFieldDisplayNames/*[name()=$fieldName]) != ''">
					<xsl:value-of select="/blacklabResponse/metadataFieldDisplayNames/*[name()=$fieldName]/text()"/>
				</xsl:when>
				<xsl:otherwise>
					<xsl:value-of select="$fieldName"/>
				</xsl:otherwise>
			</xsl:choose>
		</xsl:variable>
		
		<tr><td style="padding-left: 0.5em"><xsl:value-of select="$displayName" /></td><td><xsl:value-of select="$fieldValue" /></td></tr>
	</xsl:template>
</xsl:stylesheet>
