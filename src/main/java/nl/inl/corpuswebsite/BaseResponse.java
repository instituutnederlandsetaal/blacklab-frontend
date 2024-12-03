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
import java.util.Optional;
import java.util.logging.Logger;

import javax.servlet.ServletException;
import javax.servlet.http.Cookie;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.apache.velocity.Template;
import org.apache.velocity.VelocityContext;
import org.apache.velocity.app.event.EventCartridge;
import org.apache.velocity.app.event.ReferenceInsertionEventHandler;
import org.apache.velocity.tools.generic.DateTool;
import org.apache.velocity.tools.generic.EscapeTool;

import nl.inl.corpuswebsite.utils.GlobalConfig;
import nl.inl.corpuswebsite.utils.GlobalConfig.Keys;
import nl.inl.corpuswebsite.utils.QueryException;
import nl.inl.corpuswebsite.utils.ReturnToClientException;
import nl.inl.corpuswebsite.utils.WebsiteConfig;

public abstract class BaseResponse {
    protected static final Logger logger = Logger.getLogger(BaseResponse.class.getName());

    protected static final String OUTPUT_ENCODING = "UTF-8";

    protected static final EscapeTool esc = new EscapeTool();
    protected static final DateTool date = new DateTool();

    protected MainServlet servlet;

    protected HttpServletRequest request;

    protected HttpServletResponse response;

    /** Velocity template variables */
    protected final VelocityContext model = new VelocityContext();

    protected String name = "";

    /** Does this response require a corpus to be set? */
    private final boolean requiresCorpus;

    /**
     * The corpus this response is being generated for.
     * When on contextRoot/zeebrieven/*, this response is in the context of the zeebrieven corpus.
     * When on contextRoot/*, this response is not in the context of any corpus.
     * If {@link #requiresCorpus} is true, this response will only be used in the context of a corpus.
     */
    protected Optional<String> corpus = Optional.empty();

    /**
     * Whatever path/url segments followed after the page that cause this response to be served.
     * Has been split on '/' and decoded
     */
    protected List<String> pathParameters = null;

    /**
     * @param requiresCorpus when set, causes an exception to be thrown when {@link BaseResponse#corpus} is not set when
     *        {@link #completeRequest()} is called.
     */
    protected BaseResponse(String name, boolean requiresCorpus) {
        this.name = name;
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
    public void init(HttpServletRequest request, HttpServletResponse response, MainServlet servlet, Optional<String> corpus, List<String> pathParameters) throws ServletException {
        if (this.requiresCorpus && corpus.isEmpty()) {
        	throw new ServletException("Response requires a corpus");
        }
        this.request = request;
        this.response = response;
        this.servlet = servlet;
        this.corpus = corpus;
        this.pathParameters = pathParameters;
        WebsiteConfig cfg = servlet.getWebsiteConfig(corpus);
        GlobalConfig globalCfg = servlet.getGlobalConfig();

        // Allow all origins on all requests
        this.response.addHeader("Access-Control-Allow-Origin", "*");

        // Utils
        model.put("esc", esc);
        model.put("date", date);
        // For use in queryParameters to ensure clients don't cache old css/js when the application has updated.
        model.put("cache", GlobalConfig.commitHash);
        // title of the current page
        model.put("page", this.name);

        // Stuff for use in constructing the page
        model.put("websiteConfig", cfg);

        // Version info
        model.put("commitHash", GlobalConfig.commitHash);
        model.put("commitTime", GlobalConfig.commitTime);
        model.put("commitMessage", GlobalConfig.commitMessage);
        model.put("version", GlobalConfig.version);

        cfg.getAnalyticsKey().ifPresent(key -> model.put("googleAnalyticsKey", key));

        Optional.ofNullable(globalCfg.get(Keys.BANNER_MESSAGE))
                .filter(msg -> !this.isCookieSet("banner-hidden", Integer.toString(msg.hashCode())))
                .ifPresent(msg -> {
                    model.put("bannerMessage", msg);
                    model.put("bannerMessageCookie",
                                "banner-hidden="+msg.hashCode()+
                                "; Max-Age="+24*7*3600+
                                "; Path="+globalCfg.get(Keys.CF_URL_ON_CLIENT)+"/");
        });

        model.put("JSPATH", globalCfg.get(Keys.JSPATH));
        model.put("FRONTEND_WITH_CREDENTIALS", globalCfg.getBool(Keys.FRONTEND_WITH_CREDENTIALS));

        // Clientside js variables (some might be used in vm directly)
        model.put("CF_URL_ON_CLIENT", globalCfg.get(Keys.CF_URL_ON_CLIENT));
        // The config setting never ends in a slash, but in the past it did,
        // Preserve this as clientside js/user scripts might rely on this.
        model.put("BLS_URL_ON_CLIENT", globalCfg.get(Keys.BLS_URL_ON_CLIENT) + "/");

        // OIDC
        model.put("OIDC_AUTHORITY", globalCfg.get(Keys.OIDC_AUTHORITY));
        model.put("OIDC_METADATA_URL", globalCfg.get(Keys.OIDC_METADATA_URL));
        model.put("OIDC_CLIENT_ID", globalCfg.get(Keys.OIDC_CLIENT_ID));

        model.put("displayName", cfg.getDisplayName());
        model.put("displayNameIsFallback", cfg.displayNameIsFallback());

        // HTML-escape all data written into the velocity templates by default
        // Only allow access to the raw string if the expression contains the word "unescaped"
        EventCartridge cartridge = model.getEventCartridge();
        if (cartridge == null) {
            cartridge = new EventCartridge();
            cartridge.addReferenceInsertionEventHandler(new ReferenceInsertionEventHandler() {
                /**
                 * @param expression string as in the .vm template, such as "$object.value()"
                 * @param value the resolved value
                 */
                @Override
                public Object referenceInsert(String expression, Object value) {
                    boolean escape = !expression.toLowerCase().contains("unescaped");
                    String val = value != null ? value.toString() : "";

                    return escape ? esc.html(val) : val;
                }
            });
            model.attachEventCartridge(cartridge);
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
            template.merge(model, osw);
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
     * @throws IOException On general IO problems (i.e. not our code).
     * @throws ReturnToClientException When flow was aborted somewhere deep in the code, and we just want to abort completely. But we do want to pass a message and status code.
     * @throws QueryException When some error occurred that might be recoverable further up the stack (such as BlackLab not having a certain index).
     */
    protected abstract void completeRequest() throws IOException, ReturnToClientException, QueryException;

    public boolean isCorpusRequired() {
        return requiresCorpus;
    }

    public Optional<Cookie> getCookie(String name) {
        return Optional.ofNullable(request.getCookies()).flatMap(cc -> Arrays.stream(cc).filter(t -> t.getName().equals(name)).findFirst());
    }

    public boolean isCookieSet(String name, String value) {
        return this.getCookie(name).filter(c -> c.getValue().equals(value)).isPresent();
    }
}
