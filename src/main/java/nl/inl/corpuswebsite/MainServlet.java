/**
 * Copyright (c) 2010, 2012 Institute for Dutch Lexicology.
 * All rights reserved.
 *
 * @author VGeirnaert
 */
package nl.inl.corpuswebsite;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.Reader;
import java.io.StringReader;
import java.io.UnsupportedEncodingException;
import java.net.URISyntaxException;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import java.util.jar.Manifest;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import javax.servlet.ServletConfig;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.transform.TransformerConfigurationException;

import org.apache.commons.lang3.StringUtils;
import org.apache.commons.lang3.SystemUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.apache.velocity.Template;
import org.apache.velocity.app.Velocity;
import org.xml.sax.SAXException;

import nl.inl.corpuswebsite.response.AboutResponse;
import nl.inl.corpuswebsite.response.ArticleResponse;
import nl.inl.corpuswebsite.response.CorporaDataResponse;
import nl.inl.corpuswebsite.response.CorporaResponse;
import nl.inl.corpuswebsite.response.ErrorResponse;
import nl.inl.corpuswebsite.response.HelpResponse;
import nl.inl.corpuswebsite.response.SearchResponse;
import nl.inl.corpuswebsite.utils.CorpusConfig;
import nl.inl.corpuswebsite.utils.QueryServiceHandler;
import nl.inl.corpuswebsite.utils.QueryServiceHandler.QueryException;
import nl.inl.corpuswebsite.utils.WebsiteConfig;
import nl.inl.corpuswebsite.utils.XslTransformer;

/**
 * Main servlet class for the corpus application.
 *
 * Reads the config, initializes stuff and dispatches requests.
 */
public class MainServlet extends HttpServlet {

    private static final Logger logger = LogManager.getLogger(MainServlet.class);

    private static final String DEFAULT_PAGE = "corpora";

    /**
     * Where to find the Velocity properties file
     */
    private static final String VELOCITY_PROPERTIES = "/WEB-INF/config/velocity.properties";

    /**
     * Per-corpus configuration parameters (from search.xml)
     */
    private static final Map<String, WebsiteConfig> configs = new HashMap<>();

    /**
     * Per-corpus structure and configuration gotten from blacklab-server (IndexStructure)
     */
    private static final Map<String, CorpusConfig> corpusConfigs = new HashMap<>();

    /**
     * Our Velocity templates
     */
    private static final Map<String, Template> templates = new HashMap<>();

    /**
     * Xslt transformers for corpora
     */
    private static final Map<String, Optional<XslTransformer>> articleTransformers = new HashMap<>();

    /**
     * The response classes for our URI patterns
     */
    private static final Map<String, Class<? extends BaseResponse>> responses = new HashMap<>();

    /**
     * Our context path (first part of our URI path)
     */
    private String contextPath;

    // @formatter:off
    public static final String PROP_ANALYTICS_KEY           = "googleAnalyticsKey";
    /** Url to reach blacklab-server from this application */
    public static final String PROP_BLS_CLIENTSIDE          = "blsUrlExternal";
    /** Url to reach blacklab-server from the browser */
    public static final String PROP_BLS_SERVERSIDE          = "blsUrl";
    /** Where static content, custom xslt and other per-corpus data is stored */
    public static final String PROP_DATA_PATH               = "corporaInterfaceDataDir";
    /** Name of the default fallback directory/corpus in the PROP_DATA_PATH */
    public static final String PROP_DATA_DEFAULT            = "corporaInterfaceDefault";
    /** Number of words displayed by default on the /article/ page, also is a hard limit on the number */
    public static final String PROP_DOCUMENT_PAGE_LENGTH    = "wordend";
    // @formatter:on

    /**
     * Properties from the external config file, e.g. BLS URLs, Google Analytics
     * key, etc.
     * Several of these properties have defaults, take care to use getProperty() instead of direct get()
     */
    private Properties adminProps = new Properties();

    /**
     * Time the WAR was built. "UNKNOWN" if no WAR or some error occurs.
     */
    private static String warBuildTime = null;

