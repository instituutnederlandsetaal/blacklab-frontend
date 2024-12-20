/**
 * Copyright (c) 2010, 2012 Institute for Dutch Lexicology.
 * All rights reserved.
 *
 * @author VGeirnaert
 */
package nl.inl.corpuswebsite;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.StringReader;
import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import java.util.function.Function;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.stream.Collectors;

import javax.servlet.ServletConfig;
import javax.servlet.ServletContext;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.xml.transform.TransformerException;

import org.apache.commons.configuration2.ex.ConfigurationException;
import org.apache.commons.io.IOUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.velocity.Template;
import org.apache.velocity.app.Velocity;
import org.apache.velocity.runtime.RuntimeServices;
import org.apache.velocity.runtime.RuntimeSingleton;
import org.apache.velocity.runtime.parser.ParseException;
import org.apache.velocity.runtime.resource.util.StringResourceRepository;

import nl.inl.corpuswebsite.response.ApiResponse;
import nl.inl.corpuswebsite.response.ConfigResponse;
import nl.inl.corpuswebsite.response.CorporaDataResponse;
import nl.inl.corpuswebsite.response.IndexResponse;
import nl.inl.corpuswebsite.response.OidcCallbackResponse;
import nl.inl.corpuswebsite.utils.BlackLabApi;
import nl.inl.corpuswebsite.utils.CorpusConfig;
import nl.inl.corpuswebsite.utils.CorpusFileUtil;
import nl.inl.corpuswebsite.utils.GlobalConfig;
import nl.inl.corpuswebsite.utils.GlobalConfig.Keys;
import nl.inl.corpuswebsite.utils.QueryException;
import nl.inl.corpuswebsite.utils.Result;
import nl.inl.corpuswebsite.utils.ReturnToClientException;
import nl.inl.corpuswebsite.utils.WebsiteConfig;
import nl.inl.corpuswebsite.utils.XslTransformer;

/**
 * Main servlet class for the corpus application.
 * Reads the config, initializes stuff and dispatches requests.
 */
public class MainServlet extends HttpServlet {

    private static final Logger logger = Logger.getLogger(MainServlet.class.getName());

    private static final Class<? extends BaseResponse> DEFAULT_PAGE = IndexResponse.class;

    /**
     * Where to find the Velocity properties file
     */
    private static final String VELOCITY_PROPERTIES = "/WEB-INF/config/velocity.properties";

    /**
     * Per-corpus configuration parameters (from search.xml)
     */
    private static final Map<String, WebsiteConfig> configs = new HashMap<>();

    /**
     * Our Velocity templates
     */
    private static final Map<String, Template> templates = new HashMap<>();

    /**
     * Xslt transformers for corpora
     */
    private static final Map<String, Result<XslTransformer, TransformerException>> articleTransformers = new HashMap<>();

    /**
     * The response classes for our URI patterns
     */
    private static final Map<String, Class<? extends BaseResponse>> responses = new HashMap<>();

    private GlobalConfig config;

    @Override
    public void init(ServletConfig cfg) throws ServletException {
        try {
            super.init(cfg);

            ServletContext ctx = cfg.getServletContext();
            this.config = GlobalConfig.getInstance();
            startVelocity(ctx);

            XslTransformer.setUseCache(this.useCache(null));
            BlackLabApi.setBlsUrl(config.get(Keys.BLS_URL_ON_SERVER));

            // Map responses, the majority of these can be served for a specific corpus, or as a general autosearch page
            // E.G. the AboutResponse is mapped to /<root>/<corpus>/about and /<root>/about
            responses.put("", IndexResponse.class);
            responses.put("static", CorporaDataResponse.class);
            responses.put("config", ConfigResponse.class);
            responses.put("api", ApiResponse.class);
            responses.put("callback", OidcCallbackResponse.class);
        } catch (ServletException e) {
            throw e;
        } catch (Exception e) {
            throw new ServletException(e);
        }
    }

    /**
     * Start the templating engine. Loading settings from {@link #VELOCITY_PROPERTIES}
     *
     * @param ctx configuration object
     * @throws IOException if the velocity config file could not be read
     */
    private void startVelocity(ServletContext ctx) throws IOException {
        // Read in the WebApplicationResourceLoader
        Velocity.setApplicationAttribute(ServletContext.class.getName(), ctx);

        Properties p = new Properties();
        try (InputStream is = getServletContext().getResourceAsStream(VELOCITY_PROPERTIES)) {
            p.load(is);
        }
        Velocity.init(p);
    }

    public Template parseAsTemplate(InputStream is) {
        try {
            String templateContent = IOUtils.toString(new InputStreamReader(is, StandardCharsets.UTF_8));
            RuntimeServices runtimeServices = RuntimeSingleton.getRuntimeServices();
            StringReader reader = new StringReader(templateContent);
            Template template = new Template();
            template.setRuntimeServices(runtimeServices);

            /*
             * The following line works for Velocity version up to 1.7
             * For version 2, replace "Template name" with the variable, template
             */
            template.setData(runtimeServices.parse(reader, "__template__"));
            template.initDocument();
            return template;
        } catch (IOException e) {
            throw new RuntimeException("Failed to read template content from InputStream", e);
        } catch (ParseException e) {
            throw new RuntimeException("Failed to parse template content", e);
        }
    }


