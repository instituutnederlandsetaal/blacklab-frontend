package nl.inl.corpuswebsite.utils;

import java.util.Optional;
import java.util.logging.Logger;
import java.util.regex.Pattern;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.apache.commons.lang3.StringUtils;
import org.apache.commons.lang3.exception.ExceptionUtils;

import nl.inl.corpuswebsite.MainServlet;
import nl.inl.corpuswebsite.utils.GlobalConfig.Keys;

/**
 * <pre>
 * Collection of functions to retrieve document contents/metadata/xsl stylesheets from BlackLab and transform them
 * There is quite a bit of logic in handling pagination, as BlackLab has some peculiarities with values touching document boundaries.
 * This class is used by the ArticleResponse and ApiResponse classes.
 *
 * The functions require quite a bit of info due to some unfortunate design in the various info objects.
 * The CorpusConfig holds the data format of the corpus (tei, folia, etc.), which we need to resolve the correct stylesheet.
 * The GlobalConfig holds the directory where we can find these stylesheets.
 * The WebsiteConfig holds the page size of the corpus, which we need to calculate pagination.
 * The MainServlet hold our xslt cache.
 * </pre>
 */
public class ArticleUtil {

    private static final Logger logger = Logger.getLogger(ArticleUtil.class.getName());

    /** Matches xml open/void tags &lt;namespace:tagname attribute="value"/&gt; excluding hl tags, as those are inserted by blacklab and can result in false positives */
    private static final Pattern XML_TAG_PATTERN = Pattern.compile("<([\\w]+:)?((?!(hl|blacklabResponse|[xX][mM][lL])\\b)[\\w.]+)(\\s+[\\w\\.:]+=\"[:/()='+\\-\\w\\s,]*\")*/?>");

    private final MainServlet servlet;
    private final HttpServletRequest request;
    private final HttpServletResponse response;

    public ArticleUtil(MainServlet servlet, HttpServletRequest request, HttpServletResponse response) {
        this.servlet = servlet;
        this.request = request;
        this.response = response;
    }

    public Result<String, QueryException> getDocumentMetadata(WebsiteConfig corpus, GlobalConfig config, String docId) {
        return new BlackLabApi(request, response, config)
                .getDocumentMetadata(corpus.getCorpusId().orElseThrow(), docId)
                .mapError(e -> {
                    // when blacklab returns 401, we need to return a 401 to the user (unauthorized - IE you can't do this unless you log in - please log in and try again)
                    // when blacklab returns 403, we need to also return 403, (forbidden - IE you're logged in, but you're still not allowed.)
                    if (e.getHttpStatusCode() == HttpServletResponse.SC_UNAUTHORIZED) return new QueryException(HttpServletResponse.SC_UNAUTHORIZED, "Please log in to view this document.");
                    if (e.getHttpStatusCode() == HttpServletResponse.SC_FORBIDDEN) return new QueryException(HttpServletResponse.SC_FORBIDDEN, "Administrator has restricted access to this document.");
                    else return new QueryException(e.getHttpStatusCode(), "An error occurred while retrieving document contents from BlackLab: \n" + e.getMessage());
                });
    }

    public Result<String, QueryException> getDocumentContent(WebsiteConfig corpusConfig, GlobalConfig config, String docId, PaginationInfo page) {

        // Search a different field than the one we're displaying content from?
        // (used for parallel corpora, where a query can return hits from a different field than the one that was searched,
        //  e.g. search the contents__en field using query rfield('the' -->nl _, 'nl') to find the Dutch translation of 'the')
        Optional<String> fieldToShow = getParameter("field", request); // required
        Optional<String> fieldToSearch = getParameter("searchfield", request); // optional, only if different
        Optional<String> queryTargetField = fieldToSearch.isPresent() ? fieldToShow : Optional.empty();

        return new BlackLabApi(request, response, config)
            .getDocumentContents(
                    corpusConfig.getCorpusId().orElseThrow(),
                    docId,
                    fieldToShow,
                    fieldToSearch,
                    optTargetField(getParameter("query", request), queryTargetField),
                    getParameter("pattgapdata", request),
                    page.blacklabPageStart,
                    page.blacklabPageEnd
            )
            .mapError(e -> {
                // when blacklab returns 401, we need to return a 401 to the user (unauthorized - IE you can't do this unless you log in - please log in and try again)
                // when blacklab returns 403, we need to also return 403, (forbidden - IE you're logged in, but you're still not allowed.)
                if (e.getHttpStatusCode() == HttpServletResponse.SC_UNAUTHORIZED) return new QueryException(HttpServletResponse.SC_UNAUTHORIZED, "Please log in to view this document.");
                if (e.getHttpStatusCode() == HttpServletResponse.SC_FORBIDDEN) return new QueryException(HttpServletResponse.SC_FORBIDDEN, "Documents in this corpus cannot be displayed, because the owner has disabled this feature.");
                else return new QueryException(e.getHttpStatusCode(), "An error occurred while retrieving document contents from BlackLab: \n" + e.getMessage());
            });
    }

    /**
     * Optionally request hits from a specific target field (parallel corpora).
     *
     * This is done by adding <code>rfield(..., targetField)</code> to the query.
     */
    private Optional<String> optTargetField(Optional<String> query, Optional<String> targetfield) {
        if (query.isPresent() && targetfield.isPresent()) {
            String f = targetfield.get().replaceAll("'", "\\'");
            return Optional.of("rfield(" + query.get() + ", '" + f + "')");
        }
        return query;
    }

