package nl.inl.corpuswebsite.utils;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;

public class CorpusConfig {
    private String jsonUnescaped;

    private Document config;

    private String displayName;

    //    private List<FieldDescriptor> propertyFields = new ArrayList<>();

    /** Keyed by tab name */
    private Map<String, List<FieldDescriptor>> metadataFieldGroups = new LinkedHashMap<>();
    private List<FieldDescriptor> ungroupedMetadataFields = new ArrayList<>();

    /** Keyed by tab name */
    private Map<String, List<FieldDescriptor>> propertyFieldGroups = new LinkedHashMap<>();
    private List<FieldDescriptor> ungroupedPropertyFields = new ArrayList<>();

    /**
     * Mapping between generic names for some properties of documents in this corpus (titleField, pidField, authorField,
     * etc) to their actual names
     */
    private Map<String, String> fieldInfo = new LinkedHashMap<>();

    private String corpusDataFormat = "UNKNOWN";

    public CorpusConfig(String xml, String jsonUnescaped) throws SAXException, IOException, ParserConfigurationException {
        config = fromXml(xml);
        this.jsonUnescaped = jsonUnescaped;
        parse();
    }

    public static Document fromXml(String xml) throws ParserConfigurationException, SAXException, IOException {
        return DocumentBuilderFactory.newInstance()
            .newDocumentBuilder()
            .parse(new InputSource(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8))));
    }

    public String getJsonUnescaped() {
        return jsonUnescaped;
    }

    /**
     * @return the displayName for this corpus as configured in BlackLab-Server, may be null if not configured.
     */
    public String getDisplayName() {
        return displayName;
    }

    //    public List<FieldDescriptor> getPropertyFields() {
    //        return propertyFields;
    //    }

    public Map<String, List<FieldDescriptor>> getMetadataFieldGroups() {
        return metadataFieldGroups;
    }

    public List<FieldDescriptor> getUngroupedMetadataFields() {
        return ungroupedMetadataFields;
    }

    public Map<String, List<FieldDescriptor>> getPropertyFieldGroups() {
        return propertyFieldGroups;
    }

    public List<FieldDescriptor> getUngroupedPropertyFields() {
        return ungroupedPropertyFields;
    }


    /* TEI, FoLiA, etc */
    public String getCorpusDataFormat() {
        return corpusDataFormat;
    }

    public Map<String, String> getFieldInfo() {
        return fieldInfo;
    }

    private void parse() {
        parseDisplayName();
        parseCorpusDataFormat();
        parsePropertyFields();
        parseMetadataFields();
        parseFieldInfo();
    }

    private void parseDisplayName() {
        Element root = (Element) config.getElementsByTagName("blacklabResponse").item(0);
        NodeList l = root.getChildNodes();
        for (int i = 0; i < l.getLength(); ++i) {
            Node n = l.item(i);
            if (n.getNodeName().equals("displayName")) {
                displayName = n.getTextContent();
                return;
            }
        }
    }

    private void parseCorpusDataFormat() {
        NodeList documentFormatTags = config.getElementsByTagName("documentFormat");
        if (documentFormatTags.getLength() > 0)
            this.corpusDataFormat = documentFormatTags.item(0).getTextContent();
    }

    /**
     * Word properties can have a "uiType" property that determines if the input field should have
     * autocompletion enabled, use a dropdown list, be a number range, etc.
     * For the "select" value (e.g. a dropdown list) we need to get the possible values for that field from blacklab.
     * Since they aren't contained in the initial json payload unless we specifically request them.
     * 
     * This function parses the config, finds the fields marked with "select", and returns a comma-separated list of the field names.
     * We can then use that list to request the config again, with the field values.
     * 
     * @param xml the indexStructure/indexMetadata xml
     * @return comma-separated list of fields with uitype "select"
     * @throws ParserConfigurationException
     * @throws SAXException
     * @throws IOException
     */
    public static String getSelectProperties(String xml) throws ParserConfigurationException, SAXException, IOException {
        Document config = fromXml(xml);
        String selects = "";
        
        // We can't just retrieve the annotatedField/complexField entries directly, as there are two types of 
        // elements named annotatedField, one for the annotationGroups and one for the annotations themselves
        Element fieldContainerElement = (Element) config.getElementsByTagName("complexFields").item(0);
        if (fieldContainerElement == null) {
            fieldContainerElement = (Element) config.getElementsByTagName("annotatedFields").item(0);
        }
        
        NodeList annotatedFieldElements = fieldContainerElement.getElementsByTagName("complexField");
        if (annotatedFieldElements.getLength() == 0) {
            annotatedFieldElements = fieldContainerElement.getElementsByTagName("annotatedField"); // since blacklab 2.0
        }
        for (int cfi = 0; cfi < annotatedFieldElements.getLength(); cfi++) {
            Element annotatedFieldElement = (Element) annotatedFieldElements.item(cfi);
            NodeList propertyElements = annotatedFieldElement.getElementsByTagName("property");
            if (propertyElements.getLength() == 0) {
                propertyElements = annotatedFieldElement.getElementsByTagName("annotation"); // since blacklab 2.0
            }
            for (int ip = 0; ip < propertyElements.getLength(); ++ip) {
                Node propertyNode = propertyElements.item(ip);
                if (!(propertyNode instanceof Element))
                    continue;

                Element propertyElement = (Element) propertyNode;
                if (propertyElement.getElementsByTagName("isInternal").item(0).getTextContent().equalsIgnoreCase("true"))
                    continue;

                String configType = propertyElement.getElementsByTagName("uiType").getLength() == 1
                    ? propertyElement.getElementsByTagName("uiType").item(0).getTextContent()
                    : "";
                if ("select".equals(configType)) {
                    selects += selects.isEmpty() ? propertyElement.getAttribute("name") : "," + propertyElement.getAttribute("name");
                }
            }
        }
        return selects;
    }

    private void parsePropertyFields() {
        Map<String, FieldDescriptor> propertyFields = new HashMap<>();

        // We can't just retrieve the annotatedField/complexField entries directly, as there are two types of 
        // elements named annotatedField, one for the annotationGroups and one for the annotations themselves
        Element fieldContainerElement = (Element) config.getElementsByTagName("complexFields").item(0);
        if (fieldContainerElement == null) {
            fieldContainerElement = (Element) config.getElementsByTagName("annotatedFields").item(0);
        }
        
        NodeList annotatedFieldElements = fieldContainerElement.getElementsByTagName("complexField");
        if (annotatedFieldElements.getLength() == 0) {
            annotatedFieldElements = fieldContainerElement.getElementsByTagName("annotatedField"); // since blacklab 2.0
        }
        for (int cfi = 0; cfi < annotatedFieldElements.getLength(); cfi++) {
            Element annotatedFieldElement = (Element) annotatedFieldElements.item(cfi);
            String annotatedFieldName = annotatedFieldElement.getAttribute("name");
            NodeList propertyElements = annotatedFieldElement.getElementsByTagName("property");
            if (propertyElements.getLength() == 0) {
                propertyElements = annotatedFieldElement.getElementsByTagName("annotation"); // since blacklab 2.0
            }
            if (propertyElements.getLength() == 0) {
                NodeList annots = propertyElements = annotatedFieldElement.getElementsByTagName("annotations");
                if (annots.getLength() > 0) {
                    propertyElements = ((Element) annots.item(0)).getElementsByTagName("annotation");
                }
            }
            String mainPropertyName = annotatedFieldElement.getElementsByTagName("mainAnnotation").item(0).getTextContent();
            for (int ip = 0; ip < propertyElements.getLength(); ++ip) {
                Node propertyNode = propertyElements.item(ip);
                if (!(propertyNode instanceof Element))
                    continue;

                Element propertyElement = (Element) propertyNode;
                if (propertyElement.getElementsByTagName("isInternal").item(0).getTextContent().equalsIgnoreCase("true"))
                    continue;

                String fieldName = propertyElement.getAttribute("name");
                String displayName = propertyElement.getElementsByTagName("displayName").item(0).getTextContent();
                boolean caseSensitive =
                    propertyElement.getElementsByTagName("sensitivity").item(0).getTextContent().equals("SENSITIVE_AND_INSENSITIVE");
                List<String> allowedValues = parsePropertyValues(propertyElement);
                String configType = propertyElement.getElementsByTagName("uiType").getLength() == 1
                    ? propertyElement.getElementsByTagName("uiType").item(0).getTextContent()
                    : "";
                String type = inferType(configType, allowedValues, propertyElement);

                FieldDescriptor field = new FieldDescriptor(fieldName, displayName, type);
                for (String allowedValue : allowedValues) {
                    field.addValidValue(allowedValue, allowedValue);
                }
                field.setCaseSensitive(caseSensitive);
                field.setAnnotatedFieldName(annotatedFieldName);
                field.setMainProperty(fieldName.equals(mainPropertyName));
                propertyFields.put(field.getId(), field);
            }
        }

        // parse groups, merge all groups from all annotatedFields (there's only one, "contents" by default) 
        // The frontend currently only supported a single annotatedField/complexField.
        NodeList xmlPropertyFieldGroups = config.getElementsByTagName("annotationGroup");
        for (int i = 0; i < xmlPropertyFieldGroups.getLength(); i++) {
            Node node = xmlPropertyFieldGroups.item(i);
            if (!(node instanceof Element))
                continue;
            Element element = (Element) node;

            String groupName = element.getElementsByTagName("name").item(0).getTextContent();

            NodeList fieldNodeList = element.getElementsByTagName("annotation"); // Fields in this group
            for (int fieldIndex = 0; fieldIndex < fieldNodeList.getLength(); fieldIndex++) {
                String fieldName = fieldNodeList.item(fieldIndex).getTextContent();

                if (propertyFields.containsKey(fieldName)) {

                    FieldDescriptor field = propertyFields.get(fieldName);
                    // Remove the field from our running list so we don't also insert it into the default group later.
                    propertyFields.remove(fieldName);

                    // Strip the groupname from the displayname of the field
                    // Why do we do this again.. isn't this just a data issue that should be solved by the uploader?
                    if (field.getDisplayName().length() > groupName.length() &&
                        field.getDisplayName().toLowerCase().startsWith(groupName.toLowerCase())) {
                        // Remove group
                        String newDisplayName = field.getDisplayName().substring(groupName.length()).trim();
                        // Capitalize first char
                        newDisplayName = newDisplayName.substring(0, 1).toUpperCase(Locale.ROOT) + newDisplayName.substring(1);

                        field.setDisplayName(newDisplayName);
                    }

                    addPropertyField(field, groupName);
                }
            }
        }

        // Remaining fields are ungrouped
        for (Map.Entry<String, FieldDescriptor> e : propertyFields.entrySet()) {
            addPropertyField(e.getValue(), null);
        }
    }

    private void parseMetadataFields() {
        // Keyed by name of field
        Map<String, FieldDescriptor> parsedFields = new LinkedHashMap<>();

        // Parse all metadata fields
        NodeList metadataFieldNodeList = config.getElementsByTagName("metadataField");
        for (int imf = 0; imf < metadataFieldNodeList.getLength(); imf++) {
            Node metadataFieldNode = metadataFieldNodeList.item(imf);
            if (!(metadataFieldNode instanceof Element))
                continue;
            Element metadataFieldElement = (Element) metadataFieldNode;

            String fieldName = metadataFieldElement.getElementsByTagName("fieldName").item(0).getTextContent();
            String displayName = metadataFieldElement.getElementsByTagName("displayName").item(0).getTextContent();
            String type = metadataFieldElement.getElementsByTagName("uiType").item(0).getTextContent();
            Map<String, String> allowedValues = parseMetadataValues(metadataFieldElement);

            type = inferType(type, allowedValues.keySet(), metadataFieldElement);

            FieldDescriptor field = new FieldDescriptor(fieldName, displayName, type);
            for (Map.Entry<String, String> valueWithDisplayName : allowedValues.entrySet())
                field.addValidValue(valueWithDisplayName.getKey(), valueWithDisplayName.getValue());

            parsedFields.put(fieldName, field);
        }

        // Store all fields belonging to a group, then finally store all remaining fields.
        NodeList xmlMetadataFieldGroups = config.getElementsByTagName("metadataFieldGroup");
        for (int mdfgIndex = 0; mdfgIndex < xmlMetadataFieldGroups.getLength(); mdfgIndex++) {
            Node node = xmlMetadataFieldGroups.item(mdfgIndex);
            if (!(node instanceof Element))
                continue;
            Element element = (Element) node;

            String groupName = element.getElementsByTagName("name").item(0).getTextContent();

            NodeList fieldNodeList = element.getElementsByTagName("field"); // Fields in this group
            for (int fieldIndex = 0; fieldIndex < fieldNodeList.getLength(); fieldIndex++) {
                String fieldName = fieldNodeList.item(fieldIndex).getTextContent();

                if (parsedFields.containsKey(fieldName)) {

                    FieldDescriptor field = parsedFields.get(fieldName);
                    // Remove the field from our running list so we don't also insert it into the default group later.
                    parsedFields.remove(fieldName);

                    // Strip the groupname from the displayname of the field
                    if (field.getDisplayName().length() > groupName.length() &&
                        field.getDisplayName().toLowerCase().startsWith(groupName.toLowerCase())) {
                        // Remove group
                        String newDisplayName = field.getDisplayName().substring(groupName.length()).trim();
                        // Capitalize first char
                        newDisplayName = newDisplayName.substring(0, 1).toUpperCase(Locale.ROOT) + newDisplayName.substring(1);

                        field.setDisplayName(newDisplayName);
                    }

                    addMetadataField(field, groupName);
                }
            }
        }

        // Remaining fields are ungrouped groups
        for (Map.Entry<String, FieldDescriptor> e : parsedFields.entrySet()) {
            addMetadataField(e.getValue(), null);
        }
    }

    /**
     * If type is not specified, infer it based on whether we have any or all or no known allowed values
     * No values known == text
     * All values known == select
     * Some values known == combobox (has dropdown but also allows user-entered values)
     *
     * @param type predefined type (optional)
     * @param allowedValues
     * @param metadataFieldElement
     * @return the type passed in (if any), or the inferred type as above
     */
    private static String inferType(String type, Collection<String> allowedValues, Element metadataFieldElement) {
        if (type == null || type.isEmpty()) {
            if (allowedValues.isEmpty())
                type = "text";
            else if (allValuesKnown(metadataFieldElement)) {
                type = "select";
            } else {
                type = "combobox";
            }
        }
        return type;
    }

    private void parseFieldInfo() {
        Node fieldInfoNode = this.config.getElementsByTagName("fieldInfo").item(0);
        if (fieldInfoNode == null)
            return;

        NodeList fieldInfoChildren = fieldInfoNode.getChildNodes();
        for (int i = 0; i < fieldInfoChildren.getLength(); i++) {
            Node fieldInfoChildNode = fieldInfoChildren.item(i);
            this.fieldInfo.put(fieldInfoChildNode.getNodeName(), fieldInfoChildNode.getTextContent());
        }
    }


    private static boolean allValuesKnown(Element metadataFieldElement) {
        return Boolean.parseBoolean(metadataFieldElement.getElementsByTagName("valueListComplete").item(0).getTextContent());
    }

    /**
     * Parse all known fieldValues for this metadata field.
     *
     * Note: displayValue defaults to the raw value if it is not specified.
     *
     * @param metadataFieldElement the fieldValues xml node
     * @return a map of values in the form of (value, displayValue)
     */
    private static Map<String, String> parseMetadataValues(Element metadataFieldElement) {
        // LinkedHashMap, it's important these values stay in the order in which we parse them
        Map<String, String> values = new LinkedHashMap<>();

        // Gather all values
        Node fieldValuesNode = metadataFieldElement.getElementsByTagName("fieldValues").item(0);
        if (fieldValuesNode instanceof Element) {
            NodeList fieldValueNodeList = ((Element) fieldValuesNode).getElementsByTagName("value");
            for (int ifv = 0; ifv < fieldValueNodeList.getLength(); ifv++) {
                NamedNodeMap attributes = fieldValueNodeList.item(ifv).getAttributes();
                if (attributes == null || attributes.getNamedItem("text") == null)
                    continue;

                // Empty values are ignored as they are not searchable
                String value = attributes.getNamedItem("text").getTextContent();
                if (value == null || value.isEmpty())
                    continue;

                // Set the display value to be identical to the actual value for now
                values.put(value, value);
            }
        }

        // Now set the displayValues where provided.
        Node displayValuesNode = metadataFieldElement.getElementsByTagName("displayValues").item(0);
        if (displayValuesNode instanceof Element) {
            NodeList displayValueNodeList = ((Element) displayValuesNode).getElementsByTagName("displayValue");
            for (int idv = 0; idv < displayValueNodeList.getLength(); idv++) {
                Node displayValueNode = displayValueNodeList.item(idv);

                String value = displayValueNode.getAttributes().getNamedItem("value").getTextContent();
                String valueDisplayName = displayValueNode.getTextContent();
                if (values.containsKey(value))
                    values.put(value, valueDisplayName);
            }
        }

        return values;
    }

    /**
     * Parse all known fieldValues for this property field.
     *
     * @param propertyFieldElement the fieldValues xml node
     * @return a map of values in the form of (value, displayValue)
     */
    private static List<String> parsePropertyValues(Element propertyFieldElement) {
        List<String> values = new ArrayList<>();

        // Gather all values
        Node fieldValuesNode = propertyFieldElement.getElementsByTagName("values").item(0);
        if (fieldValuesNode instanceof Element) {
            NodeList fieldValueNodeList = ((Element) fieldValuesNode).getElementsByTagName("value");
            for (int ifv = 0; ifv < fieldValueNodeList.getLength(); ifv++) {
                Node item = fieldValueNodeList.item(ifv);
                // Empty values are ignored as they are not searchable
                String value = item.getTextContent();
                if (value == null || value.isEmpty())
                    continue;

                values.add(value);
            }
        }
        return values;
    }

    private void addPropertyField(FieldDescriptor field, String groupName) {
        if (groupName != null) {
            assert !groupName.isEmpty() : "PropertyField group must not be empty";

            this.propertyFieldGroups.computeIfAbsent(groupName, __ -> new ArrayList<>())
                .add(field);
        } else {
            this.ungroupedPropertyFields.add(field);
        }
    }

    private void addMetadataField(FieldDescriptor field, String groupName) {
        if (groupName != null) {
            assert !groupName.isEmpty() : "MetadataField group must not be empty";

            this.metadataFieldGroups.computeIfAbsent(groupName, __ -> new ArrayList<>())
                .add(field);
        } else {
            this.ungroupedMetadataFields.add(field);
        }
    }
}