    /**
     * Get the velocity template
     *
     * @param templateName name of the template, excluding filename (.vm) suffix
     * @return velocity template
     */
    public synchronized Template getTemplate(String templateName) {
        templateName = templateName + ".vm";

        if (Velocity.resourceExists(templateName)) {
            if (templates.containsKey(templateName)) {
                return templates.get(templateName);
            }

            try {
                Template t = Velocity.getTemplate(templateName, "utf-8");
                templates.put(templateName, t);
                return t;
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }

        // The template doesn't exist, so we'll display an error page
        // it is important that the error template is available,
        // or we'll end up in an infinite loop
        if (templateName.equals("error.vm")) {
            throw new RuntimeException("Could not find error template, giving up");
        }
        return getTemplate("error");
    }

    /**
     * Return the website config.
     *
     * @param corpus which corpus to read config for, may be null for the default config.
     * @return the website config
     */
    public synchronized WebsiteConfig getWebsiteConfig(Optional<String> corpus) {
        Function<String, WebsiteConfig> gen = __ ->
            getProjectFile(corpus, "search.xml")
            .map(configFile -> {
                try { return new WebsiteConfig(configFile, config.get(Keys.CF_URL_ON_CLIENT), corpus); }
                catch (ConfigurationException e) { throw new RuntimeException("Could not read search.xml " + configFile, e); }
            })
            .orElseThrow(() -> new IllegalStateException("No search.xml, and no default in jar either"));

        return useCache(null) ? configs.computeIfAbsent(corpus.orElse(null), gen) : gen.apply(corpus.orElse(null));
    }

    // TODO use network-level caching or something, so we automatically handle lifetime, authentication, etc.
    private static final Map<String, Result<CorpusConfig, Exception>> configCache = new HashMap<>();
    /**
     * Get the corpus config (as returned from blacklab-server), if this is a valid corpus
     *
     * @param corpus name of the corpus
     * @return the config
     */
    public Result<CorpusConfig, Exception> getCorpusConfig(Optional<String> corpus, HttpServletRequest request, HttpServletResponse response) {
        // Should only cache when not using authorization, otherwise result may be different across different requests.
        // Also disable caching for user-corpora, as access permissions may change.

        // Contact blacklab-server for the config xml file if we have a corpus
        Function<String, Result<CorpusConfig, Exception>> gen = c -> new BlackLabApi(request, response, this.config).getCorpusConfig(c);
        synchronized (configCache) {
            return Result
                    .from(corpus)
                    .flatMap(c -> useCache(request) ? configCache.computeIfAbsent(c, gen) : gen.apply(c))
                    .orError(() -> new FileNotFoundException("No corpus specified"));
        }
    }

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException {
        processRequest(request, response);
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException {
        processRequest(request, response);
    }

    private void processRequest(HttpServletRequest request, HttpServletResponse response) throws ServletException {
        try {
            request.setCharacterEncoding("utf-8");
        } catch (UnsupportedEncodingException ex) {
            logger.log(Level.WARNING, "Failed to set utf-8 encoding on request", ex);
        }

        /*
         * Map in the following way:
         * when the full uri contains at least 2 parts after the root (such as <root>/some_corpus/search)
         * treat the first of those parts as the corpus, the second as the response to send,
         * and everything after that as arguments to build the response.
         * When only one part is present (such as <root>/help) treat the first part as the response to send.
         * When nothing is present, serve the default page.
         *
         * This does mean that pages outside the context of a corpus cannot have arguments in the form of extra parts in the URI
         * For instance <root>/help/searching would try to serve the nonexistant "searching" response in the context of the corpus "help"
         */
        // First strip out any leading items like "/" and our root
        // (use the actual contextpath here, since we're already behind any proxy.
        String requestUri = StringUtils.substringAfter(request.getRequestURI(), request.getContextPath());

        // Use apache stringutils split as it's much more sensible about omitting leading/trailing and empty strings.
        List<String> pathParts = Arrays.stream(StringUtils.split(requestUri, '/'))
            .map(s -> URLDecoder.decode(s, StandardCharsets.UTF_8))
            .collect(Collectors.toList());

        Class<? extends BaseResponse> responseClass;
        String corpus;
        List<String> pathParameters;

        if (pathParts.isEmpty()) {
            // don't have any path. E.g. /corpus-frontend
            responseClass = DEFAULT_PAGE;
            corpus = null;
            pathParameters = new ArrayList<>();
        } else {
            String part1 = pathParts.remove(0);
            if (responses.containsKey(part1)) {
                // matched a page directly. E.g. /corpus-frontend/help
                responseClass = responses.get(part1);
                corpus = null;
                pathParameters = new ArrayList<>(pathParts);
            } else if (pathParts.isEmpty()) {
                // Didn't match a page, and there's nothing else. Redirect to search page. E.g. /corpus-frontend/corpus
                logger.fine(String.format("Unknown page '%s' requested - might be a corpus, redirecting to search page", part1));
                response.setStatus(HttpServletResponse.SC_MOVED_PERMANENTLY);
                response.setHeader("location", this.config.get(Keys.CF_URL_ON_CLIENT) + "/" + part1 + "/search/");
                return;
            } else {
                // Didn't match a page, and there's more parts. This is a corpus, the second part is the page. E.g. /corpus-frontend/corpus/search
                corpus = part1;
                String pageOrCorpus = pathParts.remove(0);
                responseClass = responses.getOrDefault(pageOrCorpus, IndexResponse.class);
                pathParameters = new ArrayList<>(pathParts);
            }
        }

        try {
            try {
                BaseResponse br = responseClass.getConstructor().newInstance();
                if (br.isCorpusRequired() && (corpus == null || corpus.isBlank())) {
                    response.sendError(HttpServletResponse.SC_NOT_FOUND);
                    return;
                }

                br.init(request, response, this, Optional.ofNullable(corpus), pathParameters);
                br.completeRequest();
            } catch (QueryException e) {
                if (e.getHttpStatusCode() != HttpServletResponse.SC_OK) {
                    response.sendError(e.getHttpStatusCode(), e.getMessage());
                } else {
                    response.getWriter().write(e.getMessage());
                }
            } catch (ReturnToClientException e) {
                if (e.getCode() != HttpServletResponse.SC_OK)
                    response.sendError(e.getCode(), e.getMessage());
                else if (e.getMessage() != null)
                    response.getWriter().write(e.getMessage());
            }
        } catch (Exception e) {
            throw new ServletException(e);
        }
    }

    /**
     * <pre>
     * Wrapper for caching compiled xslt.
     * See {@link CorpusFileUtil#getStylesheet(CorpusConfig, GlobalConfig, String, HttpServletRequest, HttpServletResponse)}
     * </pre>
     * @param corpus - corpus to get the stylesheet for
     * @param name - the name of the stylesheet, excluding extension (currently supported "article" and "meta")
     * @return the xsl transformer to use for transformation, note that this is always the same transformer.
     */
    public Result<XslTransformer, TransformerException> getStylesheet(CorpusConfig corpus, String name, HttpServletRequest request, HttpServletResponse response) {
        Optional<String> corpusDataFormat = corpus.getCorpusDataFormat();
        Function<String, Result<XslTransformer, TransformerException>> gen = __ -> CorpusFileUtil.getStylesheet(corpus, config, name, request, response);

        // need to use corpus name in the cache map
        // because corpora can define their own xsl files in their own data directory
        String key = corpus + "_" + corpusDataFormat.orElse("missing-format") + "_" + name;
        return this.useCache(request) ? articleTransformers.computeIfAbsent(key, gen) : gen.apply(key);
    }

    public Optional<File> getProjectFile(Optional<String> corpus, String file) {
        return CorpusFileUtil.getProjectFile(
                config.get(Keys.CORPUS_CONFIG_DIR),
                corpus,
                Optional.ofNullable(config.get(Keys.DEFAULT_CORPUS_CONFIG)),
                Optional.of(file));
    }

    public InputStream getHelpPage(Optional<String> corpus) {
        return Result.from(getProjectFile(corpus, "help.inc"))
                .mapWithErrorHandling(FileInputStream::new)
                .getOrThrow(IllegalStateException::new); // this file always exists (at least the fallback in our own jar)
    }

    public InputStream getAboutPage(Optional<String> corpus) {
        return Result.from(getProjectFile(corpus, "about.inc"))
                .mapWithErrorHandling(FileInputStream::new)
                .getOrThrow(IllegalStateException::new); // this file always exists (at least the fallback in our own jar)
    }

    /**
     * Check whether caching of things is enabled.
     * @param request if supplied, check if the request contains authentication parameters (according to AUTH_SOURCE_NAME and AUTH_SOURCE_TYPE), and return false if it does.
     *                If not supplied, check if the global config allows caching.
     * @return whether the use the cache for this request
     */
    public boolean useCache(HttpServletRequest request) {
        Optional<String> auth = Optional.ofNullable(request).flatMap(r -> BlackLabApi.readRequestParameter(r, config.get(Keys.AUTH_SOURCE_TYPE), config.get(Keys.AUTH_SOURCE_NAME)));
        return Boolean.parseBoolean(this.config.get(Keys.CACHE)) && auth.isEmpty();
    }

    /** Render debug info checkbox in the search interface? */
    public boolean debugInfo() {
        return Boolean.parseBoolean(this.config.get(Keys.SHOW_DEBUG_CHECKBOX_ON_CLIENT));
    }

    public GlobalConfig getGlobalConfig() {
        return config;
    }
}
