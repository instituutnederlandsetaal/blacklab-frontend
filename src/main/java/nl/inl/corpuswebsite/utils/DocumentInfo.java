package nl.inl.corpuswebsite.utils;

import java.io.StringReader;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;

import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.xml.sax.InputSource;
import org.xml.sax.helpers.DefaultHandler;

import nl.inl.corpuswebsite.config.CorpusConfig;

/** Document field lengths normalized from BlackLab 4 and 5 XML responses. */
public class DocumentInfo {
    private final Map<String, Integer> tokenCounts = new HashMap<>();
    private final String mainField;

    public DocumentInfo(String metadata, CorpusConfig corpus) {
        mainField = corpus.getMainAnnotatedField();
        final Element docInfo;
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newDefaultInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            var builder = factory.newDocumentBuilder();
            builder.setErrorHandler(new DefaultHandler());
            Element root = builder.parse(new InputSource(new StringReader(metadata))).getDocumentElement();
            docInfo = root.getTagName().equals("docInfo") ? root : child(root, "docInfo");
            if (docInfo == null) throw new IllegalArgumentException("Missing docInfo");
        } catch (Exception e) {
            throw new IllegalArgumentException("Cannot decode document size", e);
        }

        Element counts = child(docInfo, "tokenCounts");
        if (counts != null) {
            for (Node node = counts.getFirstChild(); node != null; node = node.getNextSibling()) {
                if (!(node instanceof Element item)) continue;
                Element name = child(item, "fieldName");
                Element count = child(item, "tokens");
                if (count == null) count = child(item, "tokenCount");
                if (name != null && count != null) tokenCounts.put(name.getTextContent(), tokenCount(count));
            }
        }
        Element legacyLength = child(docInfo, "lengthInTokens");
        if (legacyLength != null) tokenCounts.putIfAbsent(mainField, tokenCount(legacyLength));
    }

    public int getLength(Optional<String> field) {
        String requestedField = field.filter(value -> !value.isBlank()).orElse(mainField);
        Integer exact = tokenCounts.get(requestedField);
        if (exact != null) return exact;
        var matches = tokenCounts.entrySet().stream().filter(entry -> entry.getKey().endsWith("__" + requestedField)).toList();
        if (matches.size() == 1) return matches.get(0).getValue();
        throw new IllegalArgumentException("Unknown or ambiguous document field: " + requestedField);
    }

    private static Element child(Element parent, String name) {
        for (Node node = parent.getFirstChild(); node != null; node = node.getNextSibling()) {
            if (node instanceof Element element && element.getTagName().equals(name)) return element;
        }
        return null;
    }

    private static int tokenCount(Element element) {
        int count = Integer.parseInt(element.getTextContent().trim());
        if (count < 0) throw new IllegalArgumentException("Negative document size");
        return count;
    }
}