    private static Properties getDefaultProps() {
        // @formatter:off
        Properties p = new Properties();
        p.setProperty(PROP_BLS_CLIENTSIDE,          "/blacklab-server"); // no domain to account for proxied servers
        p.setProperty(PROP_BLS_SERVERSIDE,          "http://localhost:8080/blacklab-server/");
        p.setProperty(PROP_DATA_PATH,               "/etc/blacklab/projectconfigs");
        p.setProperty(PROP_DATA_DEFAULT,            "default");
        p.setProperty(PROP_DOCUMENT_PAGE_LENGTH,    "5000");
        // not all properties may need defaults
        // @formatter:on

        if (SystemUtils.IS_OS_WINDOWS)
            p.setProperty(PROP_DATA_PATH, "C:\\etc\\blacklab\\projectconfigs");

        return p;
    }

    @Override
    public void init(ServletConfig cfg) throws ServletException {
        super.init(cfg);

        try {
            startVelocity(cfg);

            String warName = cfg.getServletContext().getContextPath().replaceAll("^/", "");
            contextPath = cfg.getServletContext().getContextPath();

            // Load the external properties file (for administration settings)
            String adminPropFileName = warName + ".properties";
            File adminPropFile = findPropertiesFile(adminPropFileName);
            adminProps = new Properties(getDefaultProps());

            if (adminPropFile == null || !adminPropFile.exists()) {
                logger
                    .info("File {} (with blsUrl and blsUrlExternal settings) not found in webapps, /etc/blacklab/ or temp dir; will use defaults",
                          adminPropFile);
            } else if (!adminPropFile.isFile()) {
                throw new ServletException("Annotation file " + adminPropFile + " is not a regular file!");
            } else if (!adminPropFile.canRead()) {
                throw new ServletException("Annotation file " + adminPropFile + " exists but is unreadable!");
            } else {
                // File exists and can be read. Read it.
                logger.info("Reading corpus-frontend property file: {}", adminPropFile);
                try (Reader in = new BufferedReader(new FileReader(adminPropFile))) {
                    adminProps.load(in);
                }
            }

            Enumeration<?> propKeys = adminProps.propertyNames();
            while (propKeys.hasMoreElements()) {
                String key = (String) propKeys.nextElement();
                if (!adminProps.containsKey(key))
                    logger.debug("Annotation {} not configured, using default: {}", key, adminProps.getProperty(key));
            }
            if (!Paths.get(adminProps.getProperty(PROP_DATA_PATH)).isAbsolute()) {
                throw new ServletException(PROP_DATA_PATH + " setting should be an absolute path");
            }
        } catch (ServletException e) {
            throw e;
        } catch (Exception e) {
            throw new ServletException(e);
        }

        // Map responses, the majority of these can be served for a specific corpus, or as a general autosearch page
        // E.G. the AboutResponse is mapped to /<root>/<corpus>/about and /<root>/about
        responses.put(DEFAULT_PAGE, CorporaResponse.class);
        responses.put("about", AboutResponse.class);
        responses.put("help", HelpResponse.class);
        responses.put("search", SearchResponse.class);
        responses.put("docs", ArticleResponse.class);
        responses.put("static", CorporaDataResponse.class);
    }

    /**
     * Looks for a property file with the specified name, either in the Tomcat
     * webapps dir, in /etc/blacklab on Unix or in the temp dir (/tmp on Unix,
     * %temp% on Windows).
     *
     * @param fileName property file name
     * @return the File or null if not found
     */
    private File findPropertiesFile(String fileName) {
        String configDir = System.getenv("AUTOSEARCH_CONFIG_DIR");
        if (configDir != null) {
            File fileInConfigDir = new File(configDir, fileName);
            if (fileInConfigDir.exists() && fileInConfigDir.canRead() && fileInConfigDir.isFile())
                return fileInConfigDir;
            else
                logger.info("AUTOSEARCH_CONFIG_DIR specifies file {} but it cannot be read", fileInConfigDir);
        }

        String warPath = getServletContext().getRealPath("/");
        if (warPath != null) {
            File fileInWebappsDir = new File(new File(warPath).getParentFile(), fileName);
            if (fileInWebappsDir.exists()) {
                return fileInWebappsDir;
            }
        } else {
            logger.info("(WAR was not extracted to file system; skip looking for {} file in webapps dir)", fileName);
        }

        boolean isWindows = SystemUtils.IS_OS_WINDOWS;
        File fileInEtc = new File("/etc/blacklab", fileName);
        if (!isWindows && !fileInEtc.exists()) {
            fileInEtc = new File("/vol1/etc/blacklab", fileName); // UGLY, will fix later
        }
        if (!isWindows && fileInEtc.exists()) {
            if (!fileInEtc.canRead()) {
                log("Found " + fileInEtc + " but cannot read; check permissions and SELinux context.");
            }
            return fileInEtc;
        }

        File tmpDir = isWindows ? new File(System.getProperty("java.io.tmpdir")) : new File("/tmp");
        File fileInTmpDir = new File(tmpDir, fileName);
        if (fileInTmpDir.exists()) {
            if (!fileInTmpDir.canRead()) {
                log("Found " + fileInTmpDir + " but cannot read; check permissions and SELinux context.");
            }
            return fileInTmpDir;
        }

        return null;
    }

