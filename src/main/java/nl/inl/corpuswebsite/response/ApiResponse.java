package nl.inl.corpuswebsite.response;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import nl.inl.corpuswebsite.BaseResponse;
import nl.inl.corpuswebsite.utils.*;

import java.io.IOException;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;

import org.apache.commons.lang3.exception.ExceptionUtils;
import jakarta.servlet.http.HttpServletResponse;

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
        super("api", false);
    }

    @Override
    protected void completeRequest() throws QueryException {
        if (pathParameters.isEmpty()) throw new QueryException(HttpServletResponse.SC_NOT_FOUND, "No endpoint specified");
        String operation = pathParameters.get(0);
        if (operation.equalsIgnoreCase("docs")) docs();
        else if (operation.equalsIgnoreCase("info")) indexMetadata();
        else if (operation.equalsIgnoreCase("config")) siteConfig();
        else if (operation.equalsIgnoreCase("help")) help();
        else if (operation.equalsIgnoreCase("about")) about();
        else throw new QueryException(HttpServletResponse.SC_NOT_FOUND, "Unknown endpoint " + operation);
    }

     public void docs() throws QueryException {
        if (pathParameters.size() < 2) throw new QueryException(HttpServletResponse.SC_NOT_FOUND, "No document specified. Expected ${corpus}/docs/${docId}[/contents]");
        String document = pathParameters.get(1);
        boolean isContents = pathParameters.size() > 2 && pathParameters.get(2).equalsIgnoreCase("contents");
        if (isContents) documentContents(document);
        else documentMetadata(document);
    }

    public void documentContents(String docId) throws QueryException {
        if (this.corpus.isEmpty()) throw new QueryException(HttpServletResponse.SC_BAD_REQUEST, "No corpus specified");
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
        if (this.corpus.isEmpty()) throw new QueryException(HttpServletResponse.SC_BAD_REQUEST, "No corpus specified");
        new ArticleUtil(servlet, request, response).getTransformedMetadata(
            servlet.getCorpusConfig(corpus, request, response).mapError(QueryException::wrap).getOrThrow(),
            servlet.getWebsiteConfig(corpus),
            servlet.getGlobalConfig(),
            docId
        )
        .tapSelf(r -> sendResult(r, "text/html; charset=utf-8"));
    }

    public void indexMetadata() {
        if (this.corpus.isEmpty()) throw new QueryException(HttpServletResponse.SC_BAD_REQUEST, "No corpus specified");
        // Use public caching only for unauthenticated requests
        // This allows localStorage caching on the client for public corpora
        boolean isPublic = servlet.useCache(request);
        
        servlet.getCorpusConfig(corpus, request, response)
            .mapError(QueryException::wrap)
            .map(CorpusConfig::getJsonUnescaped)
            .tap(json -> serveWithETag(json, "application/json; charset=utf-8", isPublic))
            .mapError(ReturnToClientException::wrap)
            .throwIfError();
    }

    public void siteConfig() {
        boolean isPublic = servlet.useCache(request);

        Result.success(servlet.getWebsiteConfig(corpus))
            .map(WebsiteConfig.WebsiteConfigJson::new)
            .mapWithErrorHandling(config -> {
                ObjectMapper mapper = new ObjectMapper();
                mapper.enable(SerializationFeature.INDENT_OUTPUT);
                return mapper.writeValueAsString(config);
            })
            .tap(json -> serveWithETag(json, "application/json; charset=utf-8", isPublic))
            .mapError(ReturnToClientException::wrap)
            .throwIfError();
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
    private void serveWithETag(String content, String contentType, Date lastModified, boolean isPublic) {
        try {
            StaticFileHandler.serveContent(request, response, content, contentType, lastModified, isPublic);
        } catch (IOException e) {
            throw new ReturnToClientException(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
        }
    }

    public void help() {
        Result.attempt(() -> servlet.getHelpPage(corpus))
                .mapWithErrorHandling(servlet::parseAsTemplate)
                .mapWithErrorHandling(template -> {
                    StringWriter writer = new StringWriter();
                    template.merge(model, writer);
                    return writer.toString();
                })
                .mapError(QueryException::wrap)
                .tapSelf(r -> sendResult(r, "text/html; charset=utf-8"));
    }

    public void about() {
        Result.attempt(() -> servlet.getAboutPage(corpus))
                .mapWithErrorHandling(servlet::parseAsTemplate)
                .mapWithErrorHandling(template -> {
                    StringWriter writer = new StringWriter();
                    template.merge(model, writer);
                    return writer.toString();
                })
                .mapError(QueryException::wrap)
                .tapSelf(r -> sendResult(r, "text/html; charset=utf-8"));
    }

    protected void sendResult(Result<String, QueryException> r, String contentType) {
        r.tap(contents -> {
            try {
                response.setHeader("Content-Type", contentType);
                response.setCharacterEncoding(StandardCharsets.UTF_8.name());
                response.getWriter().write(contents);
                response.flushBuffer();
            } catch (IOException e) {
                throw ReturnToClientException.wrap(e);
            }
        }).tapError(error -> {
            throw ReturnToClientException.wrap(error);
        });
    }
}
