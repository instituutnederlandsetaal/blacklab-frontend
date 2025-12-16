package nl.inl.corpuswebsite.utils;

import java.io.File;
import java.io.IOException;
import java.io.Reader;
import java.io.StringReader;
import java.io.StringWriter;
import java.io.Writer;
import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.logging.Logger;

import javax.xml.transform.Source;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamSource;

import net.sf.saxon.s9api.DocumentBuilder;
import net.sf.saxon.s9api.Message;
import net.sf.saxon.s9api.Processor;
import net.sf.saxon.s9api.QName;
import net.sf.saxon.s9api.SaxonApiException;
import net.sf.saxon.s9api.Serializer;
import net.sf.saxon.s9api.XdmAtomicValue;
import net.sf.saxon.s9api.XdmNode;
import net.sf.saxon.s9api.XdmValue;
import net.sf.saxon.s9api.XsltCompiler;
import net.sf.saxon.s9api.XsltExecutable;
import net.sf.saxon.s9api.XsltTransformer;
import net.sf.saxon.lib.ErrorReporter;
import net.sf.saxon.s9api.XmlProcessingError;
import org.w3c.dom.Document;


public class XslTransformer {
    private static final Logger logger = Logger.getLogger(XslTransformer.class.getName());

    /**
     * Error reporter that captures compilation errors.
     */
    private static class CapturingErrorReporter implements ErrorReporter {
        private final List<String> errors = new ArrayList<>();

        @Override
        public void report(XmlProcessingError error) {
            String message = error.getMessage();
            if (error.getLocation() != null) {
                message = error.getLocation().getSystemId() + " line " + error.getLocation().getLineNumber() + ": " + message;
            }
            errors.add(message);
            logger.warning("XSLT compilation error: " + message);
        }

        public String getErrorMessages() {
            return String.join("\n", errors);
        }

        public boolean hasErrors() {
            return !errors.isEmpty();
        }
    }

    /**
     * Shared processor instance (thread-safe).
     */
    private static final Processor PROCESSOR = new Processor(false);

    private final Map<String, Object> params = new HashMap<>();
    private final XsltExecutable executable;
    private final String id;

    private static final Map<String, XsltExecutable> EXECUTABLE_CACHE = new HashMap<>();
    private static boolean useCache = true;

    public static void setUseCache(boolean use) {
        useCache = use;
    }

    /**
     * Compiles and caches an XSLT stylesheet.
     */
    private static XsltExecutable compile(String id, Source source) throws SaxonApiException {
        synchronized (EXECUTABLE_CACHE) {
            if (useCache && EXECUTABLE_CACHE.containsKey(id)) {
                return EXECUTABLE_CACHE.get(id);
            }

            XsltCompiler compiler = PROCESSOR.newXsltCompiler();
            CapturingErrorReporter errorReporter = new CapturingErrorReporter();
            compiler.setErrorReporter(errorReporter);

            try {
                XsltExecutable exec = compiler.compile(source);

                if (useCache) {
                    EXECUTABLE_CACHE.put(id, exec);
                }

                return exec;
            } catch (SaxonApiException e) {
                // If we captured error details, include them in the exception
                if (errorReporter.hasErrors()) {
                    throw new SaxonApiException(errorReporter.getErrorMessages(), e);
                }
                throw e;
            }
        }
    }

    public XslTransformer(File stylesheet) throws SaxonApiException {
        this.id = stylesheet.getAbsolutePath();
        this.executable = compile(this.id, new StreamSource(stylesheet));
    }

    public XslTransformer(String id, URI uri) throws SaxonApiException {
        this.id = id;
        this.executable = compile(this.id, new StreamSource(uri.toString()));
    }

    public XslTransformer(String id, Reader sheet) throws SaxonApiException {
        this.id = id;
        this.executable = compile(this.id, new StreamSource(sheet));
    }

    public XslTransformer(String id, String xsl) throws SaxonApiException {
        this(id, new StringReader(xsl));
    }

    public String transform(String source) throws SaxonApiException, IOException {
        try (StringWriter result = new StringWriter()) {
            this.streamTransform(new StringReader(source), result);
            return result.toString();
        }
    }

    public <W extends Writer> W streamTransform(Reader source, W result) throws SaxonApiException {
        XsltTransformer transformer = executable.load();

        // Capture xsl:message output
        StringBuilder capturedMessages = new StringBuilder();
        Consumer<Message> messageHandler = (Message message) -> {
            String content = message.getContent().getStringValue();
            if (capturedMessages.length() > 0) {
                capturedMessages.append("\n");
            }
            capturedMessages.append(content);
            logger.info("XSLT message: " + content);
        };
        transformer.setMessageHandler(messageHandler);

        // Set parameters
        for (Map.Entry<String, Object> entry : params.entrySet()) {
            if (entry.getValue() instanceof Document d) {
                DocumentBuilder db = PROCESSOR.newDocumentBuilder();
                XdmNode xdmDoc = db.build(new DOMSource(d));
                transformer.setParameter(new QName(entry.getKey()), xdmDoc);
            } else {
                transformer.setParameter(new QName(entry.getKey()), XdmValue.makeValue(entry.getValue()));
            }
        }

        // Set up source and destination
        StreamSource streamSource = new StreamSource(source);
        transformer.setSource(streamSource);

        Serializer serializer = PROCESSOR.newSerializer(result);
        serializer.setOutputProperty(Serializer.Property.ENCODING, "UTF-8");
        serializer.setOutputProperty(Serializer.Property.INDENT, "yes");
        transformer.setDestination(serializer);

        try {
            transformer.transform();
        } catch (SaxonApiException e) {
            // Include captured messages in the exception
            String messages = capturedMessages.toString();
            if (!messages.isEmpty() && !messages.equals(e.getMessage())) {
                throw new SaxonApiException(messages, e);
            }
            throw e;
        }

        return result;
    }

    public void addParameter(String key, Object value) {
        params.put(key, value);
    }

    public void clearParameters() {
        params.clear();
    }
}