    /**
     * Start the templating engine
     *
     * @param servletConfig configuration object
     * @throws Exception
     */
    private void startVelocity(ServletConfig servletConfig) throws Exception {
        Velocity.setApplicationAttribute("javax.servlet.ServletContext", servletConfig.getServletContext());

        Properties p = new Properties();
        try (InputStream is = getServletContext().getResourceAsStream(VELOCITY_PROPERTIES)) {
            p.load(is);
        }
        Velocity.init(p);
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

        // The template doesn't exist so we'll display an error page
        // it is important that the error template is available
        // or we'll end up in an infinite loop
        return getTemplate("error");
    }

    /**
     * Return the website config.
     *
     * @param corpus which corpus to read config for, may be null for the default config.
     * @return the website config
     */
    public WebsiteConfig getWebsiteConfig(String corpus) {
        return configs.computeIfAbsent(corpus, c -> {
            File f =
                getProjectFile(corpus, "search.xml")
                    .orElseThrow(() -> new IllegalStateException("No search.xml, and no default in jar either"));
            try {
                return new WebsiteConfig(f, corpus, getCorpusConfig(corpus), contextPath);
            } catch (Exception e) {
                throw new RuntimeException("Could not read search.xml " + f + ": " + e.getMessage());
            }
        });
    }

    /**
     * Get the corpus config (as returned from blacklab-server), if this is a valid corpus
     *
     * @param corpus name of the corpus
     * @return the config
     */
    public CorpusConfig getCorpusConfig(String corpus) {
        if (corpus == null || corpus.isEmpty()) {
            return null;
        }
        if (!corpusConfigs.containsKey(corpus)) {
            // Contact blacklab-server for the config xml file
            QueryServiceHandler handler = new QueryServiceHandler(getWebserviceUrl(corpus));

            try {
                String userId = getCorpusOwner(corpus);
                Map<String, String[]> params = new HashMap<>();

                String xmlConfig = getXml(userId, handler, params);

                String selectProperties = CorpusConfig.getSelectProperties(xmlConfig);

                if (!selectProperties.isEmpty()) {
                    // again retrieve config with values for props with uitype select
                    params.clear();
                    params.put("listvalues", new String[] {selectProperties});
                    xmlConfig = getXml(userId, handler, params);
                }

                // TODO tidy this up, the json is only used to embed the index data in the search page.
                // We might not need the xml data to begin with.
                params.clear();
                params.put("outputformat", new String[] { "json" });
                if (userId != null)
                    params.put("userid", new String[] { userId });
                String jsonResult = handler.makeRequest(params);

                corpusConfigs.put(corpus, new CorpusConfig(xmlConfig, jsonResult));
            } catch (IOException | SAXException | ParserConfigurationException | QueryException e) {
                return null;
            }
        }

        return corpusConfigs.get(corpus);
    }

    private static String getXml(String userId, QueryServiceHandler handler, Map<String, String[]> params) throws IOException, QueryException {
        params.put("outputformat", new String[] { "xml" });
        if (userId != null)
            params.put("userid", new String[] { userId });
        return handler.makeRequest(params);
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
            logger.warn(ex.getMessage(), ex);
        }