    /**
     * Every time we run an xslt transformation, we need to add some standard parameters.
     * These are defined and documented in the builtin search.xml 
     * The user can add their own parameters there.
     * Take care to update the search.xml file if you add new parameters here.
     * @param trans
     * @param config
     * @param corpus
     */
    private void addStandardXsltParameters(XslTransformer trans, GlobalConfig config, WebsiteConfig corpus) {
        String baseUrl = config.get(Keys.CF_URL_ON_CLIENT);
        String corpusId = corpus.getCorpusId().orElseThrow();
        String corpusUrl = baseUrl + "/" + corpus.getCorpusId().orElseThrow();

        // contextRoot is deprecated, but still used in some stylesheets.
        trans.addParameter("contextRoot", baseUrl);
        trans.addParameter("contextPath", baseUrl);
        trans.addParameter("corpusId", corpusId);
        trans.addParameter("corpusPath", corpusUrl);
        corpus.getXsltParameters().forEach(trans::addParameter);
    }

    /**
     *
     * @param corpus required for page size
     * @param corpusMetadata required for page size
     * @param config required for authenticating with BlackLab
     * @param docId required for retrieving the document
     * @param docMetadata required for pagination (need to know document length). Will be retrieved if not provided.
     * @return the transformed document contents or an exception if the transformation failed, network failed, etc.
     */
    public Result<String, QueryException> getTransformedDocument(
            WebsiteConfig corpus,
            CorpusConfig corpusMetadata,
            GlobalConfig config,
            String docId,
            Result<String, QueryException> docMetadata
    ) {
        // Metadata required for pagination (need to know document length)
        Result<String, QueryException> metadata = docMetadata.or(() -> getDocumentMetadata(corpus, config, docId));
        PaginationInfo pagination = getPaginationInfo(corpus, request, metadata);
        Result<String, QueryException> contents = getDocumentContent(corpus, config, docId, pagination);

        return transformDocument(corpus, corpusMetadata, config, contents);
    }

    public Result<String, QueryException> getTransformedMetadata(
        CorpusConfig corpus,
        WebsiteConfig corpusConfig,
        GlobalConfig config,
        String docId
    ) {
        Result<String, QueryException> meta = getDocumentMetadata(corpusConfig, config, docId);
        return transformMetadata(corpus, corpusConfig, config, meta);
    }

    private Result<String, QueryException> transformDocument(WebsiteConfig corpus, CorpusConfig corpusMetadata, GlobalConfig config, Result<String, QueryException> contents) {
        return contents.flatMap(c -> {
            // If the document contents aren't xml, don't bother with the transformer.
            if (!XML_TAG_PATTERN.matcher(c).find()) {
                return Result.success("<pre>" + StringUtils.replaceEach(c,
                        new String[]{"<hl>", "</hl>"},
                        new String[]{"<span class=\"hl\">", "</span>"}
                ) + "</pre>");
            }

            // we managed to get the contents, and they're definitely xml.
            // Load the transformer.
            return servlet.getStylesheet(corpusMetadata, "article", request, response)
                    .tap(trans -> this.addStandardXsltParameters(trans, config, corpus))
                    .mapWithErrorHandling(trans -> trans.transform(c))
                    .mapError(e -> new QueryException(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "An error occurred while transforming document contents: \n" + e.getMessage() + "\n" + ExceptionUtils.getStackTrace(e)));
        });
    }

    public Result<String, QueryException> transformMetadata(CorpusConfig corpus, WebsiteConfig corpusConfig, GlobalConfig config, Result<String, QueryException> metadata) {
        return metadata.flatMap(md ->
            servlet.getStylesheet(corpus,"meta",request, response)
            .tap(trans -> this.addStandardXsltParameters(trans, config, corpusConfig))
            .mapWithErrorHandling(trans -> trans.transform(md))
            .mapError(e -> new QueryException(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "An error occurred while transforming document metadata contents: \n" + e.getMessage() + "\n" + ExceptionUtils.getStackTrace(e)))
        );
    }

    public static Optional<String> getParameter(String name, HttpServletRequest request) {
        return Optional.ofNullable(request.getParameter(name)).map(StringUtils::trimToNull);
    }

    public static Optional<Integer> getIntParameter(String name, HttpServletRequest request) {
        return getParameter(name, request).map(p -> {
            try {
                return Integer.parseInt(p);
            } catch (NumberFormatException e) {
                logger.fine(String.format("Could not parse parameter '%s', value '%s'. Returning null", name, p));
                return null;
            }
        });
    }

    public static PaginationInfo getPaginationInfo(WebsiteConfig corpusConfig, HttpServletRequest request, Result<String, QueryException> documentMetadata) {
        Optional<Integer> pageSize = corpusConfig.getPageSize();
        Optional<Integer> pageStart = getIntParameter("wordstart", request);
        Optional<Integer> pageEnd = getIntParameter("wordend", request);
        Optional<Integer> hitStart = getIntParameter("findhit", request);
        String field = getParameter("field", request).orElse(null);
        return new PaginationInfo(pageSize, documentMetadata, pageStart, pageEnd, hitStart, field);
    }
}
