package nl.inl.corpuswebsite.utils;

import java.io.File;
import java.io.InputStream;
import java.io.Reader;
import java.io.StringReader;
import java.io.StringWriter;
import java.io.Writer;
import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.function.Function;
import java.util.logging.Level;
import java.util.logging.Logger;

import javax.xml.transform.ErrorListener;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Templates;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerConfigurationException;
import javax.xml.transform.TransformerException;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.stream.StreamResult;
import javax.xml.transform.stream.StreamSource;

import org.apache.commons.lang3.tuple.Pair;

import net.sf.saxon.trans.XPathException;

public class XslTransformer {
    private static final Logger logger = Logger.getLogger(XslTransformer.class.getName());

    private static class CapturingErrorListener implements ErrorListener {
        private final List<Pair<String, Exception>> exceptions = new ArrayList<>();

        @Override
        public void error(TransformerException e) throws TransformerException {
            this.exceptions.add(Pair.of(this.getDescriptiveMessage(e), e));
        }

        @Override
        public void fatalError(TransformerException e) throws TransformerException {
            this.exceptions.add(Pair.of(this.getDescriptiveMessage(e), e));
        }

        @Override
        public void warning(TransformerException e) throws TransformerException {
            // just log these, no need to store them as errors
            logger.log(Level.WARNING, getDescriptiveMessage(e), e);
        }

        public List<Pair<String, Exception>> getErrorList() {
            return this.exceptions;
        }

        private String getDescriptiveMessage(TransformerException e) {
            if (e instanceof TransformerConfigurationException) {
                final TransformerConfigurationException ee  = (TransformerConfigurationException) e;
                return ee.getMessageAndLocation();
            } else if (e instanceof XPathException) {
                XPathException ee = (XPathException) e;
                return ee.getErrorCodeQName().getLocalPart() + " in " + ee.getHostLanguage() + ": " + ee.getMessageAndLocation();
            } else {
                return e.getMessageAndLocation();
            }
        }
    }

    /**
     * Thread-safe as long as you don't change Configuration, which we don't. See
     * https://saxonica.plan.io/boards/2/topics/5645.
     */
    private static final TransformerFactory FACTORY
            = TransformerFactory.newInstance("net.sf.saxon.TransformerFactoryImpl", XslTransformer.class.getClassLoader());

    private final Map<String, String> params = new HashMap<>();

    private final Transformer transformer;

    private static final Map<String, Templates> TEMPLATES = new HashMap<>();

    private static boolean useCache = true;

    public static void setUseCache(boolean use) {
        useCache = use;
    }

    static {
        FACTORY.setErrorListener(new CapturingErrorListener());
    }

    /**
     * Constructs a new transformer (and templates if not cached and cache is enabled) and caches the templates if caching is enabled.
     *
     * @param id
     * @param source
     * @return
     * @throws TransformerException
     */
    private static Transformer get(String id, StreamSource source) throws Exception {
        synchronized (TEMPLATES) {
            try {
                FACTORY.setErrorListener(new CapturingErrorListener()); // renew to remove old exceptions
                Function<String, Templates> gen = __ -> { try { return FACTORY.newTemplates(source); } catch (TransformerException e) { throw new RuntimeException(e); } };
                Templates t = (useCache ? TEMPLATES.computeIfAbsent(id, gen) : gen.apply(id));
                return t.newTransformer();
            } catch (Exception e) {
                CapturingErrorListener l = (CapturingErrorListener) FACTORY.getErrorListener();
                if (!l.getErrorList().isEmpty()) {
                    throw l.getErrorList().get(0).getRight();
                }
                throw e;
            }
        }
    }

    public XslTransformer(File stylesheet) throws Exception {
        transformer = get(stylesheet.getAbsolutePath(), new StreamSource(stylesheet));
    }

    public XslTransformer(String id, URI uri) throws Exception {
        transformer = get(id, new StreamSource(uri.toString()));
    }

    public XslTransformer(String id, Reader sheet) throws Exception {
        transformer = get(id, new StreamSource(sheet));
    }

    public XslTransformer(String id, String xsl) throws Exception {
        this(id, new StringReader(xsl));
    }

    public String transform(String source)
            throws TransformerException {
        StreamSource ssSource = new StreamSource(new StringReader(source));
        StringWriter result = new StringWriter();
        StreamResult streamResult = new StreamResult(result);

        synchronized (transformer) {
            for (Entry<String, String> e : params.entrySet()) {
                transformer.setParameter(e.getKey(), e.getValue());
            }

            transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
            //transformer.setOutputProperty(OutputKeys.INDENT, "yes");
            transformer.transform(ssSource, streamResult);
            transformer.reset();
        }

        return result.toString();
    }

    public <W extends Writer> W streamTransform(Reader source, W result)
            throws TransformerException {
        StreamSource ssSource = new StreamSource(source);
        StreamResult streamResult = new StreamResult(result);

        synchronized (transformer) {
            for (Entry<String, String> e : params.entrySet()) {
                transformer.setParameter(e.getKey(), e.getValue());
            }

            transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
            transformer.setOutputProperty(OutputKeys.INDENT, "yes");
            transformer.transform(ssSource, streamResult);
            transformer.reset();
        }
        return result;

    }

    public void addParameter(String key, String value) {
        params.put(key, value);
    }

    public void clearParameters() {
        params.clear();
    }
}