        /*
         * Map in the following way:
         * when the full uri contains at least 2 parts after the root (such as <root>/zeebrieven/search)
         * treat the first of those parts as the corpus, the second as the response to send,
         * and everything after that as arguments to build the response.
         * When only one part is present (such as <root>/help) treat the first part as the response to send.
         * When nothing is present, serve the default page.
         *
         * This does mean that pages outside the context of a corpus cannot have arguments in the form of extra parts in the URI
         * For instance <root>/help/searching would try to serve the nonexistant "searching" response in the context of the corpus "help"
         */
        // First strip out any leading items like "/" and our root
        String requestUri = request.getRequestURI();
        if (requestUri.startsWith(contextPath)) {
            requestUri = requestUri.substring(contextPath.length());
        }

        // Use apache stringutils split as it's much more sensible about omitting leading/trailing and empty strings.
        List<String> pathParts = Arrays.stream(StringUtils.split(requestUri, '/'))
            .map(s -> {
                try {
                    return URLDecoder.decode(s, StandardCharsets.UTF_8.name());
                } catch (UnsupportedEncodingException e) {
                    throw new IllegalStateException(e);
                }
            })
            .collect(Collectors.toList());

        String corpus = null;
        String page = null;
        List<String> pathParameters = pathParts.subList(Math.min(pathParts.size(), 2), pathParts.size()); // remainder of the url after the context root and page url, split on '/' and decoded.
        if (pathParts.isEmpty()) { // requested application root
            page = DEFAULT_PAGE;
        } else if (pathParts.size() == 1) { // <page>
            page = pathParts.get(0);
        } else if (pathParts.size() >= 2) { // <corpus>/<page>/...
            corpus = pathParts.get(0);
            page = pathParts.get(1);
            if (corpus.equals(adminProps.getProperty(PROP_DATA_DEFAULT)))
                corpus = null;
        }

        // Get response class
        Class<? extends BaseResponse> brClass = responses.getOrDefault(page, ErrorResponse.class);

        // Instantiate response class
        BaseResponse br;
        try {
            br = brClass.getConstructor().newInstance();
        } catch (Exception e) {
            throw new ServletException(e);
        }

        if (br.isCorpusRequired() && (corpus == null || corpus.isEmpty())) {
            try {
                response.sendError(HttpServletResponse.SC_NOT_FOUND);
            } catch (IOException e) {
                throw new ServletException(e);
            }

            return;
        }

