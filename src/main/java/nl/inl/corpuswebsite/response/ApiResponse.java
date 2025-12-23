package nl.inl.corpuswebsite.response;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import javax.servlet.http.HttpServletResponse;

import nl.inl.corpuswebsite.BaseResponse;
import nl.inl.corpuswebsite.utils.ArticleUtil;
import nl.inl.corpuswebsite.utils.CorpusConfig;
import nl.inl.corpuswebsite.utils.QueryException;
import nl.inl.corpuswebsite.utils.Result;
import nl.inl.corpuswebsite.utils.ReturnToClientException;
import nl.inl.corpuswebsite.utils.StaticFileHandler;

/**
 * We need a rudimentary API for some of the content that needs to processed serverside.
 * At the moment that's these 3 items:
 * - document metadata      /${corpus}/api/docs/${id}           - show the metadata for the document, transformed with the 'meta.xsl' stylesheet for the corpus.
 * - document contents      /${corpus}/api/docs/${id}/contents  - show the document's content, transformed with the appropriate 'article.xsl' stylesheet for the corpus.
 * - index metadata         /${corpus}/api/info                 - Return a json of the indexmetadata from BlackLab, but with annotation values listed.
 * <br>
 *  We needed an API because there's a chicken-and-egg situation when rendering a page for which a user would need to log in.
 *  To show the search page, we require the corpus metadata from BL, but to get it, we need user credentials, but to get those, the user needs a page to log in.
 *  So that doesn't work. Instead, split up page loading into two stages
 *  - initial setup, which renders a login button, etc.
 *  - population/hydration, which downloads the relevant info from this API, which now becomes possible, because the user has had the change to log in.
 */
public class ApiResponse extends BaseResponse {
    public ApiResponse() {
        super("api", true);
    }

    // TODO this could probably be cleaned up a little.
    @Override
    protected void completeRequest() throws QueryException {
        if (pathParameters.isEmpty()) throw new QueryException(HttpServletResponse.SC_NOT_FOUND, "No endpoint specified");
        String operation = pathParameters.get(0);
        if (operation.equalsIgnoreCase("docs")) {
            if (pathParameters.size() < 2) throw new QueryException(HttpServletResponse.SC_NOT_FOUND, "No document specified. Expected ${corpus}/docs/${docid}[/contents]");
            String document = pathParameters.get(1);
            boolean isContents = pathParameters.size() > 2 && pathParameters.get(2).equalsIgnoreCase("contents");
            if (isContents) documentContents(document);
            else documentMetadata(document);
        } else if (operation.equalsIgnoreCase("info")) {
            indexMetadata();
        } else throw new QueryException(HttpServletResponse.SC_NOT_FOUND, "Unknown endpoint " + operation);
    }

    public void documentContents(String docId) throws QueryException {
        new ArticleUtil(servlet, request, response).getTransformedDocument(
            servlet.getWebsiteConfig(corpus),
            servlet.getCorpusConfig(corpus, request, response).mapError(QueryException::wrap).getOrThrow(),
            servlet.getGlobalConfig(),
            docId,
            Result.empty()
        )
        .tapSelf(r -> sendResult(r, "text/html; charset=utf-8"));
    }

    public void documentMetadata(String docId) throws QueryException {
        new ArticleUtil(servlet, request, response).getTransformedMetadata(
            servlet.getCorpusConfig(corpus, request, response).mapError(QueryException::wrap).getOrThrow(),
            servlet.getWebsiteConfig(corpus),
            servlet.getGlobalConfig(),
            docId
        )
        .tapSelf(r -> sendResult(r, "text/html; charset=utf-8"));
    }

    public void indexMetadata() {
        // Use public caching only for unauthenticated requests
        // This allows localStorage caching on the client for public corpora
        boolean isPublic = servlet.useCache(request);
        
        servlet.getCorpusConfig(corpus, request, response)
            .mapError(QueryException::wrap)
            .map(CorpusConfig::getJsonUnescaped)
            .tap(json -> serveWithETag(json, "application/json; charset=utf-8", isPublic))
            .tapError(e -> { throw new ReturnToClientException(e); });
    }

    /**
     * Serve content with ETag support for caching.
     * Used for corpus info endpoint where the content doesn't change frequently.
     * 
     * @param content The content to serve
     * @param contentType The content type
     * @param isPublic If true, response can be cached by shared caches (proxies/CDNs) and localStorage.
     *                 If false, only the browser's private HTTP cache can store the response.
     */
    private void serveWithETag(String content, String contentType, boolean isPublic) {
        try {
            StaticFileHandler.serveContent(request, response, content, contentType, isPublic);
        } catch (IOException e) {
            throw new ReturnToClientException(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
        }
    }

    protected void sendResult(Result<String, QueryException> r, String contentType) {
        r.tap(contents -> {
            try {
                response.setHeader("Content-Type", contentType);
                response.setCharacterEncoding(StandardCharsets.UTF_8.name());
                response.getWriter().write(contents);
                response.flushBuffer();
            } catch (IOException e) {
                throw new ReturnToClientException(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
            }
        }).tapError(error -> {
            throw new ReturnToClientException(error);
        });
    }






}
