import java.io.File;
import java.util.Locale;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

public final class RelaxTomcatQueryChars {
    private static final String REQUIRED_RELAXED_QUERY_CHARS = "< > [ \\ ] ^ ` { | }";
    

    private RelaxTomcatQueryChars() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            throw new IllegalArgumentException("Usage: RelaxTomcatQueryChars <server.xml>");
        }

        File serverXml = new File(args[0]);
        DocumentBuilderFactory documentBuilderFactory = DocumentBuilderFactory.newInstance();
        documentBuilderFactory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        Document document = documentBuilderFactory.newDocumentBuilder().parse(serverXml);

        int updated = 0;
        NodeList connectors = document.getElementsByTagName("Connector");
        for (int i = 0; i < connectors.getLength(); i++) {
            Element connector = (Element) connectors.item(i);
            if (!isHttpConnector(connector)) {
                continue;
            }

            connector.setAttribute(
                    "relaxedQueryChars",
                    withRequiredChars(connector.getAttribute("relaxedQueryChars"), REQUIRED_RELAXED_QUERY_CHARS));
            updated++;
        }

        if (updated == 0) {
            throw new IllegalStateException("No HTTP Connector elements found in " + serverXml);
        }

        TransformerFactory transformerFactory = TransformerFactory.newInstance();
        transformerFactory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        javax.xml.transform.Transformer transformer = transformerFactory.newTransformer();
        transformer.setOutputProperty(OutputKeys.INDENT, "yes");
        transformer.transform(new DOMSource(document), new StreamResult(serverXml));

        System.out.println("Updated " + updated + " Tomcat HTTP Connector element(s)");
    }

    private static boolean isHttpConnector(Element connector) {
        if (!connector.hasAttribute("protocol")) {
            return true;
        }

        String protocol = connector.getAttribute("protocol").toLowerCase(Locale.ROOT);
        return protocol.contains("http") || protocol.contains("coyote.http11");
    }

    private static String withRequiredChars(String value, String requiredChars) {
        StringBuilder result = new StringBuilder(value);
        for (int i = 0; i < requiredChars.length(); i++) {
            char requiredChar = requiredChars.charAt(i);
            if (value.indexOf(requiredChar) < 0) {
                result.append(requiredChar);
            }
        }
        return result.toString();
    }
}
