package nl.inl.corpuswebsite.utils;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

import javax.xml.parsers.ParserConfigurationException;
import javax.xml.transform.stream.StreamSource;
import javax.xml.xpath.XPathExpressionException;
import net.sf.saxon.s9api.*;
import org.xml.sax.SAXException;

/** Represents BlackLab index metadata */
public class CorpusConfig {
    private final String jsonUnescaped;

    private final String corpusId;

    private final Optional<String> displayName;

    private final Optional<String> corpusDataFormat;

    private final String listValues;
    
    public CorpusConfig(String corpusId, String configAsXml, String configAsJson)
            throws SAXException, IOException, ParserConfigurationException, XPathExpressionException, SaxonApiException {
        Processor proc = new Processor(false);
        DocumentBuilder builder = proc.newDocumentBuilder();
        XdmNode doc = builder.build(new StreamSource(new ByteArrayInputStream(configAsXml.getBytes(StandardCharsets.UTF_8))));
        XPathCompiler xp = proc.newXPathCompiler();

        this.corpusId = corpusId;
        this.jsonUnescaped = configAsJson;
        this.displayName = xp.evaluate("/blacklabResponse/displayName", doc).stream().findFirst().map(XdmItem::getStringValue).or(() -> Optional.of(corpusId));
        this.corpusDataFormat = xp.evaluate("//documentFormat", doc).stream().findFirst().map(XdmItem::getStringValue);

        /**
         * Extract annotation ids for which we require the full list of values to be known by the frontend.
         *
         * Word properties can have a "uiType" property that determines if the input field should have
         * autocompletion enabled, use a dropdown list, be a number range, etc.
         * For the "select" value (e.g. a dropdown list) we need to get the possible values for that field from blacklab.
         * Since they aren't contained in the initial json payload unless we specifically request them.
         *
         * Finds the fields marked with "select", and returns a comma-separated list of the field names.
         * We can then use that list to request the config again, with the field values.
         */
        this.listValues = xp.evaluate("string-join("
            + "//annotation[not(isInternal='true') and uiType='select']/@name |"
            + "//annotation[not(isInternal='true') and uiType='pos']/@name | "
            + "//annotation[not(isInternal='true') and uiType='pos']/subannotation"
            + ", ',')",
        doc).stream().findFirst().map(XdmItem::getStringValue).orElse("");
    }

    public String getCorpusId() {
    	return corpusId;
    }

    public String getJsonUnescaped() {
        return jsonUnescaped;
    }

    /**
     * @return the displayName for this corpus as configured in BlackLab-Server, may be null if not configured.
     */
    public Optional<String> getDisplayName() {
        return displayName;
    }

    /* TEI, FoLiA, etc */
    public Optional<String> getCorpusDataFormat() {
        return corpusDataFormat;
    }

    public String getListValues() {
        return listValues;
    }
}
