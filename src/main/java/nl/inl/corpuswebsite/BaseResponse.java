/**
 * Copyright (c) 2010, 2012 Institute for Dutch Lexicology.
 * All rights reserved.
 *
 * @author VGeirnaert
 */
package nl.inl.corpuswebsite;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.util.Arrays;
import java.util.List;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.apache.velocity.Template;
import org.apache.velocity.VelocityContext;
import org.apache.velocity.app.event.EventCartridge;
import org.apache.velocity.app.event.ReferenceInsertionEventHandler;
import org.apache.velocity.context.Context;
import org.apache.velocity.tools.generic.EscapeTool;

public abstract class BaseResponse {
    protected static final Logger logger = LogManager.getLogger(BaseResponse.class);

    private static final String OUTPUT_ENCODING = "UTF-8";

    protected static final EscapeTool esc = new EscapeTool();

    protected MainServlet servlet;

    protected HttpServletRequest request;

    protected HttpServletResponse response;

    /** Velocity template variables */
    protected VelocityContext context = new VelocityContext();

    /** Does this response require a corpus to be set? */
    private boolean requiresCorpus = false;

    /**
     * The corpus this response is being generated for.
     * When on contextRoot/zeebrieven/*, this response is in the context of the zeebrieven corpus.
     * When on contextRoot/*, this response is not in the context of any corpus.
     * If {@link #requiresCorpus} is true, this response will only be used in the context of a corpus.
     */
    protected String corpus = null;

    /**
     * Whatever path/url segments followed after the page that cause this response to be served.
     * Has been split on '/' and decoded
     */
    protected List<String> pathParameters = null;

    /**
     * @param requiresCorpus when set, causes an exception to be thrown when {@link BaseResponse#corpus} is not set when
     *        {@link #completeRequest()} is called.
     */
    protected BaseResponse(boolean requiresCorpus) {
        this.requiresCorpus = requiresCorpus;
    }

    /**
     * Initialise this object with:
     *
     * NOTE: this function will throw an exception if corpus is required but not provided,
     * or when a required parameter is missing.
     *
     * @param request the HTTP request object.
     * @param response the HTTP response object.
     * @param servlet our servlet.
     * @param corpus (optional) the corpus for which this response is generated.
     * @param pathParameters trailing path segments in the original request uri, so the part behind the response's path
     * @throws ServletException when corpus is required but missing.
     */
    public void init(HttpServletRequest request, HttpServletResponse response, MainServlet servlet, String corpus, List<String> pathParameters)
        throws ServletException {
        if ((corpus == null || corpus.isEmpty()) && this.requiresCorpus)
            throw new ServletException("Response requires a corpus");

        this.request = request;
        this.response = response;
        this.servlet = servlet;
        this.corpus = corpus;
        this.pathParameters = pathParameters;

        context.put("esc", esc);
        context.put("websiteConfig", this.servlet.getWebsiteConfig(corpus));
        /*
         * TODO this doesn't work if the client lands on server.com/corpus-frontend without trailing slash,
         * we'd need to insert the context root in the relative url, which we don't know in a reverse proxy situation.
         * Instead..for the time being use an absolute url.
         * context.put("pathToTop", MainServlet.getRelativeUrl("/", request));
         */
        context.put("pathToTop", servlet.getServletContext().getContextPath());
        // For use in queryParameters to ensure clients don't cache old css/js when the application has updated.
        // During development, there's usually no WAR, so no build time either, but we assume the developer knows to ctrl+f5
        context.put("cache", servlet.getWarBuildTime().hashCode());
        context.put("googleAnalyticsKey", this.servlet.getGoogleAnalyticsKey());
        context.put("brandLink", corpus == null ? "" : corpus + "/" + "search");
        context.put("buildTime", servlet.getWarBuildTime());

        // Escape all data written into the velocity templates by default
        // Only allow access to the raw string if the expression contains the word "unescaped"
        EventCartridge cartridge = context.getEventCartridge();
        if (cartridge == null) {
            cartridge = new EventCartridge();
            cartridge.addReferenceInsertionEventHandler(new ReferenceInsertionEventHandler() {
                /**
                 * @param expression string as in the .vm template, such as "$object.value()"
                 * @param value the resolved value
                 */
                @Override
                public Object referenceInsert(Context context, String expression, Object value) {
                    boolean escape = !expression.toLowerCase().contains("unescaped");
                    String val = value != null ? value.toString() : "";

                    return escape ? esc.html(val) : val;
                }
            });
            context.attachEventCartridge(cartridge);
        }

    }

    /**
     * Display a specific template, with specific mime type
     *
     * @param template template to display
     * @param mimeType mime type to set
     */
    protected void displayTemplate(Template template, String mimeType) {
        // Set the content headers for the response
        response.setCharacterEncoding(OUTPUT_ENCODING);
        response.setContentType(mimeType);

        // Merge context into the page template and write to output stream
        try (OutputStreamWriter osw = new OutputStreamWriter(response.getOutputStream(), OUTPUT_ENCODING)) {
            template.merge(context, osw);
            osw.flush();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Display a template with the HTML mime type
     *
     * @param template the xslt template instance
     */
    protected void displayHtmlTemplate(Template template) {
        displayTemplate(template, "text/html");
    }

    /**
     * Returns the value of a servlet parameter, or the default value
     *
     * @param name name of the parameter
     * @param defaultValue default value
     * @return value of the paramater
     */
    public String getParameter(String name, String defaultValue) {
        // get the trimmed parameter value
        String value = request.getParameter(name);

        if (value != null) {
            value = value.trim();

            // if the parameter value is an empty string
            if (value.length() == 0)
                value = defaultValue;
        } else {
            value = defaultValue;
        }

        return value;
    }

    /**
     * Returns the value of a servlet parameter, or the default value
     *
     * @param name name of the parameter
     * @param defaultValue default value
     * @return value of the paramater
     */
    public int getParameter(String name, int defaultValue) {
        final String stringToParse = getParameter(name, "" + defaultValue);
        try {
            return Integer.parseInt(stringToParse);
        } catch (NumberFormatException e) {
            logger.info("Could not parse parameter '{}', value '{}'. Using default ({})", name, stringToParse, defaultValue);
            return defaultValue;
        }
    }

    /**
     * Returns the value of a servlet parameter, or the default value.
     *
     * @param name name of the parameter
     * @param defaultValue default value
     * @return value of the paramater
     */
    public boolean getParameter(String name, boolean defaultValue) {
        return getParameter(name, defaultValue ? "on" : "").equals("on");
    }

    public Integer getParameter(String name, Integer defaultValue) {
        final String stringToParse = getParameter(name, "" + defaultValue);

        return Integer.parseInt(stringToParse);
    }

    public String[] getParameterValues(String name, String defaultValue) {
        String[] values = request.getParameterValues(name);

        if (values == null)
            values = new String[] { defaultValue };

        return values;
    }

    public List<String> getParameterValuesAsList(String name, String defaultValue) {
        return Arrays.asList(getParameterValues(name, defaultValue));
    }

    protected abstract void completeRequest() throws IOException;

    public boolean isCorpusRequired() {
        return requiresCorpus;
    }
}
