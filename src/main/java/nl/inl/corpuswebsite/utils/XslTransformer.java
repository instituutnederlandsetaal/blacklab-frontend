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

import org.w3c.dom.Document;

import net.sf.saxon.lib.ErrorReporter;
import net.sf.saxon.s9api.DocumentBuilder;
import net.sf.saxon.s9api.Message;
import net.sf.saxon.s9api.Processor;
import net.sf.saxon.s9api.QName;
import net.sf.saxon.s9api.SaxonApiException;
import net.sf.saxon.s9api.Serializer;
import net.sf.saxon.s9api.XdmNode;
import net.sf.saxon.s9api.XdmValue;
import net.sf.saxon.s9api.XmlProcessingError;
import net.sf.saxon.s9api.XsltCompiler;
import net.sf.saxon.s9api.XsltExecutable;
import net.sf.saxon.s9api.XsltTransformer;


public class XslTransformer {
    private static final Logger logger = Logger.getLogger(XslTransformer.class.getName());

    /**
     * Error reporter that captures compilation errors.
     */
    private static class CapturingErrorReporter implements ErrorReporter, Consumer<Message> {
        private final List<String> errors = new ArrayList<>();
        private final List<String> messages = new ArrayList<>();

        @Override
        public void report(XmlProcessingError error) {
            String message = error.getMessage();
            if (error.getLocation() != null) {
                message = error.getLocation().getSystemId() + " line " + error.getLocation().getLineNumber() + ": " + message;
            }
            errors.add(message);
            logger.warning("XSLT compilation/execution error: " + message);
        }

        public String getErrorMessages() {
            return String.join("\n", errors);
        }

        public String getMessages() {
            return String.join("\n", messages);
        }

        public boolean hasErrors() {
            return !errors.isEmpty();
        }

        public boolean hasMessages() {
            return !messages.isEmpty();
        }

        @Override
        public void accept(Message message) {
            String content = message.getContent().getStringValue();
            messages.add(content);
            logger.info("XSLT message: " + content);
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
                throw new SaxonApiException(errorReporter.getErrorMessages() + '\n' + errorReporter.getMessages(), e);
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
        CapturingErrorReporter errorReporter = new CapturingErrorReporter();
        XsltTransformer transformer = executable.load();

        transformer.setMessageHandler(errorReporter);
        transformer.setErrorReporter(errorReporter);

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
        } catch (Exception e) {
            String errors = errorReporter.getErrorMessages();
            String messages = errorReporter.getMessages();
            throw new SaxonApiException(messages + '\n' + errors, e);
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
