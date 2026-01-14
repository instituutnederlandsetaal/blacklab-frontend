<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet
	version="3.0"
	xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
	xmlns:xs="http://www.w3.org/2001/XMLSchema"
	xmlns:f="http://f"
		
	exclude-result-prefixes="xsl xs f"
	xpath-default-namespace="http://www.tei-c.org/ns/1.0"
	>
	<xsl:output encoding="utf-8" method="html" omit-xml-declaration="yes" />
	
	<!--
		IMPORTANT: remove all random identation and whitespace from words and punctuation etc.
		To prevent words where part is highlighted/strikethrough from rendering a space in between those segments
		To preserve whitespace, match the element and make an explicit copy-of its text()
		Also ignore illegal HTML characters (prevent breaking output entirely when a single character is somehow broken)
	-->
	<xsl:template match="text()"><xsl:value-of select="replace(normalize-space(.), '[&#x007F;-&#x009F;]', ' ')"/></xsl:template>
	
	<xsl:template match="//*[local-name()='teiHeader']" /> <!-- swallow header -->
	<xsl:template match="//*[local-name()=('p', 'del')]"><xsl:element name="{local-name()}"><xsl:apply-templates/></xsl:element></xsl:template>
	<xsl:template match="//*[local-name()=('expan', 'hi', 'argument')]"><em class="{local-name()}"><xsl:apply-templates/></em></xsl:template>
	<xsl:template match="//*[local-name()='supplied']">[<xsl:apply-templates/>]</xsl:template>
	
	<!-- Line breaks, try to normalize <l>, <s> and <lb> -->
	<xsl:template match="*[local-name()=('l','s')]">
		<xsl:choose>
			<xsl:when test="ancestor::*[local-name() = ('l','s')]"><xsl:apply-templates/></xsl:when> <!-- prevent nested divs -->
			<xsl:otherwise><div class="line"><xsl:apply-templates/></div></xsl:otherwise>
		</xsl:choose>
	</xsl:template>

	<xsl:template match="*[local-name() = 'lb']"><br/></xsl:template>

	<xsl:template match="*[local-name()='w']">
		<span class="word" data-toggle="tooltip" data-lemma="{@lemma}" data-pos="{@type}" data-id="{@xml:id}">
			<xsl:value-of select="." />
		</span>
		<xsl:if test="following-sibling::* and not(following::*[1][self::*[local-name()='pc']])"><xsl:text> </xsl:text></xsl:if>
	</xsl:template>

	<xsl:template match="//*[local-name()='hl']">
		<span class="hl"><xsl:apply-templates /></span>
	</xsl:template>
	
	<xsl:variable name="omitSpaceAfterPunct" as="xs:string*" select="(
			'(',
			'[',
			'-',
			'_',
			'=',
			'#',
			'''',
			'&quot;'
		)"/>
	
	<xsl:variable name="insertSpaceBeforePunct" as="xs:string*" select="(
			'+',
			'&amp;',
			'[',
			'('
		)"/>
	
	<!-- punctuation -->
	<xsl:template match="*[local-name()='pc']">
		<xsl:variable name="punct"><xsl:apply-templates select="text()"/></xsl:variable>
		<xsl:variable name="skipSpaceAfter" select="$omitSpaceAfterPunct = $punct"/>
		<xsl:variable name="insertSpaceBefore" select="$insertSpaceBeforePunct = $punct"/>
		<span class="punctuation">
			<xsl:if test="$insertSpaceBefore"><xsl:text> </xsl:text></xsl:if>
			<xsl:value-of select="$punct"/>
			<xsl:if test="not($skipSpaceAfter)"><xsl:text> </xsl:text></xsl:if>
		</span>
	</xsl:template>
</xsl:stylesheet>