        br.init(request, response, this, corpus, pathParameters);
        try {
            br.completeRequest();
        } catch (IOException e) {
            throw new ServletException(e);
        }
    }

    /**
     * Get a file from the directory belonging to this corpus and return it, attempting to get a default if that fails.
     * User corpora never have their own directory, and so will only use the locations for the defaults.
     *
     * <pre>
     * Tries in several locations:
     * - First try PROP_DATA_PATH/corpus/ directory (if configured, and this is not a user corpus)
     * - Then try PROP_DATA_PATH/PROP_DATA_DEFAULT directory (if configured)
     * - Finally try WEB-INF/interface-default
     * </pre>
     *
     * @param corpus - corpus for which to get the file. If null or a user-defined corpus only the default locations are
     *        checked.
     * @param filePath - path to the file relative to the directory for the corpus.
     * @return the file, if found
     */
    public final Optional<File> getProjectFile(String corpus, String filePath) {
        Optional<Path> dataDir = getIfValid(adminProps.getProperty(PROP_DATA_PATH));

        // Path the file in the corpus' data directory, only when a valid non-user corpus
        Optional<Path> corpusFile = dataDir
            .filter(path -> corpus != null && !corpus.isEmpty() && !isUserCorpus(corpus))
            .flatMap(p -> resolveIfValid(p, corpus))
            .flatMap(p -> resolveIfValid(p, filePath));

        // Path to the file in the default data directory, always available if configured correctly
        // see https://github.com/INL/corpus-frontend/pull/69
        Optional<Path> corpusFileDefault = dataDir
            .flatMap(p -> resolveIfValid(p, adminProps.getProperty(PROP_DATA_DEFAULT)))
            .flatMap(p -> resolveIfValid(p, filePath));

        File file = Stream.of(corpusFile, corpusFileDefault)
            .map(o -> o.map(Path::toFile).orElse(null))
            .filter(f -> f != null && f.exists() && f.canRead() && f.isFile())
            .findFirst()
            .orElseGet(() -> {
                // both the regular data directories didn't contain the file (or aren't configured, etc),
                // as a last resort, find a fallback file in the the jar directly
                try {
                    URL fileInJar = MainServlet.class.getResource("/interface-default/" + filePath);
                    return fileInJar != null ? new File(fileInJar.toURI()) : null;
                } catch (URISyntaxException e) {
                    return null;
                }
            });

        return Optional.ofNullable(file);
    }

    private static Optional<Path> getIfValid(String path) {
        if (path == null || path.isEmpty())
            return Optional.empty();

        try {
            return Optional.of(Paths.get(path));
        } catch (InvalidPathException e) {
            return Optional.empty();
        }
    }

    /**
     * Resolve the child again the parent and verify that the child is indeed a descendant.
     * Also handle null, illegal paths, empty strings and other such things.
     *
     * @param parent
     * @param child
     * @return the new path if everything is alright
     */
    private static Optional<Path> resolveIfValid(Path parent, String child) {
        try {
            return Optional.of(parent.resolve(child)).filter(resolved -> resolved.startsWith(parent) && !resolved.equals(parent)); // prevent upward directory traversal - child must be in parent
        } catch (Exception e) { // catch anything, a bit lazy but allows passing in null and empty strings etc
            return Optional.empty();
        }
    }

    /**
     * Get the stylesheet to convert an article from this corpus into an html
     * snippet suitable for inseting in the article.vm page.
     *
     * Looks for a file by the name of "article_corpusDataFormat.xsl", so "article_tei" for tei, etc.
     * Separate xslt  is used for metadata, see {@link ArticleResponse#completeRequest()}
     *
     * <pre>
     * First tries retrieving the file using {@link #getProjectFile(String, String)}
     * If that fails, tries contacting blacklab-server for an autogenerated best-effort xsl file.
     *  - Note that this only returns something corpusDataFormat describes XML-based documents.
     * </pre>
     *
     * NOTE: We don't generate a generic fallback xslt here on purpose.
     * If we did, we'd have to inspect all documents we want to transform to see if they're actually XML,
     * since we'd return the default xslt even when blacklab returns 404 because the format isn't xml-based.
     * If we instead return empty optional when this happens, then we only need to inspect documents for which we can't get
     * a transformer, and can easily tell if they're xml documents or some other document/file type.
     *
     * @param corpus
     * @param corpusDataFormat
     * @return the xsl transformer to use for transformation, note that this is always the same transformer.
     */
    public Optional<XslTransformer> getStylesheet(String corpus, String corpusDataFormat) {
        // @formatter:off

        // need to use corpus name in the cache map
        // because corpora can define their own xsl files in their own data directory
        // (this is common with - but not exclusive to - metadata stylesheets, that are all named "article_meta.xsl")
        String key = corpus + "_" + corpusDataFormat;
        return articleTransformers.computeIfAbsent(key, __ -> {
            Optional<File> file = getProjectFile(corpus, "article_" + corpusDataFormat + ".xsl");

            XslTransformer trans = file.map(f -> {
                try { return new XslTransformer(f);}
                catch (TransformerConfigurationException e) {
                    logger.debug("Error loading stylesheet {} for corpus {} : {}", file.get(), corpus, e.getMessage());
                    return null;
                }
            })
            .orElseGet(() -> {
                logger.debug("Attempting to get xsl {} for corpus {} from blacklab...", corpusDataFormat, corpus);

                try {
                    QueryServiceHandler handler = new QueryServiceHandler(getWebserviceUrl(null) + "input-formats/" + corpusDataFormat + "/xslt");
                    Map<String, String[]> params = new HashMap<>();
                    String sheet = handler.makeRequest(params);
                    return new XslTransformer(new StringReader(sheet));
                } catch (TransformerConfigurationException | IOException | QueryException e) {
                    logger.debug("Error getting or using stylesheet for format {} from blacklab : {}", corpusDataFormat, e.getMessage());
                    return null;
                }
            });

            return Optional.ofNullable(trans);
        });
        // @formatter:on
    }

    public InputStream getHelpPage(String corpus) {
        try {
            return new FileInputStream(getProjectFile(corpus, "help.inc").get());
        } catch (FileNotFoundException e) {
            throw new IllegalStateException(e); // this file always exists
        }
    }

    public InputStream getAboutPage(String corpus) {
        try {
            return new FileInputStream(getProjectFile(corpus, "about.inc").get());
        } catch (FileNotFoundException e) {
            throw new IllegalStateException(e); // this file always exists
        }
    }

    /**
     * Get the url to blacklab-server for this corpus. The url will always end
     * in "/"
     *
     * @param corpus the corpus for which to generate the url, if null, the base
     *        blacklab-server url will be returned.
     * @return the url
     */
    public String getWebserviceUrl(String corpus) {
        String url = adminProps.getProperty(PROP_BLS_SERVERSIDE);
        if (!url.endsWith("/")) {
            url += "/";
        }

        if (corpus != null && !corpus.isEmpty()) {
            url += corpus + "/";
        }
        return url;
    }

    public String getExternalWebserviceUrl(String corpus) {
        String url = adminProps.getProperty(PROP_BLS_CLIENTSIDE);
        if (!url.endsWith("/")) {
            url += "/";
        }
        if (corpus != null && corpus.length() > 0) {
            url += corpus + "/";
        }
        return url;
    }

    public String getGoogleAnalyticsKey() {
        return adminProps.getProperty(PROP_ANALYTICS_KEY, "");
    }

    public int getWordsToShow() {
        try {
            return Integer.parseInt(adminProps.getProperty(PROP_DOCUMENT_PAGE_LENGTH));
        } catch (NumberFormatException e) {
            return 5000;
        }
    }

    /**
     * Return a timestamp for when the application was built.
     *
     * @return build timestamp (format: yyyy-MM-dd HH:mm:ss), or UNKNOWN if the
     *         timestamp could not be found for some reason (i.e. not running from a
     *         JAR, or JAR was not created with the Ant buildscript).
     */
    public String getWarBuildTime() {
        if (warBuildTime != null)
            return warBuildTime;

        try (InputStream inputStream = getServletContext().getResourceAsStream("/META-INF/MANIFEST.MF")) {
            return warBuildTime = Optional.ofNullable(inputStream)
                .map(is -> { try { return new Manifest(is); } catch (IOException e) { return null; } })
                .map(Manifest::getMainAttributes)
                .map(a -> a.getValue("Build-Time"))
                .filter(s -> !s.isEmpty())
                .orElse("UNKNOWN");
        } catch (IOException e) {
            return warBuildTime = "UNKNOWN";
        }
    }

    public Properties getAdminProps() {
        return adminProps;
    }

    /**
     *
     * @param url
     * @param request used to get the path for the current page
     * @return relativized url
     */
    public static String getRelativeUrl(String url, HttpServletRequest request) {
        String fromUrl = request.getServletPath();
        boolean trailingSegment = fromUrl.endsWith("/"); // when source url does not end in '/' we need to do one less '../'

        String[] from = StringUtils.split(fromUrl, "/");
        String[] to = StringUtils.split(url, "/");

        int i = 0;
        while (i < from.length && i < to.length && from[i].equals(to[i]))
            ++i;

        List<String> parts = new ArrayList<>();
        parts.add("."); // handle the case of empty urls

        for (int j = i; j < from.length - (trailingSegment ? 0 : 1); ++j)
            parts.add("..");

        for (int j = i; j < to.length; ++j)
            parts.add(to[j]);

        return StringUtils.join(parts, "/");
    }

    public static boolean isUserCorpus(String corpus) {
        return corpus != null && corpus.indexOf(':') != -1;
    }

    public static String getCorpusName(String corpus) {
        if (corpus == null) {
            return null;
        }

        int i = corpus.indexOf(':');
        if (i != -1) {
            return corpus.substring(i + 1);
        }

        return corpus;
    }

    public static String getCorpusOwner(String corpus) {
        if (corpus == null) {
            return null;
        }

        int i = corpus.indexOf(':');
        if (i != -1) {
            return corpus.substring(0, i);
        }

        return null;
    }
}
